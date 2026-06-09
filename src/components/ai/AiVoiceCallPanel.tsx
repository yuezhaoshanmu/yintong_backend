import React, { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, PhoneOff, RotateCcw, Send, Square, Volume2 } from "lucide-react";
import { AppUser } from "../../auth";
import { askAiAssistant, AssistantRole } from "../../services/aiAssistantService";
import { ChildTask, MemoryStory, ToastKind } from "../../types";
import { useSilverStore } from "../../store";
import {
  isSpeechSupported,
  loadVoiceSettings,
  NO_NATURAL_CHINESE_VOICE_MESSAGE,
  speakText,
  stopSpeaking,
  TtsState,
  VoiceSettings,
} from "../../utils/speech";
import {
  createSpeechRecognizer,
  isSpeechRecognitionSupported,
  SpeechRecognitionState,
} from "../../utils/speechRecognition";

type AiVoiceCallPanelProps = {
  role: AssistantRole;
  currentUser: AppUser;
  currentStory?: MemoryStory;
  currentTask?: ChildTask;
  onClose: () => void;
  onShowToast: (message: string, type?: ToastKind) => void;
};

function voiceMode() {
  return import.meta.env.VITE_AI_VOICE_MODE === "realtime" ? "realtime" : "browser";
}

function formatVoiceSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export default function AiVoiceCallPanel({
  role,
  currentUser,
  currentStory,
  currentTask,
  onClose,
  onShowToast,
}: AiVoiceCallPanelProps) {
  const { addAiChatMessages, addAiCallSession, endAiCallSession } = useSilverStore();
  const [speechRecognitionState, setSpeechRecognitionState] = useState<SpeechRecognitionState>(() =>
    isSpeechRecognitionSupported() ? "idle" : "unsupported"
  );
  const [ttsState, setTtsState] = useState<TtsState>(() => (isSpeechSupported() ? "ready" : "unsupported"));
  const [manualText, setManualText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [listeningSeconds, setListeningSeconds] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [voiceOpeningText, setVoiceOpeningText] = useState("正在打开麦克风……");
  const [ttsMessage, setTtsMessage] = useState("");
  const [voiceSettings] = useState<VoiceSettings>(() => loadVoiceSettings());
  const sessionIdRef = useRef(`ai-call-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
  const startedAtRef = useRef(Date.now());
  const recognitionRef = useRef<{ start: () => void; stop: () => void; abort: () => void } | null>(null);
  const finalTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const recognitionHadErrorRef = useRef(false);
  const ignoreRecognitionEndRef = useRef(false);
  const activeRef = useRef(true);
  const listenTimerRef = useRef<number | null>(null);
  const permissionTextTimerRef = useRef<number | null>(null);
  const noVoiceNoticeShownRef = useRef(false);

  const title = role === "elder" ? "正在和 AI 陪伴小助手通话" : "正在和故事小伙伴通话";
  const copy =
    role === "elder"
      ? {
          listening: "正在听您说话",
          interim: "我正在听：",
          missed: "没有听清楚，您可以再说一遍。",
          heard: "我听到了：",
          thinking: "AI 正在想一想……",
          speaking: "AI 正在朗读回复",
          done: "您可以继续说，或者结束通话",
          offHint: "点击“开始说话”后，我再听您说。",
        }
      : {
          listening: "我在听你说哦",
          interim: "我听到你在说：",
          missed: "没有听清楚，你可以再说一遍。",
          heard: "我听到了这句话：",
          thinking: "故事小伙伴想一想……",
          speaking: "故事小伙伴正在读回复",
          done: "你可以继续说，或者结束通话",
          offHint: "点击“开始说话”后，我再听你说。",
        };

  useEffect(() => {
    activeRef.current = true;
    if (voiceMode() === "realtime") {
      onShowToast("实时语音服务未配置，已使用浏览器轮次式语音对话。", "info");
    }
    addAiCallSession({
      id: sessionIdRef.current,
      familyId: currentUser.familyId,
      userId: currentUser.id,
      userRole: role,
      storyId: currentStory?.id,
      taskId: currentTask?.id,
      mode: "browser",
      provider: "fallback",
      startedAt: new Date(startedAtRef.current).toISOString(),
      status: "active",
    });
    return () => {
      activeRef.current = false;
      stopVoiceTimer();
      stopSpeaking();
      recognitionRef.current?.abort();
    };
  }, []);

  function handleSpeechNotice(message: string) {
    if (message === NO_NATURAL_CHINESE_VOICE_MESSAGE) {
      if (noVoiceNoticeShownRef.current) return;
      noVoiceNoticeShownRef.current = true;
    }
    onShowToast(message, "info");
  }

  function startVoiceTimer() {
    stopVoiceTimer();
    setListeningSeconds(0);
    listenTimerRef.current = window.setInterval(() => {
      setListeningSeconds((value) => value + 1);
    }, 1000);
  }

  function stopVoiceTimer() {
    if (listenTimerRef.current != null) {
      window.clearInterval(listenTimerRef.current);
      listenTimerRef.current = null;
    }
    if (permissionTextTimerRef.current != null) {
      window.clearTimeout(permissionTextTimerRef.current);
      permissionTextTimerRef.current = null;
    }
  }

  function stopRecognition(abort = false) {
    if (abort) {
      ignoreRecognitionEndRef.current = true;
      recognitionRef.current?.abort();
    } else {
      recognitionRef.current?.stop();
    }
    recognitionRef.current = null;
    stopVoiceTimer();
  }

  function finishCall() {
    activeRef.current = false;
    stopRecognition(true);
    stopSpeaking();
    const duration = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
    endAiCallSession(sessionIdRef.current, duration, "ended");
    onClose();
  }

  function startListening() {
    if (!activeRef.current || speechRecognitionState === "permission_requesting" || speechRecognitionState === "listening") {
      return;
    }
    stopSpeaking();
    setTtsState(isSpeechSupported() ? "ready" : "unsupported");
    setTtsMessage("");
    setErrorMessage("");

    if (!isSpeechRecognitionSupported()) {
      setSpeechRecognitionState("unsupported");
      setErrorMessage("当前浏览器不支持语音识别，请改用文字输入。");
      return;
    }

    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    recognitionHadErrorRef.current = false;
    ignoreRecognitionEndRef.current = false;
    setTranscript("");
    setManualText("");
    setListeningSeconds(0);
    setVoiceOpeningText("正在打开麦克风……");
    setSpeechRecognitionState("permission_requesting");
    permissionTextTimerRef.current = window.setTimeout(() => {
      setVoiceOpeningText("正在请求麦克风权限……");
      permissionTextTimerRef.current = null;
    }, 350);

    const recognizer = createSpeechRecognizer({
      lang: "zh-CN",
      interimResults: true,
      onStart: () => {
        if (!activeRef.current) return;
        setSpeechRecognitionState("listening");
        startVoiceTimer();
      },
      onInterim: (text) => {
        if (!text) return;
        interimTranscriptRef.current = text;
        const clean = `${finalTranscriptRef.current}${interimTranscriptRef.current}`.trim();
        setTranscript(clean);
        setManualText(clean);
      },
      onFinal: (text) => {
        if (!text) return;
        finalTranscriptRef.current = `${finalTranscriptRef.current}${text}`;
        interimTranscriptRef.current = "";
        const clean = finalTranscriptRef.current.trim();
        setTranscript(clean);
        setManualText(clean);
      },
      onError: (errorType, message) => {
        if (ignoreRecognitionEndRef.current) return;
        recognitionHadErrorRef.current = true;
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
        setErrorMessage(message);
      },
      onEnd: () => {
        stopVoiceTimer();
        recognitionRef.current = null;
        if (ignoreRecognitionEndRef.current) {
          ignoreRecognitionEndRef.current = false;
          return;
        }
        if (!activeRef.current || recognitionHadErrorRef.current) return;
        const clean = `${finalTranscriptRef.current}${interimTranscriptRef.current}`.trim();
        if (!clean) {
          setSpeechRecognitionState("no_result");
          setErrorMessage(copy.missed);
          return;
        }
        setTranscript(clean);
        setManualText("");
        setSpeechRecognitionState("recognized");
      },
    });

    recognitionRef.current = recognizer;
    recognizer.start();
  }

  function stopListening() {
    if (speechRecognitionState !== "listening" && speechRecognitionState !== "permission_requesting") return;
    setSpeechRecognitionState("recognizing");
    stopVoiceTimer();
    recognitionRef.current?.stop();
  }

  function muteMic() {
    stopRecognition(true);
    setSpeechRecognitionState("idle");
    setErrorMessage("");
  }

  async function playReply(text = reply, fromAuto = false) {
    const clean = text.trim();
    if (!clean) return;
    if (!isSpeechSupported()) {
      const message = "当前浏览器不支持语音朗读，请阅读文字回复。";
      setTtsState("unsupported");
      setTtsMessage(message);
      return;
    }

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
          setTtsState("speaking");
          setTtsMessage("");
          setSpeechRecognitionState("idle");
        },
        onEnd: () => {
          setTtsState("ready");
          setTtsMessage("");
        },
        onError: (message) => {
          setTtsState(fromAuto ? "blocked" : "error");
          setTtsMessage(message);
        },
      });
    } catch {
      // Error state is already set by onError.
    }
  }

  async function sendRound(text = transcript || manualText) {
    const clean = text.trim();
    if (!clean) {
      setSpeechRecognitionState("no_result");
      setErrorMessage(copy.missed);
      return;
    }
    stopRecognition(true);
    setIsThinking(true);
    setSpeechRecognitionState("idle");
    setTranscript(clean);
    setManualText("");

    const userMessage = {
      id: `ai-msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      familyId: currentUser.familyId,
      role: "user" as const,
      userRole: role,
      userId: currentUser.id,
      storyId: currentStory?.id,
      taskId: currentTask?.id,
      content: clean,
      transcript: clean,
      provider: "fallback" as const,
      createdAt: new Date().toISOString(),
    };

    try {
      const answer = await askAiAssistant({
        role,
        currentUser,
        userMessage: clean,
        currentStory,
        currentTask,
        history: [],
      });
      const assistantMessage = {
        id: `ai-msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        familyId: currentUser.familyId,
        role: "assistant" as const,
        userRole: role,
        userId: currentUser.id,
        storyId: currentStory?.id,
        taskId: currentTask?.id,
        content: answer.content,
        provider: answer.provider,
        createdAt: new Date().toISOString(),
      };
      addAiChatMessages([userMessage, assistantMessage]);
      setReply(answer.content);
      setIsThinking(false);
      void playReply(answer.content, true);
      if (answer.notice) onShowToast(answer.notice, "info");
    } catch {
      const fallback =
        role === "elder"
          ? "我在呢。您慢慢说，我先帮您把这段回忆整理清楚。"
          : "我陪你一起想。先找找故事里刚刚出现过的东西。";
      addAiChatMessages([
        userMessage,
        {
          id: `ai-msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          familyId: currentUser.familyId,
          role: "assistant" as const,
          userRole: role,
          userId: currentUser.id,
          storyId: currentStory?.id,
          taskId: currentTask?.id,
          content: fallback,
          provider: "fallback" as const,
          createdAt: new Date().toISOString(),
        },
      ]);
      setReply(fallback);
      setIsThinking(false);
      void playReply(fallback, true);
      onShowToast("AI 服务暂时不可用，已切换为演示回复。", "info");
    } finally {
      setIsThinking(false);
    }
  }

  function stopCurrentSpeaking() {
    stopSpeaking();
    setTtsState(isSpeechSupported() ? "ready" : "unsupported");
    setTtsMessage("");
  }

  const micStatusText =
    speechRecognitionState === "listening"
      ? "麦克风已开启"
      : speechRecognitionState === "permission_requesting"
        ? "正在打开麦克风……"
        : speechRecognitionState === "permission_denied"
          ? "麦克风权限被拒绝"
          : "麦克风已关闭";

  const mainStatus = (() => {
    if (speechRecognitionState === "permission_requesting") return voiceOpeningText;
    if (speechRecognitionState === "listening") return `${copy.listening} ${formatVoiceSeconds(listeningSeconds)}`;
    if (speechRecognitionState === "recognizing") return "正在识别您的声音……";
    if (speechRecognitionState === "recognized") return `${copy.heard}${transcript}`;
    if (speechRecognitionState === "unsupported") return "当前浏览器不支持语音识别，请改用文字输入。";
    if (speechRecognitionState === "permission_denied") return "麦克风权限被拒绝，请在浏览器地址栏允许麦克风。";
    if (speechRecognitionState === "network_error") return "浏览器语音识别服务暂时不可用，请改用文字输入。";
    if (speechRecognitionState === "no_result") return errorMessage || copy.missed;
    if (speechRecognitionState === "error") return errorMessage || "当前浏览器语音识别服务暂时不可用，请改用文字输入。";
    if (isThinking) return copy.thinking;
    if (ttsState === "loading_voices") return "AI 正在准备朗读回复";
    if (ttsState === "speaking") return copy.speaking;
    if (ttsState === "blocked" || ttsState === "error" || (ttsState === "unsupported" && ttsMessage)) {
      return ttsMessage;
    }
    if (reply) return copy.done;
    return "麦克风已关闭";
  })();

  const helperText = (() => {
    if (speechRecognitionState === "idle" && !isThinking && !reply) return copy.offHint;
    if (speechRecognitionState === "listening") return "说完后点击“停止说话”。";
    if (speechRecognitionState === "recognized") return "确认无误后，可以发送给 AI。";
    if (ttsState === "blocked") return "自动朗读开关仍然保留，您可以手动点击播放。";
    if (reply && ttsState === "ready" && !isThinking) return "继续说时，我会重新打开麦克风。";
    return "";
  })();

  function renderPrimaryButtons() {
    if (speechRecognitionState === "permission_requesting") {
      return (
        <>
          <button
            type="button"
            onClick={muteMic}
            className="flex h-12 items-center justify-center rounded-xl border border-[#4B5563] font-black text-[#4B5563] hover:bg-[#F3F4F6]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={finishCall}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#B42318] font-black text-white hover:bg-[#991B1B]"
          >
            <PhoneOff className="h-4 w-4" />
            结束通话
          </button>
        </>
      );
    }

    if (speechRecognitionState === "listening") {
      return (
        <>
          <button
            type="button"
            onClick={stopListening}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#EA580C] font-black text-[#C2410C] hover:bg-[#FFF7ED]"
          >
            <Square className="h-4 w-4" />
            停止说话
          </button>
          <button
            type="button"
            onClick={muteMic}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#0E9F6E] font-black text-[#0E9F6E] hover:bg-[#EAF5F0]"
          >
            <MicOff className="h-4 w-4" />
            静音
          </button>
          <button
            type="button"
            onClick={finishCall}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#B42318] font-black text-white hover:bg-[#991B1B]"
          >
            <PhoneOff className="h-4 w-4" />
            结束通话
          </button>
        </>
      );
    }

    if (speechRecognitionState === "recognizing" || isThinking || ttsState === "loading_voices") {
      return (
        <button
          type="button"
          onClick={finishCall}
          className="col-span-full flex h-12 items-center justify-center gap-2 rounded-xl bg-[#B42318] font-black text-white hover:bg-[#991B1B]"
        >
          <PhoneOff className="h-4 w-4" />
          结束通话
        </button>
      );
    }

    if (speechRecognitionState === "recognized") {
      return (
        <>
          <button
            type="button"
            onClick={() => void sendRound(transcript)}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0E9F6E] font-black text-white hover:bg-[#0C8F62]"
          >
            <Send className="h-4 w-4" />
            发送给 AI
          </button>
          <button
            type="button"
            onClick={startListening}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#0E9F6E] font-black text-[#0E9F6E] hover:bg-[#EAF5F0]"
          >
            <Mic className="h-4 w-4" />
            重新说一遍
          </button>
          <button
            type="button"
            onClick={finishCall}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#B42318] font-black text-white hover:bg-[#991B1B]"
          >
            <PhoneOff className="h-4 w-4" />
            结束通话
          </button>
        </>
      );
    }

    if (ttsState === "speaking") {
      return (
        <>
          <button
            type="button"
            onClick={stopCurrentSpeaking}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#B42318] font-black text-[#B42318] hover:bg-[#FEF2F2]"
          >
            <Square className="h-4 w-4" />
            停止朗读
          </button>
          <button
            type="button"
            onClick={finishCall}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#B42318] font-black text-white hover:bg-[#991B1B]"
          >
            <PhoneOff className="h-4 w-4" />
            结束通话
          </button>
        </>
      );
    }

    if (reply && (ttsState === "ready" || ttsState === "blocked" || ttsState === "error")) {
      return (
        <>
          <button
            type="button"
            onClick={startListening}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#0E9F6E] font-black text-[#0E9F6E] hover:bg-[#EAF5F0]"
          >
            <Mic className="h-4 w-4" />
            继续说
          </button>
          <button
            type="button"
            onClick={() => void playReply(reply)}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#D8C8B0] font-black text-[#6B4F35] hover:bg-[#FFF7ED]"
          >
            <RotateCcw className="h-4 w-4" />
            重播回复
          </button>
          <button
            type="button"
            onClick={finishCall}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#B42318] font-black text-white hover:bg-[#991B1B]"
          >
            <PhoneOff className="h-4 w-4" />
            结束通话
          </button>
        </>
      );
    }

    return (
      <>
        <button
          type="button"
          onClick={startListening}
          disabled={speechRecognitionState === "unsupported"}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0E9F6E] font-black text-white hover:bg-[#0C8F62] disabled:opacity-50"
        >
          <Mic className="h-4 w-4" />
          开始说话
        </button>
        <button
          type="button"
          onClick={finishCall}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#B42318] font-black text-white hover:bg-[#991B1B]"
        >
          <PhoneOff className="h-4 w-4" />
          结束通话
        </button>
      </>
    );
  }

  const iconState =
    speechRecognitionState === "listening" ? "listening" : ttsState === "speaking" ? "speaking" : "idle";

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/45 p-4">
      <section className="w-full max-w-md rounded-2xl border border-[#D1D5DB] bg-white p-5 shadow-2xl">
        <div className="text-center">
          <div
            className={`mx-auto flex ${role === "elder" ? "h-24 w-24" : "h-20 w-20"} items-center justify-center rounded-full ${
              iconState === "listening" ? "bg-[#FFF7ED] text-[#EA580C]" : "bg-[#EAF5F0] text-[#0E9F6E]"
            }`}
          >
            {iconState === "listening" ? (
              <Mic className={`${role === "elder" ? "h-12 w-12" : "h-10 w-10"} animate-pulse`} />
            ) : iconState === "speaking" ? (
              <Volume2 className={role === "elder" ? "h-12 w-12" : "h-10 w-10"} />
            ) : (
              <MicOff className={role === "elder" ? "h-12 w-12" : "h-10 w-10"} />
            )}
          </div>
          <h3 className="mt-4 text-2xl font-black text-[#111827]">{title}</h3>
          <p
            className={`mt-2 rounded-full px-3 py-1 text-sm font-black ${
              speechRecognitionState === "listening"
                ? "bg-[#EAF5F0] text-[#0E6F52]"
                : speechRecognitionState === "permission_denied"
                  ? "bg-[#FEE2E2] text-[#B42318]"
                  : "bg-[#FAF8F2] text-[#4B5563]"
            }`}
          >
            {micStatusText}
          </p>
          <div className="mt-4 rounded-2xl bg-[#FAF8F2] p-4 text-left">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xl font-black text-[#111827]">{mainStatus}</p>
              {(speechRecognitionState === "permission_requesting" ||
                speechRecognitionState === "recognizing" ||
                isThinking ||
                ttsState === "loading_voices") && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#0E9F6E]" />}
            </div>
            {helperText && <p className="mt-2 font-bold text-[#6B4F35]">{helperText}</p>}
            {transcript && speechRecognitionState !== "recognized" && (
              <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-bold text-[#8A4700]">
                {copy.interim}
                {transcript}
              </p>
            )}
            {reply && (ttsState === "speaking" || ttsState === "ready" || ttsState === "blocked" || ttsState === "error") && (
              <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-bold leading-6 text-[#4B5563]">{reply}</p>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[#D1D5DB] bg-[#FAF8F2] p-3">
          <label className="block">
            <span className="text-sm font-black text-[#111827]">
              {speechRecognitionState === "unsupported" ? "语音识别不可用，请打字发送" : "也可以打字补充这一句"}
            </span>
            <textarea
              value={manualText}
              onChange={(event) => setManualText(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 font-bold leading-6 outline-none focus:border-[#0E9F6E]"
            />
          </label>
          <button
            type="button"
            onClick={() => void sendRound(manualText)}
            disabled={isThinking}
            className="mt-2 inline-flex h-10 items-center gap-2 rounded-lg bg-[#0E9F6E] px-3 text-sm font-black text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            发送文字
          </button>
        </div>

        <div className={`mt-4 grid gap-3 ${reply || speechRecognitionState === "recognized" || speechRecognitionState === "listening" ? "grid-cols-3" : "grid-cols-2"}`}>
          {renderPrimaryButtons()}
        </div>
      </section>
    </div>
  );
}
