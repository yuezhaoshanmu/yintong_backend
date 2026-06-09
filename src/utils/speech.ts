import { AiUserRole } from "../types";

export type VoiceRatePreset = "slow" | "normal" | "fast";

export type TtsState =
  | "idle"
  | "loading_voices"
  | "ready"
  | "speaking"
  | "blocked"
  | "unsupported"
  | "error";

export type VoiceSettings = {
  autoSpeak: boolean;
  selectedVoiceURI: string | null;
  ratePreset: VoiceRatePreset;
};

type SpeakOptions = {
  role?: AiUserRole;
  auto?: boolean;
  rate?: number;
  pitch?: number;
  lang?: string;
  voiceURI?: string | null;
  ratePreset?: VoiceRatePreset;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
  onNotice?: (message: string) => void;
};

type ActiveSpeech = {
  utterance: SpeechSynthesisUtterance;
  stopExpected: boolean;
  keepAliveTimer: number | null;
  resolve: () => void;
  reject: (error: Error) => void;
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
  "Google 普通话",
  "Google Mandarin",
  "Tingting",
  "zh-CN",
  "Chinese",
  "Mandarin",
];

export const NO_NATURAL_CHINESE_VOICE_MESSAGE =
  "当前浏览器没有更自然的中文语音，将使用系统默认语音。";
export const CLOUD_TTS_UNCONFIGURED_MESSAGE =
  "云端语音服务未配置，已使用浏览器朗读。";

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;
let activeSpeech: ActiveSpeech | null = null;

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
  const current = loadVoiceSettings();
  const next: VoiceSettings = {
    ...current,
    ...patch,
    selectedVoiceURI:
      typeof patch.selectedVoiceURI === "string" && patch.selectedVoiceURI.trim()
        ? patch.selectedVoiceURI
        : patch.selectedVoiceURI === null
          ? null
          : current.selectedVoiceURI,
    ratePreset: normalizeRatePreset(patch.ratePreset ?? current.ratePreset),
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

export async function loadChineseVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!isSpeechSupported()) return [];
  const currentVoices = window.speechSynthesis.getVoices();
  if (currentVoices.length > 0) return getChineseVoices(currentVoices);
  if (voicesPromise) return voicesPromise;

  voicesPromise = new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timeoutId);
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      voicesPromise = null;
      resolve(getChineseVoices(window.speechSynthesis.getVoices()));
    };
    const timeoutId = window.setTimeout(finish, 1200);
    window.speechSynthesis.addEventListener("voiceschanged", finish);
  });

  return voicesPromise;
}

function voiceScore(voice: SpeechSynthesisVoice, role: AiUserRole): number {
  const text = `${voice.name} ${voice.lang} ${voice.voiceURI}`.toLowerCase();
  const keywordIndex = preferredVoiceKeywords.findIndex((keyword) => text.includes(keyword.toLowerCase()));
  const keywordScore = keywordIndex >= 0 ? 240 - keywordIndex * 12 : 0;
  const localeScore = voice.lang.toLowerCase() === "zh-cn" ? 60 : voice.lang.toLowerCase().startsWith("zh") ? 36 : 0;
  const roleScore =
    role === "child" && /(xiaoxiao|yaoyao|tingting|female|女)/i.test(text)
      ? 18
      : role === "elder" && /(yunxi|xiaoxiao|mandarin|普通话)/i.test(text)
        ? 14
        : 0;
  const localScore = voice.localService ? 4 : 0;
  return keywordScore + localeScore + roleScore + localScore;
}

export function getPreferredChineseVoice(role: AiUserRole): SpeechSynthesisVoice | null {
  const chineseVoices = getChineseVoices();
  if (!chineseVoices.length) return null;
  return [...chineseVoices].sort((a, b) => voiceScore(b, role) - voiceScore(a, role))[0] ?? null;
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
  return getPreferredChineseVoice(role);
}

function rateForRole(role: AiUserRole, preset: VoiceRatePreset): number {
  if (role === "child") {
    if (preset === "slow") return 0.92;
    if (preset === "fast") return 1.08;
    return 1;
  }
  if (preset === "slow") return 0.78;
  if (preset === "fast") return 0.94;
  return 0.85;
}

function pitchForRole(role: AiUserRole): number {
  return role === "child" ? 1.1 : 0.95;
}

function messageForSpeechError(options: SpeakOptions): string {
  return options.auto
    ? "浏览器暂时阻止了自动朗读，请点击播放按钮。"
    : "朗读失败，请手动重试。";
}

function clearActiveSpeechTimer(speech: ActiveSpeech): void {
  if (speech.keepAliveTimer != null) {
    window.clearInterval(speech.keepAliveTimer);
    speech.keepAliveTimer = null;
  }
}

export function stopSpeaking(): void {
  if (!isSpeechSupported()) return;
  if (activeSpeech) {
    activeSpeech.stopExpected = true;
    clearActiveSpeechTimer(activeSpeech);
  }
  window.speechSynthesis.cancel();
  activeSpeech = null;
}

export async function speakText(text: string, options: SpeakOptions = {}): Promise<void> {
  const clean = text.trim();
  if (!clean) return;

  if (!isSpeechSupported()) {
    const message = "当前浏览器不支持语音朗读，请阅读文字回复。";
    options.onError?.(message);
    throw new Error(message);
  }

  stopSpeaking();
  await loadChineseVoices();

  return new Promise((resolve, reject) => {
    const settings = loadVoiceSettings();
    const role = options.role ?? "elder";
    const utterance = new SpeechSynthesisUtterance(clean);
    const selectedVoice = selectChineseVoice(options.voiceURI ?? settings.selectedVoiceURI, role);
    let didFinish = false;
    let didStart = false;
    let startFallbackTimer: number | null = null;
    const speech: ActiveSpeech = {
      utterance,
      stopExpected: false,
      keepAliveTimer: null,
      resolve,
      reject,
    };

    const finish = () => {
      if (didFinish) return;
      didFinish = true;
      if (activeSpeech === speech) activeSpeech = null;
      if (startFallbackTimer != null) {
        window.clearTimeout(startFallbackTimer);
        startFallbackTimer = null;
      }
      clearActiveSpeechTimer(speech);
    };

    const fail = (message: string) => {
      finish();
      options.onError?.(message);
      reject(new Error(message));
    };

    activeSpeech = speech;

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
    utterance.onstart = () => {
      if (didStart) return;
      didStart = true;
      options.onStart?.();
    };
    utterance.onend = () => {
      finish();
      if (!speech.stopExpected) options.onEnd?.();
      resolve();
    };
    utterance.onerror = (event) => {
      if (speech.stopExpected || event.error === "interrupted" || event.error === "canceled") {
        finish();
        resolve();
        return;
      }
      fail(messageForSpeechError(options));
    };

    speech.keepAliveTimer = window.setInterval(() => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }, 9000);

    try {
      window.speechSynthesis.speak(utterance);
      startFallbackTimer = window.setTimeout(() => {
        if (didFinish || didStart) return;
        if (window.speechSynthesis.speaking) {
          didStart = true;
          options.onStart?.();
          return;
        }
        fail(messageForSpeechError(options));
      }, 4000);
    } catch {
      fail(messageForSpeechError(options));
    }
  });
}
