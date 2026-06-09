import { AiUserRole } from "../types";

export type VoiceRatePreset = "slow" | "normal" | "fast";

export type VoiceSettings = {
  autoSpeak: boolean;
  selectedVoiceURI: string | null;
  ratePreset: VoiceRatePreset;
};

type SpeakOptions = {
  role?: AiUserRole;
  rate?: number;
  pitch?: number;
  lang?: string;
  voiceURI?: string | null;
  ratePreset?: VoiceRatePreset;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
  onNotice?: (message: string) => void;
};

const VOICE_SETTINGS_KEY = "voiceSettings";
const DEFAULT_SETTINGS: VoiceSettings = {
  autoSpeak: true,
  selectedVoiceURI: null,
  ratePreset: "normal",
};

export const preferredVoiceKeywords = [
  "Microsoft Xiaoxiao",
  "Microsoft Yunxi",
  "Microsoft Yaoyao",
  "Tingting",
  "Sinji",
  "Mei-Jia",
  "Google 普通话",
  "Google Mandarin",
  "Chinese",
  "zh-CN",
  "Mandarin",
];

export const NO_NATURAL_CHINESE_VOICE_MESSAGE =
  "当前浏览器没有更自然的中文语音，将使用系统默认语音。";
export const CLOUD_TTS_UNCONFIGURED_MESSAGE =
  "云端语音服务未配置，已使用浏览器朗读。";

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

export function isSpeechSupported(): boolean {
  return hasWindow() && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function normalizeRatePreset(value: unknown): VoiceRatePreset {
  return value === "slow" || value === "fast" || value === "normal" ? value : "normal";
}

export function loadVoiceSettings(): VoiceSettings {
  if (!hasWindow()) return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(VOICE_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
    return {
      autoSpeak: typeof parsed.autoSpeak === "boolean" ? parsed.autoSpeak : true,
      selectedVoiceURI: typeof parsed.selectedVoiceURI === "string" ? parsed.selectedVoiceURI : null,
      ratePreset: normalizeRatePreset(parsed.ratePreset),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveVoiceSettings(patch: Partial<VoiceSettings>): VoiceSettings {
  const next: VoiceSettings = {
    ...loadVoiceSettings(),
    ...patch,
    selectedVoiceURI:
      typeof patch.selectedVoiceURI === "string" && patch.selectedVoiceURI.trim()
        ? patch.selectedVoiceURI
        : patch.selectedVoiceURI === null
          ? null
          : loadVoiceSettings().selectedVoiceURI,
    ratePreset: normalizeRatePreset(patch.ratePreset ?? loadVoiceSettings().ratePreset),
  };
  if (hasWindow()) {
    window.localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(next));
  }
  return next;
}

export function getAllVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSupported()) return [];
  return window.speechSynthesis.getVoices();
}

export function getChineseVoices(voices = getAllVoices()): SpeechSynthesisVoice[] {
  return voices.filter((voice) => {
    const text = `${voice.name} ${voice.lang} ${voice.voiceURI}`.toLowerCase();
    return (
      text.includes("zh") ||
      text.includes("chinese") ||
      text.includes("mandarin") ||
      text.includes("普通话") ||
      text.includes("中文") ||
      text.includes("國語")
    );
  });
}

function voiceScore(voice: SpeechSynthesisVoice, role: AiUserRole): number {
  const text = `${voice.name} ${voice.lang} ${voice.voiceURI}`.toLowerCase();
  const keywordIndex = preferredVoiceKeywords.findIndex((keyword) => text.includes(keyword.toLowerCase()));
  const keywordScore = keywordIndex >= 0 ? 200 - keywordIndex * 8 : 0;
  const localeScore = voice.lang.toLowerCase() === "zh-cn" ? 40 : voice.lang.toLowerCase().startsWith("zh") ? 24 : 0;
  const roleScore =
    role === "child" && /(xiaoxiao|yaoyao|tingting|mei-jia|female|女)/i.test(text)
      ? 18
      : role === "elder" && /(yunxi|xiaoxiao|mandarin|普通话)/i.test(text)
        ? 14
        : 0;
  const localScore = voice.localService ? 4 : 0;
  return keywordScore + localeScore + roleScore + localScore;
}

export function selectChineseVoice(
  selectedVoiceURI?: string | null,
  role: AiUserRole = "elder"
): SpeechSynthesisVoice | null {
  const voices = getAllVoices();
  if (selectedVoiceURI) {
    const selected = voices.find((voice) => voice.voiceURI === selectedVoiceURI);
    if (selected) return selected;
  }
  const chineseVoices = getChineseVoices(voices);
  if (!chineseVoices.length) return null;
  return [...chineseVoices].sort((a, b) => voiceScore(b, role) - voiceScore(a, role))[0] ?? null;
}

function rateForRole(role: AiUserRole | undefined, preset: VoiceRatePreset): number {
  if (role === "child") {
    if (preset === "slow") return 0.95;
    if (preset === "fast") return 1.05;
    return 1;
  }
  if (preset === "slow") return 0.82;
  if (preset === "fast") return 0.9;
  return 0.86;
}

function pitchForRole(role: AiUserRole | undefined): number {
  return role === "child" ? 1.1 : 0.98;
}

function ttsMode(): "browser" | "api" {
  return import.meta.env.VITE_TTS_MODE === "api" ? "api" : "browser";
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

export function stopSpeaking(): void {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
}

function speakWithBrowser(text: string, options: SpeakOptions): void {
  if (!isSpeechSupported()) {
    options.onError?.();
    return;
  }

  stopSpeaking();
  const settings = loadVoiceSettings();
  const role = options.role ?? "elder";
  const selectedVoice = selectChineseVoice(options.voiceURI ?? settings.selectedVoiceURI, role);
  const utterance = new SpeechSynthesisUtterance(text);

  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang || "zh-CN";
  } else {
    utterance.lang = options.lang ?? "zh-CN";
    options.onNotice?.(NO_NATURAL_CHINESE_VOICE_MESSAGE);
  }

  utterance.rate = options.rate ?? rateForRole(role, options.ratePreset ?? settings.ratePreset);
  utterance.pitch = options.pitch ?? pitchForRole(role);
  utterance.volume = 1;
  utterance.onstart = () => options.onStart?.();
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = () => options.onError?.();

  try {
    window.speechSynthesis.speak(utterance);
  } catch {
    options.onError?.();
  }
}

async function speakWithApiFallback(text: string, options: SpeakOptions): Promise<void> {
  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        role: options.role ?? "elder",
        voiceURI: options.voiceURI ?? loadVoiceSettings().selectedVoiceURI,
        ratePreset: options.ratePreset ?? loadVoiceSettings().ratePreset,
      }),
      signal: timeoutSignal(8000),
    });
    if (!response.ok) {
      options.onNotice?.(CLOUD_TTS_UNCONFIGURED_MESSAGE);
      speakWithBrowser(text, options);
      return;
    }
    const data = (await response.json().catch(() => ({}))) as { audioUrl?: string; message?: string };
    if (!data.audioUrl) {
      options.onNotice?.(data.message || CLOUD_TTS_UNCONFIGURED_MESSAGE);
      speakWithBrowser(text, options);
      return;
    }
    const audio = new Audio(data.audioUrl);
    audio.onplay = () => options.onStart?.();
    audio.onended = () => options.onEnd?.();
    audio.onerror = () => {
      options.onNotice?.(CLOUD_TTS_UNCONFIGURED_MESSAGE);
      speakWithBrowser(text, options);
    };
    await audio.play();
  } catch {
    options.onNotice?.(CLOUD_TTS_UNCONFIGURED_MESSAGE);
    speakWithBrowser(text, options);
  }
}

export function speakText(text: string, options: SpeakOptions = {}): void {
  const clean = text.trim();
  if (!clean) return;

  if (ttsMode() === "api") {
    void speakWithApiFallback(clean, options);
    return;
  }

  speakWithBrowser(clean, options);
}
