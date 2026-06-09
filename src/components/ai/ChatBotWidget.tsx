import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Loader2,
  Mic,
  Phone,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { AppUser } from "../../auth";
import { askAiAssistant, AssistantRole } from "../../services/aiAssistantService";
import { checkDeepSeekHealth, DeepSeekMessage, getAiAssistantMode } from "../../services/deepseekClient";
import { AiChatMessage, ChildTask, MemoryStory, ToastKind } from "../../types";
import { useSilverStore } from "../../store";
import {
  isSpeechSupported,
  loadChineseVoices,
  loadVoiceSettings,
  NO_NATURAL_CHINESE_VOICE_MESSAGE,
  saveVoiceSettings,
  speakText,
  stopSpeaking,
  TtsState,
  VoiceRatePreset,
  VoiceSettings,
} from "../../utils/speech";
import {
  createSpeechRecognizer,
  isSpeechRecognitionSupported,
  SpeechRecognitionState,
} from "../../utils/speechRecognition";
import AiVoiceCallPanel from "./AiVoiceCallPanel";

export type ChatBotWidgetProps = {
  role: AssistantRole;
  currentUser: AppUser;
  currentStory?: MemoryStory;
  currentTask?: ChildTask;
  onInsertToStoryDraft?: (text: string) => void;
  onSendToFamily?: (text: string) => void;
  onShowToast: (message: string, type?: ToastKind) => void;
};

const quickActions: Record<AssistantRole, string[]> = {
  elder: ["帮我整理这段回忆", "帮我给孩子回一句话", "帮我想一个故事标题", "陪我聊聊天"],
  child: ["给我一点提示", "再讲一遍爷爷的故事", "这个物品为什么对？", "我想给爷爷说句话"],
};

type AiConnectionState = "connected" | "fallback" | "not_configured" | "error";

const rateLabels: Record<VoiceRatePreset, string> = {
  slow: "慢",
  normal: "标准",
  fast: "稍快",
};

function formatVoiceSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export default function ChatBotWidget({
  role,
  currentUser,
  currentStory,
  currentTask,
  onInsertToStoryDraft,
  onSendToFamily,
  onShowToast,
}: ChatBotWidgetProps) {
  const { state, addAiChatMessages } = useSilverStore();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceCallOpen, setVoiceCallOpen] = useState(false);
  const [pendingInsert, setPendingInsert] = useState("");
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => loadVoiceSettings());
  const [chineseVoices, setChineseVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speakingMessageId, setSpeakingMessageId] = useState("");
  const [connectionState, setConnectionState] = useState<AiConnectionState>(
    getAiAssistantMode() === "deepseek" ? "fallback" : "fallback"
  );
  const [speechRecognitionState, setSpeechRecognitionState] = useState<SpeechRecognitionState>(() =>
    isSpeechRecognitionSupported() ? "idle" : "unsupported"
  );
  const [ttsState, setTtsState] = useState<TtsState>(() => (isSpeechSupported() ? "ready" : "unsupported"));
  const [voiceInputText, setVoiceInputText] = useState("");
  const [voiceInputError, setVoiceInputError] = useState("");
  const [voiceInputOpeningText, setVoiceInputOpeningText] = useState("正在打开麦克风……");
  const [voiceInputSeconds, setVoiceInputSeconds] = useState(0);
  const [voiceRequestInFlight, setVoiceRequestInFlight] = useState(false);
  const [ttsMessage, setTtsMessage] = useState("");
  const [messageSpeechErrors, setMessageSpeechErrors] = useState<Record<string, string>>({});
  const noVoiceNoticeShownRef = useRef(false);
  const voiceRecognitionRef = useRef<{ start: () => void; stop: () => void; abort: () => void } | null>(null);
  const voiceInputFinalRef = useRef("");
  const voiceInputInterimRef = useRef("");
  const voiceInputHadErrorRef = useRef(false);
  const ignoreVoiceInputEndRef = useRef(false);
  const voiceTimerRef = useRef<number | null>(null);
  const permissionTextTimerRef = useRef<number | null>(null);

  const assistantEnabled =
    role === "child" ? state.aiSettings.childAssistantEnabled : state.aiSettings.elderAssistantEnabled;
  const title = role === "elder" ? "AI 陪伴小助手" : "故事小伙伴";
  const opening =
    role === "elder"
      ? `${currentUser.name}，我在。你可以直接跟我说一段回忆，我帮你整理成孩子能听懂的小故事。`
      : `${currentUser.name}，我可以陪你一起听爷爷奶奶的故事。你想让我提示一下，还是想听我再讲一遍？`;
  const launcherPosition = role === "elder" ? "bottom-6 right-24" : "bottom-5 right-5";
  const panelPosition = role === "elder" ? "bottom-24 right-4 sm:right-24" : "bottom-24 right-5";
  const connectionLabel =
    connectionState === "connected"
      ? "AI 已连接"
      : connectionState === "not_configured"
        ? "AI 服务未配置"
        : connectionState === "error"
          ? "AI 连接异常"
          : "演示回复中";

  const messages = useMemo(
    () =>
      state.aiChatMessages
        .filter(
          (message) =>
            !message.deletedAt &&
            message.userRole === role &&
            message.userId === currentUser.id &&
            (!currentStory?.id || !message.storyId || message.storyId === currentStory.id)
        )
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(-12),
    [currentStory?.id, currentUser.id, role, state.aiChatMessages]
  );

  const history = useMemo<DeepSeekMessage[]>(
    () =>
      messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    [messages]
  );

  useEffect(() => {
    return () => {
      stopSpeaking();
      stopVoiceInput(true);
    };
  }, []);

  useEffect(() => {
    if (!isSpeechSupported()) return undefined;
    const refreshVoices = async () => {
      const voices = await loadChineseVoices();
      setChineseVoices(voices);
      if (open && voices.length === 0 && !noVoiceNoticeShownRef.current) {
        noVoiceNoticeShownRef.current = true;
        onShowToast(NO_NATURAL_CHINESE_VOICE_MESSAGE, "info");
      }
    };
    void refreshVoices();
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", refreshVoices);
  }, [open, onShowToast]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    async function checkConnection() {
      if (getAiAssistantMode() !== "deepseek") {
        setConnectionState("fallback");
        return;
      }
      try {
        const health = await checkDeepSeekHealth();
        if (cancelled) return;
        if (health.ok && health.hasKey) {
          setConnectionState("connected");
        } else if (!health.hasKey && !health.proxyMissing) {
          setConnectionState("not_configured");
        } else {
          setConnectionState("fallback");
          if (health.proxyMissing) onShowToast("AI 代理服务未启动，可使用 vercel dev 或 npm run dev:all。", "info");
        }
      } catch {
        if (!cancelled) setConnectionState("error");
      }
    }
    void checkConnection();
    return () => {
      cancelled = true;
    };
  }, [open, onShowToast]);

  function updateVoiceSettings(patch: Partial<VoiceSettings>) {
    const next = saveVoiceSettings(patch);
    setVoiceSettings(next);
  }

  function handleSpeechNotice(message: string) {
    if (message === NO_NATURAL_CHINESE_VOICE_MESSAGE) {
      if (noVoiceNoticeShownRef.current) return;
      noVoiceNoticeShownRef.current = true;
    }
    onShowToast(message, "info");
  }

  function startVoiceTimer() {
    if (voiceTimerRef.current != null) window.clearInterval(voiceTimerRef.current);
    setVoiceInputSeconds(0);
    voiceTimerRef.current = window.setInterval(() => {
      setVoiceInputSeconds((value) => value + 1);
    }, 1000);
  }

  function stopVoiceTimer() {
    if (voiceTimerRef.current != null) {
      window.clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    if (permissionTextTimerRef.current != null) {
      window.clearTimeout(permissionTextTimerRef.current);
      permissionTextTimerRef.current = null;
    }
  }

  function resetVoiceInput() {
    ignoreVoiceInputEndRef.current = true;
    voiceRecognitionRef.current?.abort();
    stopVoiceTimer();
    voiceRecognitionRef.current = null;
    voiceInputFinalRef.current = "";
    voiceInputInterimRef.current = "";
    voiceInputHadErrorRef.current = false;
    setSpeechRecognitionState(isSpeechRecognitionSupported() ? "idle" : "unsupported");
    setVoiceInputText("");
    setVoiceInputError("");
    setVoiceInputOpeningText("正在打开麦克风……");
    setVoiceInputSeconds(0);
  }

  function stopVoiceInput(abort = false) {
    if (abort) {
      ignoreVoiceInputEndRef.current = true;
      voiceRecognitionRef.current?.abort();
    } else {
      voiceRecognitionRef.current?.stop();
    }
    stopVoiceTimer();
    voiceRecognitionRef.current = null;
  }

  async function playReply(messageId: string, text: string, fromAuto = false) {
    const clean = text.trim();
    if (!clean) return;
    if (!isSpeechSupported()) {
      const message = "当前浏览器不支持语音朗读，请阅读文字回复。";
      setTtsState("unsupported");
      setTtsMessage(message);
      setMessageSpeechErrors((current) => ({ ...current, [messageId]: message }));
      return;
    }
    setMessageSpeechErrors((current) => {
      const next = { ...current };
      delete next[messageId];
      return next;
    });
    setTtsState("loading_voices");
    setTtsMessage("正在准备朗读……");
    try {
      await speakText(clean, {
        role,
        auto: fromAuto,
        voiceURI: voiceSettings.selectedVoiceURI,
        ratePreset: voiceSettings.ratePreset,
        onNotice: handleSpeechNotice,
        onStart: () => {
          setSpeakingMessageId(messageId);
          setTtsState("speaking");
          setTtsMessage("正在朗读");
        },
        onEnd: () => {
          setSpeakingMessageId((current) => (current === messageId ? "" : current));
          setTtsState("ready");
          setTtsMessage("");
        },
        onError: (message) => {
          setSpeakingMessageId("");
          setTtsState(fromAuto ? "blocked" : "error");
          setTtsMessage(message);
          setMessageSpeechErrors((current) => ({
            ...current,
            [messageId]: fromAuto ? "需要手动点击播放" : "朗读失败，请手动重试",
          }));
        },
      });
    } catch {
      setSpeakingMessageId("");
    }
  }

  function stopReply() {
    stopSpeaking();
    setSpeakingMessageId("");
    setTtsState(isSpeechSupported() ? "ready" : "unsupported");
    setTtsMessage("");
  }

  function previewVoice() {
    const sample =
      role === "elder"
        ? "您好，我会慢一点、清楚一点陪您聊天。"
        : "你好呀，我会轻快一点陪你听故事。";
    void playReply("voice-preview", sample);
  }

  async function sendMessage(text = input, options: { fromVoice?: boolean } = {}) {
    const clean = text.trim();
    if (!clean || loading) return;
    setInput("");
    setLoading(true);
    if (options.fromVoice) {
      setVoiceRequestInFlight(true);
      setSpeechRecognitionState("idle");
      setVoiceInputText(clean);
      setVoiceInputError("");
    }
    const userMessage: AiChatMessage = {
      id: `ai-msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      familyId: currentUser.familyId,
      role: "user",
      userRole: role,
      userId: currentUser.id,
      storyId: currentStory?.id,
      taskId: currentTask?.id,
      content: clean,
      provider: "fallback",
      createdAt: new Date().toISOString(),
    };
    addAiChatMessages([userMessage]);
    try {
      const answer = await askAiAssistant({
        role,
        currentUser,
        userMessage: clean,
        history,
        currentStory,
        currentTask,
      });
      const assistantMessage: AiChatMessage = {
        id: `ai-msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        familyId: currentUser.familyId,
        role: "assistant",
        userRole: role,
        userId: currentUser.id,
        storyId: currentStory?.id,
        taskId: currentTask?.id,
        content: answer.content,
        provider: answer.provider,
        createdAt: new Date().toISOString(),
      };
      addAiChatMessages([assistantMessage]);
      setConnectionState(answer.provider === "deepseek" ? "connected" : "fallback");
      setVoiceRequestInFlight(false);
      if (voiceSettings.autoSpeak) void playReply(assistantMessage.id, answer.content, true);
      else if (options.fromVoice) resetVoiceInput();
      if (answer.notice) onShowToast(answer.notice, "info");
    } catch {
      const fallbackId = `ai-msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const fallback =
        role === "elder"
          ? "我在呢。您慢慢说，我先陪您把这段回忆整理成孩子能听懂的话。"
          : "我陪你一起想。先看看爷爷刚才提到了什么，再找一找故事里的线索。";
      addAiChatMessages([
        {
          id: fallbackId,
          familyId: currentUser.familyId,
          role: "assistant",
          userRole: role,
          userId: currentUser.id,
          storyId: currentStory?.id,
          taskId: currentTask?.id,
          content: fallback,
          provider: "fallback",
          createdAt: new Date().toISOString(),
        },
      ]);
      setConnectionState("fallback");
      setVoiceRequestInFlight(false);
      if (voiceSettings.autoSpeak) void playReply(fallbackId, fallback, true);
      else if (options.fromVoice) resetVoiceInput();
      onShowToast("AI 服务暂时不可用，已切换为演示回复。", "info");
    } finally {
      setVoiceRequestInFlight(false);
      setLoading(false);
    }
  }

  function startVoiceInput() {
    if (loading || speechRecognitionState === "permission_requesting" || speechRecognitionState === "recognizing") return;
    if (speechRecognitionState === "listening") {
      stopListeningForVoiceInput();
      return;
    }
    stopReply();
    if (!isSpeechRecognitionSupported()) {
      setSpeechRecognitionState("unsupported");
      setVoiceInputError("当前浏览器不支持语音识别，请改用文字输入。");
      return;
    }

    voiceInputFinalRef.current = "";
    voiceInputInterimRef.current = "";
    voiceInputHadErrorRef.current = false;
    ignoreVoiceInputEndRef.current = false;
    setVoiceInputText("");
    setVoiceInputError("");
    setVoiceInputOpeningText("正在打开麦克风……");
    setVoiceInputSeconds(0);
    setSpeechRecognitionState("permission_requesting");
    if (permissionTextTimerRef.current != null) window.clearTimeout(permissionTextTimerRef.current);
    permissionTextTimerRef.current = window.setTimeout(() => {
      setVoiceInputOpeningText("正在请求麦克风权限……");
      permissionTextTimerRef.current = null;
    }, 350);
    const recognizer = createSpeechRecognizer({
      lang: "zh-CN",
      interimResults: true,
      onStart: () => {
        setSpeechRecognitionState("listening");
        startVoiceTimer();
      },
      onInterim: (text) => {
        if (!text) return;
        voiceInputInterimRef.current = text;
        setVoiceInputText(`${voiceInputFinalRef.current}${voiceInputInterimRef.current}`.trim());
      },
      onFinal: (text) => {
        if (!text) return;
        voiceInputFinalRef.current = `${voiceInputFinalRef.current}${text}`;
        voiceInputInterimRef.current = "";
        setVoiceInputText(`${voiceInputFinalRef.current}${voiceInputInterimRef.current}`.trim());
      },
      onError: (errorType, message) => {
        if (ignoreVoiceInputEndRef.current) return;
        voiceInputHadErrorRef.current = true;
        stopVoiceTimer();
        if (errorType === "not-allowed" || errorType === "service-not-allowed") {
          setSpeechRecognitionState("permission_denied");
        } else if (errorType === "network") {
          setSpeechRecognitionState("network_error");
        } else if (errorType === "no-speech") {
          setSpeechRecognitionState("no_result");
        } else if (errorType === "unsupported") {
          setSpeechRecognitionState("unsupported");
        } else {
          setSpeechRecognitionState("error");
        }
        setVoiceInputError(message);
      },
      onEnd: () => {
        stopVoiceTimer();
        voiceRecognitionRef.current = null;
        if (ignoreVoiceInputEndRef.current) {
          ignoreVoiceInputEndRef.current = false;
          return;
        }
        if (voiceInputHadErrorRef.current) return;
        const clean = `${voiceInputFinalRef.current}${voiceInputInterimRef.current}`.trim();
        if (clean) {
          setVoiceInputText(clean);
          setInput(clean);
          setSpeechRecognitionState("recognized");
          return;
        }
        setSpeechRecognitionState("no_result");
        setVoiceInputError("没有听清楚，您可以再说一遍。");
      },
    });
    voiceRecognitionRef.current = recognizer;
    recognizer.start();
  }

  function stopListeningForVoiceInput() {
    setSpeechRecognitionState("recognizing");
    stopVoiceTimer();
    voiceRecognitionRef.current?.stop();
  }

  function sendRecognizedVoiceInput() {
    const clean = voiceInputText.trim();
    if (!clean) {
      setSpeechRecognitionState("no_result");
      setVoiceInputError("没有听清楚，您可以再说一遍。");
      return;
    }
    void sendMessage(clean, { fromVoice: true });
  }

  function renderVoiceInputStatus() {
    const elderCopy = {
      listening: "正在听您说话",
      interim: "我正在听：",
      heard: "我听到了：",
      thinking: "AI 正在想一想……",
      speaking: "AI 正在朗读回复",
      retry: "重新说一遍",
      ask: "和 AI 说话",
    };
    const childCopy = {
      listening: "我在听你说哦",
      interim: "我听到你在说：",
      heard: "我听到了这句话：",
      thinking: "故事小伙伴想一想……",
      speaking: "我来读给你听",
      retry: "重新说一遍",
      ask: "问问小助手",
    };
    const copy = role === "elder" ? elderCopy : childCopy;

    if (speechRecognitionState === "unsupported") {
      return (
        <div className="mb-3 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-3">
          <p className="text-sm font-black text-[#B42318]">当前浏览器不支持语音识别，请改用文字输入。</p>
        </div>
      );
    }

    if (speechRecognitionState === "permission_requesting") {
      return (
        <div className="mb-3 rounded-xl border border-[#D1D5DB] bg-[#FAF8F2] p-3 text-sm font-bold text-[#4B5563]">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin text-[#0E9F6E]" />
          {voiceInputOpeningText}
        </div>
      );
    }

    if (speechRecognitionState === "listening") {
      return (
        <div className="mb-3 rounded-xl border border-[#FDBA74] bg-[#FFF7ED] p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-black text-[#9A3412]">
              <span className="h-3 w-3 rounded-full bg-[#EA580C] animate-pulse" />
              {copy.listening}
            </p>
            <span className="rounded-lg bg-white px-2 py-1 text-sm font-black text-[#9A3412]">
              {formatVoiceSeconds(voiceInputSeconds)}
            </span>
          </div>
          {voiceInputText && (
            <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm font-bold leading-5 text-[#8A4700]">
              {copy.interim}
              {voiceInputText}
            </p>
          )}
          <p className="mt-2 text-sm font-bold text-[#6B4F35]">说完后点击“停止说话”。</p>
        </div>
      );
    }

    if (speechRecognitionState === "recognizing") {
      return (
        <div className="mb-3 rounded-xl border border-[#D1D5DB] bg-[#FAF8F2] p-3 text-sm font-bold text-[#4B5563]">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin text-[#0E9F6E]" />
          正在识别您的声音……
        </div>
      );
    }

    if (speechRecognitionState === "recognized") {
      return (
        <div className="mb-3 rounded-xl border border-[#0E9F6E] bg-[#EAF5F0] p-3">
          <p className="text-sm font-black text-[#0E6F52]">{copy.heard}</p>
          <p className="mt-1 break-words font-black leading-6 text-[#111827]">{voiceInputText}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={sendRecognizedVoiceInput}
              className="h-10 rounded-lg bg-[#0E9F6E] px-3 text-sm font-black text-white"
            >
              发送给 AI
            </button>
            <button
              type="button"
              onClick={startVoiceInput}
              className="h-10 rounded-lg border border-[#0E9F6E] px-3 text-sm font-black text-[#0E6F52]"
            >
              {copy.retry}
            </button>
            <button
              type="button"
              onClick={resetVoiceInput}
              className="h-10 rounded-lg bg-white px-3 text-sm font-black text-[#4B5563]"
            >
              改用文字输入
            </button>
          </div>
        </div>
      );
    }

    if (
      speechRecognitionState === "no_result" ||
      speechRecognitionState === "network_error" ||
      speechRecognitionState === "permission_denied" ||
      speechRecognitionState === "error"
    ) {
      return (
        <div className="mb-3 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-3">
          <p className="text-sm font-black text-[#B42318]">
            {voiceInputError || "当前浏览器语音识别服务暂时不可用，请改用文字输入。"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startVoiceInput}
              className="h-10 rounded-lg border border-[#B42318] px-3 text-sm font-black text-[#B42318]"
            >
              重新说一遍
            </button>
            <button
              type="button"
              onClick={resetVoiceInput}
              className="h-10 rounded-lg bg-white px-3 text-sm font-black text-[#4B5563]"
            >
              改用文字输入
            </button>
          </div>
        </div>
      );
    }

    if (voiceRequestInFlight) {
      return (
        <div className="mb-3 rounded-xl border border-[#D1D5DB] bg-[#FAF8F2] p-3 text-sm font-bold text-[#4B5563]">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin text-[#0E9F6E]" />
          {copy.thinking}
        </div>
      );
    }

    if (ttsState === "loading_voices") {
      return (
        <div className="mb-3 rounded-xl border border-[#D1D5DB] bg-[#FAF8F2] p-3 text-sm font-bold text-[#4B5563]">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin text-[#0E9F6E]" />
          {ttsMessage || "正在准备朗读……"}
        </div>
      );
    }

    if (ttsState === "speaking") {
      return (
        <div className="mb-3 rounded-xl border border-[#0E9F6E] bg-[#EAF5F0] p-3">
          <p className="font-black text-[#0E6F52]">{copy.speaking}</p>
          <button
            type="button"
            onClick={stopReply}
            className="mt-2 inline-flex h-10 items-center gap-2 rounded-lg border border-[#B42318] bg-white px-3 text-sm font-black text-[#B42318]"
          >
            <Square className="h-4 w-4" />
            停止朗读
          </button>
        </div>
      );
    }

    if (ttsState === "blocked" || ttsState === "error" || (ttsState === "unsupported" && ttsMessage)) {
      return (
        <div className="mb-3 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-3">
          <p className="text-sm font-black text-[#B42318]">{ttsMessage}</p>
        </div>
      );
    }

    return null;
  }

  const voiceButtonIdleText = role === "elder" ? "和 AI 说话" : "问问小助手";
  const voiceButtonDisabled =
    speechRecognitionState === "unsupported" ||
    speechRecognitionState === "permission_requesting" ||
    speechRecognitionState === "recognizing" ||
    voiceRequestInFlight ||
    loading;
  const voiceButtonText =
    speechRecognitionState === "unsupported"
      ? "改用文字输入"
      : speechRecognitionState === "listening"
        ? "停止说话"
        : speechRecognitionState === "recognizing"
          ? "识别中"
          : speechRecognitionState === "permission_requesting"
            ? "正在打开"
            : voiceButtonIdleText;
  const voiceButtonClass =
    speechRecognitionState === "listening"
      ? "border-[#EA580C] bg-[#FFF7ED] text-[#C2410C] shadow-sm"
      : "border-[#9BB8A7] bg-[#F6FAF8] text-[#0E6F52] hover:bg-[#EAF5F0]";

  if (!assistantEnabled) {
    return (
      <div
        className={`fixed ${launcherPosition} z-[90] rounded-2xl border border-[#D1D5DB] bg-white px-4 py-3 text-sm font-black text-[#6B4F35] shadow-xl`}
      >
        {role === "child" ? "家属暂时关闭了故事小伙伴。" : "家属暂时关闭了 AI 陪伴小助手。"}
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`fixed ${launcherPosition} z-[90] flex h-16 w-16 items-center justify-center rounded-full shadow-xl ${
          role === "elder" ? "bg-[#7A4E2D] text-white" : "bg-[#FD8603] text-white"
        }`}
        aria-label={title}
      >
        <Bot className="h-8 w-8" />
      </button>

      {open && (
        <section
          className={`fixed ${panelPosition} z-[120] flex max-h-[76vh] w-[min(440px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-[#D1D5DB] bg-white shadow-2xl`}
        >
          <header className="flex items-center justify-between border-b border-[#D1D5DB] bg-[#FAF8F2] px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF5F0] text-[#0E9F6E]">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-[#111827]">{title}</h3>
                <p className="text-xs font-bold text-[#6B7280]">{connectionLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSettingsOpen((value) => !value)}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#F3F4F6]"
                aria-label="语音设置"
              >
                <Settings className="h-5 w-5" />
              </button>
              <button
                onClick={() => {
                  stopReply();
                  stopVoiceInput(true);
                  resetVoiceInput();
                  setVoiceCallOpen(false);
                  setOpen(false);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#F3F4F6]"
                aria-label="关闭 AI 小窗"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] px-4 py-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${
                connectionState === "connected"
                  ? "bg-[#EAF5F0] text-[#0E9F6E]"
                  : connectionState === "not_configured" || connectionState === "error"
                    ? "bg-[#FEE2E2] text-[#B42318]"
                    : "bg-[#FFF7ED] text-[#8A4700]"
              }`}
            >
              {connectionLabel}
            </span>
            <button
              onClick={() => updateVoiceSettings({ autoSpeak: !voiceSettings.autoSpeak })}
              className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-xs font-black ${
                voiceSettings.autoSpeak
                  ? "border-[#0E9F6E] bg-[#EAF5F0] text-[#0E6F52]"
                  : "border-[#D1D5DB] text-[#4B5563]"
              }`}
            >
              {voiceSettings.autoSpeak ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              自动朗读
            </button>
          </div>

          {settingsOpen && (
            <div className="space-y-3 border-b border-[#E5E7EB] bg-white px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-black text-[#111827]">自动朗读</span>
                <button
                  onClick={() => updateVoiceSettings({ autoSpeak: !voiceSettings.autoSpeak })}
                  className={`h-8 rounded-lg border px-3 text-xs font-black ${
                    voiceSettings.autoSpeak
                      ? "border-[#0E9F6E] bg-[#EAF5F0] text-[#0E6F52]"
                      : "border-[#D1D5DB] text-[#4B5563]"
                  }`}
                >
                  {voiceSettings.autoSpeak ? "开启" : "关闭"}
                </button>
              </div>

              <div>
                <p className="mb-2 font-black text-[#111827]">语速</p>
                <div className="grid grid-cols-3 gap-2">
                  {(["slow", "normal", "fast"] as VoiceRatePreset[]).map((preset) => (
                    <button
                      key={preset}
                      onClick={() => updateVoiceSettings({ ratePreset: preset })}
                      className={`h-9 rounded-lg border text-xs font-black ${
                        voiceSettings.ratePreset === preset
                          ? "border-[#0E9F6E] bg-[#EAF5F0] text-[#0E6F52]"
                          : "border-[#D1D5DB] text-[#4B5563]"
                      }`}
                    >
                      {rateLabels[preset]}
                    </button>
                  ))}
                </div>
              </div>

              {chineseVoices.length > 1 && (
                <label className="block">
                  <span className="mb-2 block font-black text-[#111827]">音色</span>
                  <select
                    value={voiceSettings.selectedVoiceURI ?? ""}
                    onChange={(event) => updateVoiceSettings({ selectedVoiceURI: event.target.value || null })}
                    className="h-10 w-full rounded-lg border border-[#D1D5DB] bg-white px-3 text-sm font-bold outline-none focus:border-[#0E9F6E]"
                  >
                    <option value="">自动选择自然中文</option>
                    {chineseVoices.map((voice) => (
                      <option key={voice.voiceURI} value={voice.voiceURI}>
                        {voice.name}（{voice.lang}）
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {chineseVoices.length === 0 && (
                <p className="rounded-lg bg-[#FFF7ED] px-3 py-2 text-xs font-bold leading-5 text-[#8A4700]">
                  {NO_NATURAL_CHINESE_VOICE_MESSAGE}
                </p>
              )}

              <button
                onClick={previewVoice}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#0E9F6E] bg-white px-3 text-xs font-black text-[#0E6F52]"
              >
                <Volume2 className="h-4 w-4" />
                试听
              </button>
            </div>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            <div className="max-w-[86%] rounded-2xl rounded-tl-md bg-[#EAF5F0] p-3 font-bold leading-6 text-[#0E6F52]">
              {opening}
            </div>
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[86%] rounded-2xl p-3 text-sm font-bold leading-6 ${
                    message.role === "user"
                      ? "rounded-tr-md bg-[#0E9F6E] text-white"
                      : "rounded-tl-md bg-[#F7F0E4] text-[#3F2D1F]"
                  }`}
                >
                  {message.content}
                  {message.role === "assistant" && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={() => void playReply(message.id, message.content)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#0E9F6E] bg-white px-2 text-xs font-black text-[#0E6F52]"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                        {speakingMessageId === message.id ? "正在朗读" : "播放"}
                      </button>
                      <button
                        onClick={stopReply}
                        disabled={speakingMessageId !== message.id}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#B42318] bg-white px-2 text-xs font-black text-[#B42318] disabled:opacity-45"
                      >
                        <Square className="h-3.5 w-3.5" />
                        停止
                      </button>
                      <button
                        onClick={() => void playReply(message.id, message.content)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#D8C8B0] bg-white px-2 text-xs font-black text-[#6B4F35]"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        重播
                      </button>
                      {messageSpeechErrors[message.id] && (
                        <span className="w-full text-xs font-black text-[#B42318]">
                          {messageSpeechErrors[message.id]}
                        </span>
                      )}
                    </div>
                  )}
                  {message.role === "assistant" && role === "elder" && onInsertToStoryDraft && (
                    <button
                      onClick={() => setPendingInsert(message.content)}
                      className="mt-2 block rounded-lg border border-[#7A4E2D] bg-white px-3 py-1 text-xs font-black text-[#7A4E2D]"
                    >
                      放入故事草稿
                    </button>
                  )}
                  {message.role === "assistant" && role === "child" && onSendToFamily && (
                    <button
                      onClick={() => onSendToFamily(message.content)}
                      className="mt-2 block rounded-lg border border-[#FD8603] bg-white px-3 py-1 text-xs font-black text-[#8A4700]"
                    >
                      送给爷爷
                    </button>
                  )}
                </div>
              </div>
            ))}
            {loading && <p className="text-sm font-black text-[#6B7280]">我想一想...</p>}
          </div>

          <div className="border-t border-[#D1D5DB] p-3">
            <div className="mb-3 flex flex-wrap gap-2">
              {quickActions[role].map((action) => (
                <button
                  key={action}
                  onClick={() => void sendMessage(action)}
                  className="rounded-full border border-[#D8C8B0] bg-[#FFF7ED] px-3 py-1.5 text-xs font-black text-[#6B4F35] hover:bg-[#FFEEDC]"
                >
                  {action}
                </button>
              ))}
            </div>
            {renderVoiceInputStatus()}
            <div className="flex flex-wrap items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={2}
                placeholder={role === "elder" ? "慢慢说，我帮您记下来" : "问我一个小问题"}
                disabled={voiceRequestInFlight}
                className="min-h-12 min-w-[180px] flex-1 resize-none rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm font-bold leading-6 outline-none focus:border-[#0E9F6E] disabled:bg-[#F3F4F6]"
              />
              <button
                onClick={startVoiceInput}
                disabled={voiceButtonDisabled}
                title={voiceButtonIdleText}
                className={`flex h-11 min-w-[118px] items-center justify-center gap-2 rounded-xl border px-3 text-sm font-black disabled:opacity-60 ${voiceButtonClass}`}
                aria-label={voiceButtonIdleText}
              >
                {speechRecognitionState === "recognizing" || speechRecognitionState === "permission_requesting" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mic className={`h-4 w-4 ${speechRecognitionState === "listening" ? "animate-pulse" : ""}`} />
                )}
                <span>{voiceButtonText}</span>
              </button>
              <button
                onClick={() => {
                  stopVoiceInput(true);
                  setVoiceCallOpen(true);
                }}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D1D5DB] hover:bg-[#F3F4F6]"
                aria-label="语音通话"
              >
                <Phone className="h-5 w-5" />
              </button>
              <button
                onClick={() => void sendMessage()}
                disabled={loading}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0E9F6E] text-white hover:bg-[#0C8F62] disabled:opacity-50"
                aria-label="发送"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </div>

          {pendingInsert && (
            <div className="absolute inset-x-4 bottom-24 rounded-2xl border border-[#D8C8B0] bg-white p-4 shadow-xl">
              <p className="font-black text-[#3F2D1F]">确认放入故事草稿？</p>
              <p className="mt-1 text-sm font-bold text-[#6B4F35]">
                写入前请确认这段内容适合作为故事文字。
              </p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setPendingInsert("")} className="h-10 flex-1 rounded-xl border border-[#D1D5DB] font-black">
                  取消
                </button>
                <button
                  onClick={() => {
                    onInsertToStoryDraft?.(pendingInsert);
                    setPendingInsert("");
                    onShowToast("已放入故事草稿，请再确认后保存。", "success");
                  }}
                  className="h-10 flex-1 rounded-xl bg-[#0E9F6E] font-black text-white"
                >
                  确认写入
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {voiceCallOpen && (
        <AiVoiceCallPanel
          role={role}
          currentUser={currentUser}
          currentStory={currentStory}
          currentTask={currentTask}
          onClose={() => {
            stopReply();
            setVoiceCallOpen(false);
          }}
          onShowToast={onShowToast}
        />
      )}
    </>
  );
}
