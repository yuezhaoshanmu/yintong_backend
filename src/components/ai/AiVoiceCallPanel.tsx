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
  VoiceSettings,
} from "../../utils/speech";
import {
  isSpeechRecognitionSupported,
  startSpeechRecognition,
  VoiceInputState,
} from "../../utils/speechRecognition";

type AiVoiceCallPanelProps = {
  role: AssistantRole;
  currentUser: AppUser;
  currentStory?: MemoryStory;
  currentTask?: ChildTask;
  onClose: () => void;
  onShowToast: (message: string, type?: ToastKind) => void;
};

type MicState = "off" | "requesting" | "on" | "denied";

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
  const recognitionSupported = isSpeechRecognitionSupported();
  const [voiceState, setVoiceState] = useState<VoiceInputState>("idle");
  const [micState, setMicState] = useState<MicState>(recognitionSupported ? "off" : "denied");
  const [micMuted, setMicMuted] = useState(false);
  const [manualText, setManualText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState(
    role === "elder" ? "我在呢。您说一句，我听着。" : "我在哦。你说一句，我陪你想。"
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [listeningSeconds, setListeningSeconds] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceSettings] = useState<VoiceSettings>(() => loadVoiceSettings());
  const sessionIdRef = useRef(`ai-call-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
  const startedAtRef = useRef(Date.now());
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const finalTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const recognitionHadErrorRef = useRef(false);
  const ignoreRecognitionEndRef = useRef(false);
  const activeRef = useRef(true);
  const listenTimerRef = useRef<number | null>(null);
  const noVoiceNoticeShownRef = useRef(false);
  const cloudTtsNoticeShownRef = useRef(false);

  const title = role === "elder" ? "正在和 AI 陪伴小助手通话" : "正在和故事小伙伴通话";
  const copy =
    role === "elder"
      ? {
          listening: "正在听您说话",
          missed: "没听清楚，您可以再说一遍",
          heard: "我听到了：",
          thinking: "我正在帮您整理",
          speaking: "正在为您朗读",
        }
      : {
          listening: "我在听你说哦",
          missed: "没听清楚，可以再说一遍",
          heard: "我听到了这句话：",
          thinking: "故事小伙伴想一想",
          speaking: "我来读给你听",
        };

  useEffect(() => {
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
    const startTimer = window.setTimeout(() => startListening(true), 350);
    return () => {
      activeRef.current = false;
      window.clearTimeout(startTimer);
      stopVoiceTimer();
      stopSpeaking();
      recognitionRef.current?.stop();
    };
  }, [addAiCallSession, currentStory?.id, currentTask?.id, currentUser.familyId, currentUser.id, onShowToast, role]);

  function handleSpeechNotice(message: string) {
    if (message === NO_NATURAL_CHINESE_VOICE_MESSAGE) {
      if (noVoiceNoticeShownRef.current) return;
      noVoiceNoticeShownRef.current = true;
    }
    if (message.includes("云端语音服务")) {
      if (cloudTtsNoticeShownRef.current) return;
      cloudTtsNoticeShownRef.current = true;
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
  }

  function stopRecognition() {
    ignoreRecognitionEndRef.current = true;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    stopVoiceTimer();
  }

  function finishCall() {
    activeRef.current = false;
    stopRecognition();
    stopSpeaking();
    const duration = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
    endAiCallSession(sessionIdRef.current, duration, "ended");
    onClose();
  }

  function startListening(force = false) {
    if (!activeRef.current || (!force && micMuted)) return;
    stopSpeaking();
    setIsSpeaking(false);
    setErrorMessage("");

    if (!recognitionSupported) {
      setVoiceState("error");
      setMicState("denied");
      setErrorMessage("当前浏览器不支持语音识别，请改用文字输入。");
      return;
    }

    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    recognitionHadErrorRef.current = false;
    ignoreRecognitionEndRef.current = false;
    setTranscript("");
    setListeningSeconds(0);
    setVoiceState("permission_requesting");
    setMicState("requesting");
    recognitionRef.current = startSpeechRecognition({
      lang: "zh-CN",
      onStart: () => {
        if (!activeRef.current) return;
        setMicState("on");
        setVoiceState("listening");
        startVoiceTimer();
      },
      onResult: (text, isFinal) => {
        if (!text) return;
        if (isFinal) {
          finalTranscriptRef.current = `${finalTranscriptRef.current}${text}`;
          interimTranscriptRef.current = "";
        } else {
          interimTranscriptRef.current = text;
        }
        const clean = `${finalTranscriptRef.current}${interimTranscriptRef.current}`.trim();
        setTranscript(clean);
        setManualText(clean);
      },
      onError: (message) => {
        recognitionHadErrorRef.current = true;
        stopVoiceTimer();
        setMicState(message.includes("权限") ? "denied" : "off");
        setVoiceState("error");
        setErrorMessage(message);
        onShowToast(message, "info");
      },
      onEnd: () => {
        stopVoiceTimer();
        recognitionRef.current = null;
        if (ignoreRecognitionEndRef.current) {
          ignoreRecognitionEndRef.current = false;
          return;
        }
        if (!activeRef.current || recognitionHadErrorRef.current || micMuted) return;
        setMicState("off");
        const clean = `${finalTranscriptRef.current}${interimTranscriptRef.current}`.trim();
        if (!clean) {
          setVoiceState("error");
          setErrorMessage(copy.missed);
          return;
        }
        setTranscript(clean);
        setManualText("");
        setVoiceState("recognized");
        window.setTimeout(() => {
          if (activeRef.current) void sendRound(clean);
        }, 450);
      },
    });
  }

  function stopListening() {
    if (voiceState !== "listening" && voiceState !== "permission_requesting") return;
    setVoiceState("recognizing");
    setMicState("off");
    stopVoiceTimer();
    recognitionRef.current?.stop();
  }

  function toggleMute() {
    if (micMuted) {
      setMicMuted(false);
      setMicState("off");
      window.setTimeout(() => startListening(true), 120);
      return;
    }
    setMicMuted(true);
    setMicState("off");
    setVoiceState((current) => (current === "speaking" ? current : "idle"));
    stopRecognition();
  }

  function returnToListening() {
    if (!activeRef.current) return;
    window.setTimeout(() => {
      if (!activeRef.current) return;
      if (micMuted) {
        setVoiceState("idle");
        setMicState("off");
        return;
      }
      startListening(true);
    }, 350);
  }

  function playReply(text = reply, fromAuto = false) {
    const clean = text.trim();
    if (!clean) return;
    if (!isSpeechSupported()) {
      setVoiceState("idle");
      setIsSpeaking(false);
      onShowToast("当前浏览器不支持语音播报，请阅读文字回复。", "info");
      returnToListening();
      return;
    }
    setVoiceState("speaking");
    speakText(clean, {
      role,
      voiceURI: voiceSettings.selectedVoiceURI,
      ratePreset: voiceSettings.ratePreset,
      onNotice: handleSpeechNotice,
      onStart: () => {
        setIsSpeaking(true);
        setVoiceState("speaking");
        setMicState("off");
      },
      onEnd: () => {
        setIsSpeaking(false);
        returnToListening();
      },
      onError: () => {
        setIsSpeaking(false);
        setVoiceState("idle");
        onShowToast(
          fromAuto ? "浏览器阻止了自动朗读，请点击播放按钮。" : "语音播报失败，请稍后再试。",
          "error"
        );
      },
    });
  }

  async function sendRound(text = manualText) {
    const clean = text.trim();
    if (!clean) {
      setVoiceState("error");
      setErrorMessage("请先说一句或输入一句话。");
      return;
    }
    stopRecognition();
    setVoiceState("thinking");
    setMicState("off");
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
      playReply(answer.content, true);
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
      playReply(fallback, true);
      onShowToast("AI 服务暂时不可用，已切换为演示回复。", "info");
    }
  }

  function stopCurrentSpeaking() {
    stopSpeaking();
    setIsSpeaking(false);
    setVoiceState("idle");
    returnToListening();
  }

  const micStatusText =
    micState === "on"
      ? "麦克风已开启"
      : micState === "requesting"
        ? "正在请求权限"
        : micState === "denied"
          ? "权限被拒绝"
          : "麦克风已关闭";

  const mainStatus =
    voiceState === "permission_requesting"
      ? "正在请求麦克风权限……"
      : voiceState === "listening"
        ? copy.listening
        : voiceState === "recognizing"
          ? "正在识别你的声音……"
          : voiceState === "recognized"
            ? `${copy.heard}${transcript}`
            : voiceState === "thinking"
              ? copy.thinking
              : voiceState === "speaking"
                ? copy.speaking
                : voiceState === "error"
                  ? errorMessage || "语音输入暂时不可用"
                  : micMuted
                    ? "麦克风已关闭"
                    : "准备开始说话";

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/45 p-4">
      <section className="w-full max-w-md rounded-2xl border border-[#D1D5DB] bg-white p-5 shadow-2xl">
        <div className="text-center">
          <div
            className={`mx-auto flex ${role === "elder" ? "h-24 w-24" : "h-20 w-20"} items-center justify-center rounded-full ${
              voiceState === "listening" ? "bg-[#FFF7ED] text-[#EA580C]" : "bg-[#EAF5F0] text-[#0E9F6E]"
            }`}
          >
            {voiceState === "listening" ? (
              <Mic className={`${role === "elder" ? "h-12 w-12" : "h-10 w-10"} animate-pulse`} />
            ) : voiceState === "speaking" ? (
              <Volume2 className={role === "elder" ? "h-12 w-12" : "h-10 w-10"} />
            ) : (
              <MicOff className={role === "elder" ? "h-12 w-12" : "h-10 w-10"} />
            )}
          </div>
          <h3 className="mt-4 text-2xl font-black text-[#111827]">{title}</h3>
          <p
            className={`mt-2 rounded-full px-3 py-1 text-sm font-black ${
              micState === "on"
                ? "bg-[#EAF5F0] text-[#0E6F52]"
                : micState === "denied"
                  ? "bg-[#FEE2E2] text-[#B42318]"
                  : "bg-[#FAF8F2] text-[#4B5563]"
            }`}
          >
            {micStatusText}
          </p>
          <div className="mt-4 rounded-2xl bg-[#FAF8F2] p-4 text-left">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xl font-black text-[#111827]">{mainStatus}</p>
              {voiceState === "listening" && (
                <span className="rounded-lg bg-white px-2 py-1 text-sm font-black text-[#9A3412]">
                  {formatVoiceSeconds(listeningSeconds)}
                </span>
              )}
              {(voiceState === "permission_requesting" || voiceState === "recognizing" || voiceState === "thinking") && (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#0E9F6E]" />
              )}
            </div>
            {voiceState === "listening" && <p className="mt-2 font-bold text-[#6B4F35]">说完后点击“停止说话”。</p>}
            {transcript && voiceState !== "recognized" && (
              <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-bold text-[#8A4700]">
                {copy.heard}
                {transcript}
              </p>
            )}
            {voiceState === "speaking" && (
              <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-bold leading-6 text-[#4B5563]">{reply}</p>
            )}
            {voiceState === "error" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => startListening(true)}
                  className="h-10 rounded-lg border border-[#B42318] px-3 text-sm font-black text-[#B42318]"
                >
                  重试
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceState("idle")}
                  className="h-10 rounded-lg bg-white px-3 text-sm font-black text-[#4B5563]"
                >
                  改用文字输入
                </button>
              </div>
            )}
          </div>

          {reply && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                onClick={() => playReply(reply)}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#0E9F6E] bg-white px-3 text-sm font-black text-[#0E6F52]"
              >
                <Volume2 className="h-4 w-4" />
                {isSpeaking ? "正在朗读" : "播放"}
              </button>
              <button
                onClick={stopCurrentSpeaking}
                disabled={!isSpeaking}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#B42318] bg-white px-3 text-sm font-black text-[#B42318] disabled:opacity-45"
              >
                <Square className="h-4 w-4" />
                停止朗读
              </button>
              <button
                onClick={() => playReply(reply)}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#D8C8B0] bg-white px-3 text-sm font-black text-[#6B4F35]"
              >
                <RotateCcw className="h-4 w-4" />
                重播
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-[#D1D5DB] bg-[#FAF8F2] p-3">
          <label className="block">
            <span className="text-sm font-black text-[#111827]">
              {recognitionSupported ? "也可以打字补充这一句" : "语音识别不可用，请打字发送"}
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
            onClick={() => void sendRound()}
            disabled={voiceState === "thinking"}
            className="mt-2 inline-flex h-10 items-center gap-2 rounded-lg bg-[#0E9F6E] px-3 text-sm font-black text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            发送文字
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <button
            onClick={toggleMute}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#0E9F6E] font-black text-[#0E9F6E] hover:bg-[#EAF5F0]"
          >
            {micMuted ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            {micMuted ? "取消静音" : "静音"}
          </button>
          <button
            onClick={stopListening}
            disabled={voiceState !== "listening" && voiceState !== "permission_requesting"}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#EA580C] font-black text-[#C2410C] hover:bg-[#FFF7ED] disabled:opacity-50"
          >
            <Square className="h-4 w-4" />
            停止说话
          </button>
          <button
            onClick={finishCall}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#B42318] font-black text-white hover:bg-[#991B1B]"
          >
            <PhoneOff className="h-4 w-4" />
            结束通话
          </button>
        </div>
      </section>
    </div>
  );
}
