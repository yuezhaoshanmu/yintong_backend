import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
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
  getChineseVoices,
  isSpeechSupported,
  loadVoiceSettings,
  NO_NATURAL_CHINESE_VOICE_MESSAGE,
  saveVoiceSettings,
  speakText,
  stopSpeaking,
  VoiceRatePreset,
  VoiceSettings,
} from "../../utils/speech";
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

const quickActions: Record<AssistantRole, string[]> = {
  elder: ["帮我整理这段回忆", "帮我给孩子回一句话", "帮我想一个故事标题", "陪我聊聊天"],
  child: ["给我一点提示", "再讲一遍爷爷的故事", "这个物品为什么对？", "我想给爷爷说句话"],
};

type ConnectionState = "checking" | "connected" | "fallback" | "unconfigured";

const rateLabels: Record<VoiceRatePreset, string> = {
  slow: "慢",
  normal: "标准",
  fast: "稍快",
};

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
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    getAiAssistantMode() === "deepseek" ? "checking" : "fallback"
  );
  const noVoiceNoticeShownRef = useRef(false);
  const cloudTtsNoticeShownRef = useRef(false);

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
      : connectionState === "unconfigured"
        ? "AI 服务未配置"
        : connectionState === "checking"
          ? "正在检查连接"
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
    return () => stopSpeaking();
  }, []);

  useEffect(() => {
    if (!isSpeechSupported()) return undefined;
    const refreshVoices = () => {
      const voices = getChineseVoices();
      setChineseVoices(voices);
      if (open && voices.length === 0 && !noVoiceNoticeShownRef.current) {
        noVoiceNoticeShownRef.current = true;
        onShowToast(NO_NATURAL_CHINESE_VOICE_MESSAGE, "info");
      }
    };
    refreshVoices();
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
      setConnectionState("checking");
      const health = await checkDeepSeekHealth();
      if (cancelled) return;
      if (health.ok && health.hasKey) {
        setConnectionState("connected");
      } else if (!health.hasKey && !health.proxyMissing) {
        setConnectionState("unconfigured");
      } else {
        setConnectionState("fallback");
        if (health.proxyMissing) onShowToast("AI 代理服务未启动，可使用 vercel dev 或 npm run dev:all。", "info");
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
    if (message.includes("云端语音服务")) {
      if (cloudTtsNoticeShownRef.current) return;
      cloudTtsNoticeShownRef.current = true;
    }
    onShowToast(message, "info");
  }

  function playReply(messageId: string, text: string, fromAuto = false) {
    if (!isSpeechSupported()) {
      onShowToast("当前浏览器不支持语音播报，请阅读文字回复。", "info");
      return;
    }
    speakText(text, {
      role,
      voiceURI: voiceSettings.selectedVoiceURI,
      ratePreset: voiceSettings.ratePreset,
      onNotice: handleSpeechNotice,
      onStart: () => setSpeakingMessageId(messageId),
      onEnd: () => setSpeakingMessageId((current) => (current === messageId ? "" : current)),
      onError: () => {
        setSpeakingMessageId("");
        onShowToast(
          fromAuto ? "浏览器阻止了自动朗读，请点击播放按钮。" : "语音播报失败，请稍后再试。",
          "error"
        );
      },
    });
  }

  function stopReply() {
    stopSpeaking();
    setSpeakingMessageId("");
  }

  function previewVoice() {
    const sample =
      role === "elder"
        ? "您好，我会慢一点、清楚一点陪您聊天。"
        : "你好呀，我会轻快一点陪你听故事。";
    playReply("voice-preview", sample);
  }

  async function sendMessage(text = input) {
    const clean = text.trim();
    if (!clean || loading) return;
    setInput("");
    setLoading(true);
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
      if (voiceSettings.autoSpeak) playReply(assistantMessage.id, answer.content, true);
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
      if (voiceSettings.autoSpeak) playReply(fallbackId, fallback, true);
      onShowToast("AI 服务暂时不可用，已切换为演示回复。", "info");
    } finally {
      setLoading(false);
    }
  }

  function startVoiceInput() {
    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) {
      onShowToast("当前浏览器不能自动识别语音，可以直接打字。", "info");
      return;
    }
    try {
      const recognition = new RecognitionCtor();
      recognition.lang = "zh-CN";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let text = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          text += event.results[index][0]?.transcript ?? "";
        }
        setInput(text.trim());
      };
      recognition.onerror = () => onShowToast("没有听清楚，可以再试一次。", "info");
      recognition.onend = () => undefined;
      recognition.start();
    } catch {
      onShowToast("语音输入启动失败，可以先打字。", "error");
    }
  }

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
                  : connectionState === "unconfigured"
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
                        onClick={() => playReply(message.id, message.content)}
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
                        onClick={() => playReply(message.id, message.content)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#D8C8B0] bg-white px-2 text-xs font-black text-[#6B4F35]"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        重播
                      </button>
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
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={2}
                placeholder={role === "elder" ? "慢慢说，我帮您记下来" : "问我一个小问题"}
                className="min-h-12 flex-1 resize-none rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm font-bold leading-6 outline-none focus:border-[#0E9F6E]"
              />
              <button
                onClick={startVoiceInput}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D1D5DB] hover:bg-[#F3F4F6]"
                aria-label="语音输入"
              >
                <Mic className="h-5 w-5" />
              </button>
              <button
                onClick={() => setVoiceCallOpen(true)}
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
