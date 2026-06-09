import React, { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, RotateCcw, Send, Square, Volume2 } from "lucide-react";
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

type AiVoiceCallPanelProps = {
  role: AssistantRole;
  currentUser: AppUser;
  currentStory?: MemoryStory;
  currentTask?: ChildTask;
  onClose: () => void;
  onShowToast: (message: string, type?: ToastKind) => void;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultLike[];
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function getSpeechRecognitionCtor() {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

function voiceMode() {
  return import.meta.env.VITE_AI_VOICE_MODE === "realtime" ? "realtime" : "browser";
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
  const [status, setStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [manualText, setManualText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState(
    role === "elder" ? "我在呢。您说一句，我听着。" : "我在呀。你说一句，我陪你想。"
  );
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceSettings] = useState<VoiceSettings>(() => loadVoiceSettings());
  const sessionIdRef = useRef(`ai-call-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
  const startedAtRef = useRef(Date.now());
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const latestTranscriptRef = useRef("");
  const activeRef = useRef(true);
  const noVoiceNoticeShownRef = useRef(false);
  const cloudTtsNoticeShownRef = useRef(false);

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
    return () => {
      activeRef.current = false;
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

  function finishCall() {
    activeRef.current = false;
    stopSpeaking();
    recognitionRef.current?.stop();
    const duration = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
    endAiCallSession(sessionIdRef.current, duration, "ended");
    onClose();
  }

  function startListening() {
    if (!activeRef.current) return;
    stopSpeaking();
    setIsSpeaking(false);
    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      setStatus("idle");
      onShowToast("当前浏览器不能自动识别语音，可以先手动输入这一句。", "info");
      return;
    }
    try {
      recognitionRef.current?.stop();
      latestTranscriptRef.current = "";
      const recognition = new RecognitionCtor();
      recognition.lang = "zh-CN";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let text = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          text += event.results[index][0]?.transcript ?? "";
        }
        const clean = text.trim();
        latestTranscriptRef.current = clean;
        setTranscript(clean);
        setManualText(clean);
      };
      recognition.onerror = () => {
        setStatus("idle");
        onShowToast("没有听清楚，可以再说一次或手动输入。", "info");
      };
      recognition.onend = () => {
        const clean = latestTranscriptRef.current.trim();
        if (clean) {
          void sendRound(clean);
          return;
        }
        setStatus((value) => (value === "listening" ? "idle" : value));
      };
      recognitionRef.current = recognition;
      setStatus("listening");
      recognition.start();
    } catch {
      setStatus("idle");
      onShowToast("语音识别启动失败，可以先手动输入。", "error");
    }
  }

  function returnToListening() {
    if (!activeRef.current) return;
    window.setTimeout(() => {
      if (activeRef.current) startListening();
    }, 300);
  }

  function playReply(text = reply, fromAuto = false) {
    const clean = text.trim();
    if (!clean) return;
    if (!isSpeechSupported()) {
      setStatus("idle");
      setIsSpeaking(false);
      onShowToast("当前浏览器不支持语音播报，请阅读文字回复。", "info");
      return;
    }
    setStatus("speaking");
    speakText(clean, {
      role,
      voiceURI: voiceSettings.selectedVoiceURI,
      ratePreset: voiceSettings.ratePreset,
      onNotice: handleSpeechNotice,
      onStart: () => {
        setIsSpeaking(true);
        setStatus("speaking");
      },
      onEnd: () => {
        setIsSpeaking(false);
        setStatus("listening");
        returnToListening();
      },
      onError: () => {
        setIsSpeaking(false);
        setStatus("idle");
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
      onShowToast("请先说一句或输入一句话。", "error");
      return;
    }
    const currentRecognition = recognitionRef.current;
    recognitionRef.current = null;
    latestTranscriptRef.current = "";
    currentRecognition?.stop();
    setStatus("thinking");
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

  const title = role === "elder" ? "AI 陪伴小助手" : "故事小伙伴";
  const statusText =
    status === "listening"
      ? "正在听你说"
      : status === "thinking"
        ? "我想一想"
        : status === "speaking"
          ? "正在朗读"
          : "轮次式语音对话";

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/45 p-4">
      <section className="w-full max-w-md rounded-2xl border border-[#D1D5DB] bg-white p-5 shadow-2xl">
        <div className="text-center">
          <div
            className={`mx-auto flex ${role === "elder" ? "h-24 w-24" : "h-20 w-20"} items-center justify-center rounded-full bg-[#EAF5F0] text-[#0E9F6E]`}
          >
            <Volume2 className={role === "elder" ? "h-12 w-12" : "h-10 w-10"} />
          </div>
          <h3 className="mt-4 text-2xl font-black text-[#111827]">{title}</h3>
          <p className="mt-2 font-black text-[#FD8603]">{statusText}</p>
          <p className="mt-3 rounded-2xl bg-[#FAF8F2] p-4 text-left font-bold leading-7 text-[#4B5563]">
            {reply}
          </p>
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
                onClick={() => {
                  stopSpeaking();
                  setIsSpeaking(false);
                  setStatus("idle");
                }}
                disabled={!isSpeaking}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#B42318] bg-white px-3 text-sm font-black text-[#B42318] disabled:opacity-45"
              >
                <Square className="h-4 w-4" />
                停止
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

        {transcript && (
          <p className="mt-4 rounded-xl bg-[#FFF7ED] px-3 py-2 text-sm font-bold text-[#8A4700]">
            这一轮：{transcript}
          </p>
        )}

        <label className="mt-4 block">
          <span className="text-sm font-black text-[#111827]">手动输入这一句</span>
          <textarea
            value={manualText}
            onChange={(event) => setManualText(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-3 py-2 font-bold leading-6 outline-none focus:border-[#0E9F6E]"
          />
        </label>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <button
            onClick={startListening}
            disabled={status === "thinking"}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#0E9F6E] font-black text-[#0E9F6E] hover:bg-[#EAF5F0] disabled:opacity-50"
          >
            {status === "listening" ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            说一句
          </button>
          <button
            onClick={() => void sendRound()}
            disabled={status === "thinking"}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0E9F6E] font-black text-white hover:bg-[#0C8F62] disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            发送
          </button>
          <button
            onClick={finishCall}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#B42318] font-black text-white hover:bg-[#991B1B]"
          >
            <PhoneOff className="h-4 w-4" />
            结束
          </button>
        </div>
      </section>
    </div>
  );
}
