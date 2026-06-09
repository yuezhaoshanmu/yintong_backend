import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  Heart,
  Images,
  ImagePlus,
  Loader2,
  Mic,
  Play,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { BRAND_IMAGES, PHOTO_TEMPLATES } from "../data";
import { useAuth } from "../auth";
import { saveMediaBlob } from "../mediaDb";
import {
  createDemoAsrText,
  createId,
  createInteraction,
  formatDateTime,
  formatDuration,
} from "../mockLogic";
import { useSilverStore } from "../store";
import { InteractionEvent, MemoryStory, ToastKind } from "../types";
import { getStoryImage } from "../utils/storyImage";
import SafeImage from "./SafeImage";
import StoryDetailModal from "./StoryDetailModal";
import ChatBotWidget from "./ai/ChatBotWidget";
import CameraCapture from "./media/CameraCapture";

type ElderTerminalProps = {
  textScale: "normal" | "large" | "super";
  setTextScale: (scale: "normal" | "large" | "super") => void;
  onShowToast: (message: string, type?: ToastKind) => void;
};

type RecordPhase = "idle" | "recording" | "ready";
type AsrMode = "speech" | "manual" | "demo";
type PhotoTab = "camera" | "upload" | "template";

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
};

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition;
}

function countChinese(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
}

function validateStoryForm(params: {
  title: string;
  fullText: string;
  yearTag: string;
  hasImage: boolean;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const title = params.title.trim();
  const fullText = params.fullText.trim();
  const invalidExact = ["test", "abc", "ysyt", "111"];

  if (!params.hasImage) errors.image = "请先上传照片，或选择一张回忆模板。";
  if (!params.yearTag) errors.yearTag = "请选择年代。";
  if (!title) errors.title = "请填写标题。";
  else if (/^\d+$/.test(title)) errors.title = "标题不能全是数字。";
  else if (countChinese(title) < 2) errors.title = "标题至少需要 2 个中文字符。";

  if (!fullText) errors.fullText = "请写下照片背后的故事。";
  else if (/^\d+$/.test(fullText) || invalidExact.includes(fullText.toLowerCase())) {
    errors.fullText = "故事内容看起来无效，请写一段真实回忆。";
  } else if (countChinese(fullText) < 15) {
    errors.fullText = "故事至少需要 15 个中文字符。";
  }

  return errors;
}

function fileSizeText(size: number): string {
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export default function ElderTerminal({ textScale, setTextScale, onShowToast }: ElderTerminalProps) {
  const { state, addStory, likeStory, addInteraction, markInteractionRead } = useSilverStore();
  const { currentUser } = useAuth();
  const [detailStoryId, setDetailStoryId] = useState<string | null>(null);
  const [listeningStoryId, setListeningStoryId] = useState<string | null>(null);

  const [recordPhase, setRecordPhase] = useState<RecordPhase>("idle");
  const [recordDuration, setRecordDuration] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(Array.from({ length: 18 }, () => 8));
  const [selectedTheme, setSelectedTheme] = useState("老照片");
  const [recordedAudioUrl, setRecordedAudioUrl] = useState("");
  const [recordedAudioKey, setRecordedAudioKey] = useState("");
  const [asrText, setAsrText] = useState("");
  const [editableAsrText, setEditableAsrText] = useState("");
  const [recordError, setRecordError] = useState("");
  const [asrMode, setAsrMode] = useState<AsrMode>("manual");
  const [speechSupported, setSpeechSupported] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const durationRef = useRef(0);
  const transcriptRef = useRef("");
  const timerRef = useRef<number | null>(null);
  const cancelRef = useRef(false);
  const analyserFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoTab, setPhotoTab] = useState<PhotoTab>("upload");
  const [photoTitle, setPhotoTitle] = useState("");
  const [photoStory, setPhotoStory] = useState("");
  const [photoYear, setPhotoYear] = useState("");
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");
  const [uploadedImageKey, setUploadedImageKey] = useState("");
  const [uploadedImageName, setUploadedImageName] = useState("");
  const [uploadedImageSize, setUploadedImageSize] = useState("");
  const [photoUploadSource, setPhotoUploadSource] = useState<"photo" | "camera">("photo");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [photoErrors, setPhotoErrors] = useState<Record<string, string>>({});
  const [isPhotoSaving, setIsPhotoSaving] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);

  const sizes = {
    title: textScale === "super" ? "text-4xl" : textScale === "large" ? "text-3xl" : "text-2xl",
    body: textScale === "super" ? "text-xl" : textScale === "large" ? "text-lg" : "text-base",
    button: textScale === "super" ? "text-xl" : "text-lg",
  };

  const activeStories = useMemo(() => state.stories.filter((story) => !story.deletedAt), [state.stories]);
  const activeStoryIds = useMemo(() => new Set(activeStories.map((story) => story.id)), [activeStories]);
  const childInbox = useMemo(
    () =>
      state.interactions.filter(
        (event) =>
          !event.deletedAt &&
          event.toRole === "elder" &&
          event.fromRole === "child" &&
          (!event.storyId || activeStoryIds.has(event.storyId))
      ),
    [activeStoryIds, state.interactions]
  );
  const currentStoryForAi =
    activeStories.find((story) => story.id === detailStoryId) ?? activeStories[0];
  const selectedTemplate = PHOTO_TEMPLATES.find((item) => item.id === selectedTemplateId);

  useEffect(() => {
    setSpeechSupported(Boolean(getSpeechRecognitionCtor()));
    return () => {
      stopRecorderTimer();
      stopMediaTracks();
      stopWaveform();
      stopRecognition();
    };
  }, []);

  function stopRecorderTimer() {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function stopMediaTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function stopWaveform() {
    if (analyserFrameRef.current != null) {
      window.cancelAnimationFrame(analyserFrameRef.current);
      analyserFrameRef.current = null;
    }
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
  }

  function stopRecognition() {
    try {
      recognitionRef.current?.stop();
    } catch {
      // Some browsers throw when recognition is already stopped.
    }
    recognitionRef.current = null;
  }

  async function startRecording() {
    setRecordError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordError("无法使用麦克风，请检查浏览器权限或改用文字输入。");
      return;
    }
    if (!("MediaRecorder" in window)) {
      setRecordError("当前浏览器不支持录音，请使用 Chrome/Edge。");
      return;
    }

    try {
      cancelRef.current = false;
      chunksRef.current = [];
      transcriptRef.current = "";
      durationRef.current = 0;
      setRecordDuration(0);
      setRecordedAudioUrl("");
      setRecordedAudioKey("");
      setAsrText("");
      setEditableAsrText("");
      setAsrMode("manual");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = handleRecorderStop;
      recorder.start();

      startSpeechRecognition();
      setupWaveform(stream);
      setRecordPhase("recording");
      timerRef.current = window.setInterval(() => {
        durationRef.current += 1;
        setRecordDuration(durationRef.current);
      }, 1000);
    } catch {
      setRecordError("无法使用麦克风，请检查浏览器权限或改用文字输入。");
    }
  }

  function startSpeechRecognition() {
    const RecognitionCtor = getSpeechRecognitionCtor();
    setSpeechSupported(Boolean(RecognitionCtor));
    if (!RecognitionCtor) {
      setAsrMode("manual");
      setRecordError("当前浏览器不支持本地语音识别，已保存录音，请手动补充故事文字。");
      return;
    }

    try {
      const recognition = new RecognitionCtor();
      recognition.lang = "zh-CN";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let finalText = "";
        let interimText = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const transcript = event.results[i][0]?.transcript ?? "";
          if (event.results[i].isFinal) finalText += transcript;
          else interimText += transcript;
        }
        if (finalText) transcriptRef.current = `${transcriptRef.current}${finalText}`;
        const nextText = `${transcriptRef.current}${interimText}`.trim();
        setAsrText(nextText);
        setEditableAsrText(nextText);
        setAsrMode("speech");
      };
      recognition.onerror = (event) => {
        setRecordError(`本地语音识别暂时不可用${event.error ? `：${event.error}` : ""}。停止后可手动补充故事文字。`);
        setAsrMode("manual");
      };
      recognition.onend = () => {
        recognitionRef.current = null;
      };
      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setRecordError("当前浏览器不支持本地语音识别，已保存录音，请手动补充故事文字。");
      setAsrMode("manual");
    }
  }

  function setupWaveform(stream: MediaStream) {
    stopWaveform();
    const AudioContextCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const audioContext = new AudioContextCtor();
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      analyser.getByteFrequencyData(data);
      const bars = Array.from({ length: 18 }, (_, index) => {
        const value = data[index % data.length] ?? 0;
        return Math.max(8, Math.round((value / 255) * 56));
      });
      setWaveform(bars);
      analyserFrameRef.current = window.requestAnimationFrame(draw);
    };
    draw();
  }

  async function handleRecorderStop() {
    stopRecorderTimer();
    stopMediaTracks();
    stopWaveform();
    stopRecognition();
    if (cancelRef.current) return;

    const duration = durationRef.current;
    if (duration < 2) {
      setRecordPhase("idle");
      setRecordError("录音时间太短，请重新录制。");
      return;
    }

    const blob = new Blob(chunksRef.current, { type: mediaRecorderRef.current?.mimeType || "audio/webm" });
    const audioUrl = URL.createObjectURL(blob);
    const audioKey = createId("audio");
    setRecordedAudioUrl(audioUrl);
    setRecordPhase("ready");

    try {
      await saveMediaBlob(audioKey, blob);
      setRecordedAudioKey(audioKey);
    } catch {
      onShowToast("录音可在当前页面播放，但本地持久化失败。", "error");
    }

    const recognized = transcriptRef.current.trim() || asrText.trim();
    if (recognized) {
      setAsrText(recognized);
      setEditableAsrText(recognized);
      setAsrMode("speech");
    } else if (speechSupported) {
      setAsrMode("manual");
      setRecordError("没有识别到清晰语音，请重新录制或手动输入。");
    } else {
      setAsrMode("manual");
      setRecordError("当前浏览器不支持本地语音识别，已保存录音，请手动补充故事文字。");
    }
  }

  function stopRecording() {
    if (durationRef.current < 2) {
      cancelRef.current = true;
      mediaRecorderRef.current?.stop();
      setRecordPhase("idle");
      setRecordError("录音时间太短，请重新录制。");
      return;
    }
    mediaRecorderRef.current?.stop();
  }

  function cancelRecording() {
    cancelRef.current = true;
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    stopRecorderTimer();
    stopMediaTracks();
    stopWaveform();
    stopRecognition();
    setRecordPhase("idle");
    setRecordDuration(0);
    setWaveform(Array.from({ length: 18 }, () => 8));
  }

  function resetRecording() {
    cancelRecording();
    setRecordedAudioUrl("");
    setRecordedAudioKey("");
    setAsrText("");
    setEditableAsrText("");
    setRecordError("");
    setAsrMode("manual");
  }

  function useDemoText() {
    const demo = createDemoAsrText(selectedTheme);
    setAsrMode("demo");
    setAsrText(demo);
    setEditableAsrText(demo);
  }

  function saveVoiceStory() {
    const cleanText = editableAsrText.trim();
    if (countChinese(cleanText) < 15) {
      onShowToast("请先补充或确认故事文字，至少保留 15 个中文字符。", "error");
      return;
    }

    addStory({
      title: `${selectedTheme}里的回忆`,
      fullText: cleanText,
      yearTag: "语音回忆",
      source: "voice",
      audioUrl: recordedAudioUrl,
      audioDuration: recordDuration,
      audioStorageKey: recordedAudioKey,
      audioBlobId: recordedAudioKey,
      asrText: asrMode === "demo" ? "" : asrText.trim(),
      imageUrl: getStoryImage({ title: selectedTheme, summary: cleanText, fullText: cleanText }),
      imageName: `${selectedTheme}回忆配图`,
    });
    resetRecording();
    onShowToast("语音、文字和儿童任务已绑定到同一条回忆。", "success");
  }

  function openPhotoModal(prefillText = "") {
    setPhotoModalOpen(true);
    setPhotoTab("camera");
    setPhotoErrors({});
    if (prefillText) setPhotoStory(prefillText);
  }

  async function handleImageFile(file: File) {
    setPhotoErrors({});
    if (!file.type.startsWith("image/")) {
      setPhotoErrors({ image: "请选择 jpg、png 或 webp 图片。" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setPhotoErrors({ image: "图片不能超过 8MB。" });
      return;
    }

    const imageUrl = URL.createObjectURL(file);
    const imageKey = createId("image");
    setUploadedImageUrl(imageUrl);
    setUploadedImageName(file.name);
    setUploadedImageSize(fileSizeText(file.size));
    setPhotoUploadSource("photo");
    setSelectedTemplateId("");
    try {
      await saveMediaBlob(imageKey, file);
      setUploadedImageKey(imageKey);
      onShowToast("照片已读取，可以继续填写故事。", "success");
    } catch {
      setUploadedImageKey("");
      onShowToast("照片可在当前会话中预览，但持久化失败。", "error");
    }
  }

  async function handleCameraCapture(file: File, previewUrl: string) {
    setPhotoErrors({});
    const imageKey = createId("image");
    setUploadedImageUrl(previewUrl);
    setUploadedImageName(file.name);
    setUploadedImageSize(fileSizeText(file.size));
    setPhotoUploadSource("camera");
    setSelectedTemplateId("");
    try {
      await saveMediaBlob(imageKey, file);
      setUploadedImageKey(imageKey);
      onShowToast("照片已放入故事表单，可以继续填写故事。", "success");
    } catch {
      setUploadedImageKey("");
      onShowToast("照片可在当前会话预览，但本地长期保存失败。", "error");
    }
  }

  async function handlePhotoInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) await handleImageFile(file);
  }

  function handlePhotoDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleImageFile(file);
  }

  function removeUploadedImage() {
    setUploadedImageUrl("");
    setUploadedImageKey("");
    setUploadedImageName("");
    setUploadedImageSize("");
    setPhotoUploadSource("photo");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function savePhotoStory(event: React.FormEvent) {
    event.preventDefault();
    const imageUrl = uploadedImageUrl || selectedTemplate?.imageUrl || "";
    const errors = validateStoryForm({
      title: photoTitle,
      fullText: photoStory,
      yearTag: photoYear || selectedTemplate?.yearTag || "",
      hasImage: Boolean(imageUrl),
    });
    setPhotoErrors(errors);
    if (Object.keys(errors).length) return;

    setIsPhotoSaving(true);
    window.setTimeout(() => {
      addStory({
        title: photoTitle,
        fullText: photoStory,
        yearTag: photoYear || selectedTemplate?.yearTag || "年代待补充",
        source: uploadedImageUrl && photoUploadSource === "camera" ? "camera" : "photo",
        imageUrl,
        imageName: uploadedImageName || selectedTemplate?.title || "回忆模板",
        imageStorageKey: uploadedImageKey,
      });
      setIsPhotoSaving(false);
      setPhotoModalOpen(false);
      setPhotoTitle("");
      setPhotoStory("");
      setPhotoYear("");
      removeUploadedImage();
      setSelectedTemplateId("");
      onShowToast("故事已经保存好了，也给萌萌准备好了小游戏。", "success");
    }, 500);
  }

  function sendReply(eventId: string, storyId?: string) {
    const content = replyDrafts[eventId]?.trim();
    if (!content) {
      onShowToast("请先输入想回复孩子的话。", "error");
      return;
    }
    addInteraction(
      createInteraction({
        type: "elder_text_reply",
        fromRole: "elder",
        toRole: "child",
        storyId,
        parentEventId: eventId,
        content: `爷爷说：${content}`,
      })
    );
    markInteractionRead(eventId, "elder");
    setReplyDrafts((prev) => ({ ...prev, [eventId]: "" }));
    setActiveReplyId(null);
    onShowToast("文字回复已发送给萌萌。", "success");
  }

  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-[#D1D5DB] bg-[#EAF5F0] p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <p className="text-sm font-black text-[#0E9F6E]">家庭回忆本</p>
          <h2 className={`${sizes.title} font-black text-[#111827] mt-1`}>把声音和照片，留给孩子听</h2>
          <p className={`${sizes.body} mt-2 font-semibold text-[#4B5563]`}>
            录一段话、选一张照片，萌萌就能边听边看，还能玩一小关。
          </p>
        </div>
        <div className="rounded-xl bg-white border border-[#D1D5DB] p-2 flex items-center gap-1">
          {(["normal", "large", "super"] as const).map((scale) => (
            <button
              key={scale}
              onClick={() => setTextScale(scale)}
              className={`h-11 min-w-20 rounded-lg px-3 font-black transition ${
                textScale === scale ? "bg-[#0E9F6E] text-white" : "text-[#4B5563] hover:bg-[#F3F4F6]"
              }`}
            >
              {scale === "normal" ? "标准" : scale === "large" ? "大号" : "超大"}
            </button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-[#D1D5DB] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-[#111827]">开始语音采录</h3>
              <p className="mt-1 text-sm font-bold text-[#4B5563]">
                优先使用浏览器本地语音识别，识别不到时可手动补充。
              </p>
            </div>
            <select
              value={selectedTheme}
              onChange={(event) => setSelectedTheme(event.target.value)}
              disabled={recordPhase === "recording"}
              className="h-11 rounded-xl border border-[#D1D5DB] bg-white px-3 font-bold outline-none focus:border-[#0E9F6E]"
            >
              <option value="收音机">收音机</option>
              <option value="白兔糖">白兔糖</option>
              <option value="自行车">自行车</option>
              <option value="老照片">老照片</option>
            </select>
          </div>

          <div className="mt-6 rounded-2xl bg-[#FAF8F2] border border-[#D1D5DB] p-5 min-h-[360px] flex flex-col justify-between">
            <figure className="mb-5 overflow-hidden rounded-[18px] bg-[#F7F0E4] shadow-sm">
              <SafeImage
                src={BRAND_IMAGES.voiceRecording}
                fallbackSrc={BRAND_IMAGES.placeholder}
                alt="老人坐在桌边录音"
                className="h-36 w-full object-cover"
              />
              <figcaption className="px-4 py-2 text-sm font-bold text-[#6B4F35]">坐下来，给孩子讲一段今天想起的事</figcaption>
            </figure>
            {recordPhase === "idle" && (
              <div className="flex flex-col h-full justify-between gap-6">
                <div className={`${sizes.body} font-semibold text-[#111827] leading-8 space-y-2`}>
                  <p>请讲一段真实回忆，例如：“今天我想讲一张老照片的故事。”</p>
                  <p className="text-sm font-bold text-[#4B5563]">
                    {speechSupported
                      ? "当前浏览器支持本地语音识别，录音时会实时显示识别文字。"
                      : "当前浏览器不支持本地语音识别，录音后需要手动补充文字。"}
                  </p>
                </div>
                {recordError && (
                  <div className="rounded-xl border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-3 text-sm font-black text-[#991B1B]">
                    {recordError}
                  </div>
                )}
                <button
                  onClick={startRecording}
                  className="h-16 rounded-2xl bg-[#0E9F6E] text-white font-black hover:bg-[#0C8F62] active:scale-[0.99] flex items-center justify-center gap-3"
                >
                  <Mic className="h-6 w-6" />
                  <span className={sizes.button}>开始语音采录</span>
                </button>
              </div>
            )}

            {recordPhase === "recording" && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-[#FEE2E2] px-4 py-2 text-sm font-black text-[#B42318]">
                    正在录音 {speechSupported ? "并识别文字" : ""}
                  </span>
                  <span className="text-3xl font-black text-[#111827]">{recordDuration} 秒</span>
                </div>
                <div className="h-24 rounded-2xl bg-white border border-[#D1D5DB] flex items-end justify-center gap-2 px-4 py-4">
                  {waveform.map((height, index) => (
                    <div key={index} className="w-2 rounded-full bg-[#0E9F6E] transition-all" style={{ height }} />
                  ))}
                </div>
                <div>
                  <p className="text-sm font-black text-[#0E9F6E]">实时识别出的文字</p>
                  <div className="mt-2 min-h-24 rounded-xl border border-[#D1D5DB] bg-white p-4 text-base font-bold leading-7 text-[#111827]">
                    {editableAsrText || (speechSupported ? "请开始讲话，识别文字会出现在这里。" : "当前浏览器不支持本地识别，停止后可手动补充。")}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={stopRecording}
                    className="h-14 rounded-xl bg-[#0E9F6E] text-white font-black hover:bg-[#0C8F62] flex items-center justify-center gap-2"
                  >
                    <Check className="h-5 w-5" />
                    停止并保存录音
                  </button>
                  <button
                    onClick={cancelRecording}
                    className="h-14 rounded-xl border border-[#B42318] text-[#B42318] font-black hover:bg-[#FEE2E2]"
                  >
                    取消录音
                  </button>
                </div>
              </div>
            )}

            {recordPhase === "ready" && (
              <div className="space-y-4">
                {recordError && (
                  <div className="rounded-xl border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-3 text-sm font-black text-[#991B1B]">
                    {recordError}
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-[#0E9F6E]">识别出的文字</p>
                    {asrMode === "demo" && (
                      <span className="rounded-full bg-[#FFEEDC] px-3 py-1 text-xs font-black text-[#8A4700]">
                        演示模式文本，可手动修改，不代表真实语音识别结果
                      </span>
                    )}
                  </div>
                  <textarea
                    value={editableAsrText}
                    onChange={(event) => setEditableAsrText(event.target.value)}
                    rows={6}
                    placeholder="没有识别到清晰语音时，请在这里手动补充故事文字。"
                    className="mt-2 w-full rounded-xl border border-[#D1D5DB] bg-white p-4 text-base font-bold leading-7 outline-none focus:border-[#0E9F6E]"
                  />
                </div>
                {recordedAudioUrl && (
                  <div className="rounded-xl bg-white border border-[#D1D5DB] p-3">
                    <p className="mb-2 text-sm font-black text-[#111827]">原声录音 {formatDuration(recordDuration)}</p>
                    <audio controls src={recordedAudioUrl} className="w-full" />
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <button
                    onClick={resetRecording}
                    className="h-12 rounded-xl border border-[#D1D5DB] font-black hover:bg-white flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    重新录制
                  </button>
                  <button
                    type="button"
                    onClick={useDemoText}
                    className="h-12 rounded-xl border border-[#FD8603] px-3 font-black text-[#FD8603] hover:bg-[#FFEEDC]"
                  >
                    演示模式自动生成文本
                  </button>
                  <button onClick={saveVoiceStory} className="h-12 rounded-xl bg-[#0E9F6E] text-white font-black hover:bg-[#0C8F62]">
                    保存为回忆
                  </button>
                  <button onClick={() => openPhotoModal(editableAsrText)} className="h-12 rounded-xl bg-[#FD8603] text-white font-black hover:bg-[#E67500]">
                    继续添加照片
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => openPhotoModal()}
          className="rounded-2xl border-2 border-dashed border-[#D1D5DB] bg-white p-8 shadow-sm hover:border-[#0E9F6E] hover:bg-[#EAF5F0]/30 text-left transition min-h-[420px] flex flex-col justify-center items-center gap-5"
        >
          <div className="h-20 w-20 rounded-full bg-[#EAF5F0] text-[#0E9F6E] flex items-center justify-center">
            <ImagePlus className="h-10 w-10" />
          </div>
          <div className="text-center max-w-md">
            <h3 className="text-2xl font-black text-[#111827]">选择照片讲述回忆</h3>
            <p className="mt-3 text-base font-semibold text-[#4B5563]">
              支持本地上传和拖拽，也保留几张老物件照片备用。保存后，萌萌那边马上能看到。
            </p>
          </div>
        </button>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-2xl font-black text-[#111827]">时光回忆时间线</h3>
          <span className="rounded-full bg-[#EAF5F0] px-4 py-2 text-sm font-black text-[#0E9F6E]">
            {activeStories.length} 条回忆
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {activeStories.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              isListening={listeningStoryId === story.id}
              onToggleListen={() => setListeningStoryId((prev) => (prev === story.id ? null : story.id))}
              onLike={() => {
                likeStory(story.id, "guardian");
                onShowToast("已记录一次家人点赞。", "success");
              }}
              onOpen={() => setDetailStoryId(story.id)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#D1D5DB] bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl font-black text-[#111827]">家人互动信箱</h3>
            <p className="mt-1 text-sm font-bold text-[#4B5563]">孩子送花、共情回应和语音都会实时出现在这里。</p>
          </div>
          <span className="rounded-full bg-[#FEE2E2] px-4 py-2 text-sm font-black text-[#B42318]">
            {childInbox.filter((event) => !event.readByElder && !event.isRead).length} 条未读
          </span>
        </div>

        <div className="mt-5 space-y-4">
          {childInbox.length === 0 ? (
            <div className="rounded-xl bg-[#FAF8F2] p-5 text-center font-bold text-[#4B5563]">
              孩子完成任务或送花后，这里会出现新消息。
            </div>
          ) : (
            childInbox.map((event) => {
              const story = activeStories.find((item) => item.id === event.storyId);
              const elderReplies = state.interactions.filter(
                (reply) => !reply.deletedAt && reply.parentEventId === event.id && reply.fromRole === "elder"
              );
              return (
                <div key={event.id} className="rounded-xl border border-[#D1D5DB] bg-[#FAF8F2] p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <SafeImage
                        src={BRAND_IMAGES.childAvatar}
                        fallbackSrc={BRAND_IMAGES.avatarPlaceholder}
                        alt="萌萌头像"
                        className="h-12 w-12 rounded-full border border-[#D1D5DB]"
                      />
                      <div>
                        <p className="text-xs font-black text-[#0E9F6E]">{formatDateTime(event.createdAt)}</p>
                        <p className="mt-1 text-xs font-bold text-[#4B5563]">关联故事：{story?.title ?? "未关联故事"}</p>
                        <p className="mt-2 text-lg font-black text-[#111827]">{event.content}</p>
                        {event.transcript && <p className="mt-1 text-sm font-bold text-[#4B5563]">语音转文字：{event.transcript}</p>}
                      </div>
                    </div>
                    {!event.readByElder && !event.isRead && <span className="rounded-full bg-[#FD8603] px-3 py-1 text-xs font-black text-white">新消息</span>}
                  </div>
                  {event.audioUrl && (
                    <div className="mt-3 rounded-xl bg-white border border-[#D1D5DB] p-3">
                      <p className="mb-2 text-sm font-black text-[#111827]">
                        儿童语音 {event.audioDuration ? formatDuration(event.audioDuration) : ""}
                      </p>
                      <audio controls src={event.audioUrl} className="w-full" />
                    </div>
                  )}
                  {elderReplies.length > 0 && (
                    <div className="mt-4 space-y-2 rounded-2xl bg-[#EAF5F0] p-4">
                      <p className="font-black text-[#0E6F52]">你已回复</p>
                      {elderReplies.map((reply) => (
                        <div key={reply.id} className="rounded-xl bg-white p-3">
                          <p className="text-sm font-bold text-[#4B5563]">{formatDateTime(reply.createdAt)}</p>
                          <p className="mt-1 font-black text-[#111827]">{reply.transcript || reply.content}</p>
                          {reply.audioUrl && <audio controls src={reply.audioUrl} className="mt-2 w-full" />}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button onClick={() => markInteractionRead(event.id, "elder")} className="h-11 rounded-xl border border-[#D1D5DB] px-4 font-black hover:bg-white">
                      标为已读
                    </button>
                    <button
                      onClick={() => setActiveReplyId(activeReplyId === event.id ? null : event.id)}
                      className="h-11 rounded-xl border border-[#0E9F6E] px-4 font-black text-[#0E9F6E] hover:bg-[#EAF5F0]"
                    >
                      回复一句话
                    </button>
                  </div>
                  {activeReplyId === event.id && (
                    <div className="mt-4 space-y-4 rounded-[18px] border border-[#E1D3BF] bg-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <input
                          value={replyDrafts[event.id] ?? ""}
                          onChange={(inputEvent) =>
                            setReplyDrafts((prev) => ({ ...prev, [event.id]: inputEvent.target.value }))
                          }
                          placeholder="给孩子回一句话吧……"
                          className="h-12 flex-1 rounded-xl border border-[#D1D5DB] px-4 font-bold outline-none focus:border-[#0E9F6E]"
                        />
                        <button
                          onClick={() => sendReply(event.id, event.storyId)}
                          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0E9F6E] px-5 font-black text-white hover:bg-[#0C8F62]"
                        >
                          <Send className="h-4 w-4" />
                          发送文字回复
                        </button>
                      </div>
                      <ElderVoiceReplyBox
                        parentEvent={event}
                        onShowToast={onShowToast}
                        onSent={() => {
                          markInteractionRead(event.id, "elder");
                          setActiveReplyId(null);
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {photoModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white border border-[#D1D5DB] shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-[#D1D5DB] px-6 py-5 flex items-center justify-between z-10">
              <div>
                <h3 className="text-2xl font-black text-[#111827]">上传图片 / 记录回忆</h3>
                <p className="mt-1 text-sm font-bold text-[#4B5563]">默认拍照上传，也可以从相册选择或使用模板图片。</p>
              </div>
              <button
                onClick={() => setPhotoModalOpen(false)}
                className="h-11 w-11 rounded-full border border-[#D1D5DB] hover:bg-[#F3F4F6] flex items-center justify-center"
                aria-label="关闭上传弹窗"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={savePhotoStory} className="p-6 space-y-5">
              <div className="grid grid-cols-1 gap-3 rounded-xl bg-[#F4F2EB] p-2 md:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setPhotoTab("camera")}
                  className={`rounded-xl p-4 text-left font-black ${
                    photoTab === "camera" ? "bg-white text-[#0E9F6E] shadow-sm" : "text-[#4B5563]"
                  }`}
                >
                  <span className="flex items-center gap-2 text-lg">
                    <Camera className="h-5 w-5" />
                    拍照上传
                  </span>
                  <span className="mt-1 block text-xs font-bold leading-5 text-[#4B5563]">
                    适合直接拍一张老物件、老照片或生活场景
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoTab("upload")}
                  className={`rounded-xl p-4 text-left font-black ${
                    photoTab === "upload" ? "bg-white text-[#0E9F6E] shadow-sm" : "text-[#4B5563]"
                  }`}
                >
                  <span className="flex items-center gap-2 text-lg">
                    <Upload className="h-5 w-5" />
                    本地上传
                  </span>
                  <span className="mt-1 block text-xs font-bold leading-5 text-[#4B5563]">
                    从手机或电脑相册选择照片
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoTab("template")}
                  className={`rounded-xl p-4 text-left font-black ${
                    photoTab === "template" ? "bg-white text-[#0E9F6E] shadow-sm" : "text-[#4B5563]"
                  }`}
                >
                  <span className="flex items-center gap-2 text-lg">
                    <Images className="h-5 w-5" />
                    模板图片
                  </span>
                  <span className="mt-1 block text-xs font-bold leading-5 text-[#4B5563]">
                    没有照片时，可先使用系统模板
                  </span>
                </button>
              </div>

              {photoTab === "camera" ? (
                <CameraCapture onCapture={handleCameraCapture} onCancel={() => setPhotoTab("upload")} />
              ) : photoTab === "upload" ? (
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragActive(true);
                  }}
                  onDragLeave={() => setIsDragActive(false)}
                  onDrop={handlePhotoDrop}
                  className={`rounded-2xl border-2 border-dashed p-5 text-center ${
                    isDragActive ? "border-[#0E9F6E] bg-[#EAF5F0]" : "border-[#D1D5DB] bg-[#FAF8F2]"
                  }`}
                >
                  {uploadedImageUrl ? (
                    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-5 text-left">
                      <SafeImage
                        src={uploadedImageUrl}
                        fallbackSrc={BRAND_IMAGES.placeholder}
                        alt={uploadedImageName}
                        className="h-48 w-full rounded-xl border border-[#D1D5DB]"
                      />
                      <div className="space-y-3">
                        <p className="text-sm font-black text-[#0E9F6E]">上传成功</p>
                        <p className="text-lg font-black text-[#111827] break-all">{uploadedImageName}</p>
                        <p className="text-sm font-bold text-[#4B5563]">文件大小：{uploadedImageSize}</p>
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="h-11 rounded-xl border border-[#0E9F6E] px-4 font-black text-[#0E9F6E] hover:bg-[#EAF5F0]"
                          >
                            重新选择
                          </button>
                          <button
                            type="button"
                            onClick={removeUploadedImage}
                            className="h-11 rounded-xl border border-[#B42318] px-4 font-black text-[#B42318] hover:bg-[#FEE2E2] flex items-center gap-2"
                          >
                            <Trash2 className="h-4 w-4" />
                            删除图片
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 flex flex-col items-center gap-4">
                      <Upload className="h-12 w-12 text-[#0E9F6E]" />
                      <p className="text-xl font-black text-[#111827]">点击选择，或把图片拖到这里</p>
                      <p className="text-sm font-bold text-[#4B5563]">支持 jpg、png、webp，最大 8MB。</p>
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="h-12 rounded-xl bg-[#0E9F6E] px-5 font-black text-white hover:bg-[#0C8F62]">
                        选择本地图片
                      </button>
                    </div>
                  )}
                  <input ref={fileInputRef} onChange={handlePhotoInput} type="file" accept="image/*" className="hidden" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {PHOTO_TEMPLATES.map((template) => (
                    <button
                      type="button"
                      key={template.id}
                      onClick={() => {
                        setSelectedTemplateId(template.id);
                        setPhotoTitle((prev) => prev || template.title);
                        setPhotoYear((prev) => prev || template.yearTag);
                        setPhotoStory((prev) => prev || template.prompt);
                        removeUploadedImage();
                      }}
                      className={`rounded-xl overflow-hidden border-4 text-left bg-white ${
                        selectedTemplateId === template.id ? "border-[#0E9F6E]" : "border-[#D1D5DB] hover:border-[#0E9F6E]"
                      }`}
                    >
                      <SafeImage
                        src={template.imageUrl}
                        fallbackSrc={BRAND_IMAGES.placeholder}
                        alt={template.title}
                        className="h-32 w-full object-cover"
                      />
                      <div className="p-3">
                        <p className="font-black text-[#111827]">{template.title}</p>
                        <p className="text-xs font-bold text-[#4B5563]">{template.yearTag}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {photoErrors.image && <p className="text-sm font-black text-[#B42318]">{photoErrors.image}</p>}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm font-black text-[#111827]">年代</span>
                  <select
                    value={photoYear}
                    onChange={(event) => setPhotoYear(event.target.value)}
                    className="mt-1 h-12 w-full rounded-xl border border-[#D1D5DB] bg-white px-4 font-bold outline-none focus:border-[#0E9F6E]"
                  >
                    <option value="">请选择年代</option>
                    <option value="1970年前后">1970年前后</option>
                    <option value="1975年前后">1975年前后</option>
                    <option value="1980年前后">1980年前后</option>
                    <option value="1990年前后">1990年前后</option>
                    <option value="2000年前后">2000年前后</option>
                  </select>
                  {photoErrors.yearTag && <span className="mt-1 block text-sm font-black text-[#B42318]">{photoErrors.yearTag}</span>}
                </label>
                <label className="block">
                  <span className="text-sm font-black text-[#111827]">标题</span>
                  <input
                    value={photoTitle}
                    onChange={(event) => setPhotoTitle(event.target.value)}
                    placeholder="例如：老屋门口的全家照"
                    className="mt-1 h-12 w-full rounded-xl border border-[#D1D5DB] px-4 font-bold outline-none focus:border-[#0E9F6E]"
                  />
                  {photoErrors.title && <span className="mt-1 block text-sm font-black text-[#B42318]">{photoErrors.title}</span>}
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-black text-[#111827]">故事</span>
                <textarea
                  value={photoStory}
                  onChange={(event) => setPhotoStory(event.target.value)}
                  rows={5}
                  placeholder="写下照片背后的时间、人物、地点和你还记得的细节。"
                  className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-4 py-3 font-bold leading-7 outline-none focus:border-[#0E9F6E]"
                />
                {photoErrors.fullText && <span className="mt-1 block text-sm font-black text-[#B42318]">{photoErrors.fullText}</span>}
              </label>

              <button
                type="submit"
                disabled={isPhotoSaving}
                className="h-14 w-full rounded-xl bg-[#0E9F6E] font-black text-white hover:bg-[#0C8F62] disabled:bg-[#9CA3AF] flex items-center justify-center gap-2"
              >
                {isPhotoSaving && <Loader2 className="h-5 w-5 animate-spin" />}
                保存并生成回忆
              </button>
            </form>
          </div>
        </div>
      )}

      {detailStoryId && (
        <StoryDetailModal storyId={detailStoryId} mode="elder" onClose={() => setDetailStoryId(null)} onShowToast={onShowToast} />
      )}

      {currentUser && (
        <ChatBotWidget
          role="elder"
          currentUser={currentUser}
          currentStory={currentStoryForAi}
          onInsertToStoryDraft={(text) => openPhotoModal(text)}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
}

function ElderVoiceReplyBox({
  parentEvent,
  onShowToast,
  onSent,
}: {
  parentEvent: InteractionEvent;
  onShowToast: (message: string, type?: ToastKind) => void;
  onSent: () => void;
}) {
  const { addInteraction } = useSilverStore();
  const [phase, setPhase] = useState<"idle" | "recording" | "ready">("idle");
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioKey, setAudioKey] = useState("");
  const [transcript, setTranscript] = useState("");
  const [editableTranscript, setEditableTranscript] = useState("");
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");

  function clearTimer() {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function cleanup() {
    clearTimer();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    try {
      recognitionRef.current?.stop();
    } catch {
      // Recognition may already be stopped.
    }
    recognitionRef.current = null;
  }

  function startReplyRecognition() {
    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) return;
    try {
      const recognition = new RecognitionCtor();
      recognition.lang = "zh-CN";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let finalText = transcriptRef.current;
        let interimText = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const text = result[0]?.transcript ?? "";
          if (result.isFinal) finalText = `${finalText}${text}`;
          else interimText = `${interimText}${text}`;
        }
        transcriptRef.current = finalText;
        const nextText = `${finalText}${interimText}`.trim();
        setTranscript(nextText);
        setEditableTranscript(nextText);
      };
      recognition.onerror = () => undefined;
      recognition.onend = () => undefined;
      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      recognitionRef.current = null;
    }
  }

  async function startVoiceReply() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
      setError("当前浏览器不能录音，可以先发送文字回复。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      transcriptRef.current = "";
      setTranscript("");
      setEditableTranscript("");
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void finishVoiceReply(recorder.mimeType || "audio/webm");
      };
      recorder.start();
      startReplyRecognition();
      setDuration(0);
      setPhase("recording");
      timerRef.current = window.setInterval(() => {
        setDuration(Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)));
      }, 500);
    } catch {
      setError("无法使用麦克风，请检查浏览器权限。");
    }
  }

  async function finishVoiceReply(mimeType: string) {
    cleanup();
    const seconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const key = createId("elder-reply-audio");
    const url = URL.createObjectURL(blob);
    setDuration(seconds);
    setAudioUrl(url);
    try {
      await saveMediaBlob(key, blob);
      setAudioKey(key);
    } catch {
      setAudioKey("");
      onShowToast("这段回复可以在当前页面播放，但本地保存失败。", "error");
    }
    setPhase("ready");
  }

  function stopVoiceReply() {
    recorderRef.current?.stop();
  }

  function resetVoiceReply() {
    cleanup();
    setPhase("idle");
    setDuration(0);
    setAudioUrl("");
    setAudioKey("");
    setTranscript("");
    setEditableTranscript("");
    setError("");
  }

  function sendVoiceReply() {
    if (!audioUrl) {
      onShowToast("请先录一段话再发送。", "error");
      return;
    }
    const finalText = editableTranscript.trim();
    addInteraction(
      createInteraction({
        type: "elder_voice_reply",
        fromRole: "elder",
        toRole: "child",
        storyId: parentEvent.storyId,
        parentEventId: parentEvent.id,
        content: finalText ? `爷爷给萌萌录了一句话：${finalText}` : "爷爷给萌萌录了一句话。",
        transcript: finalText || transcript.trim(),
        audioUrl,
        audioStorageKey: audioKey,
        audioDuration: duration,
        readByChild: false,
      })
    );
    resetVoiceReply();
    onSent();
    onShowToast("语音回复已发送给萌萌。", "success");
  }

  return (
    <div className="rounded-2xl bg-[#F7F0E4] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-black text-[#3F2D1F]">录音回复孩子</p>
        {phase === "idle" && (
          <button
            onClick={startVoiceReply}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#7A4E2D] px-4 font-black text-white hover:bg-[#633D23]"
          >
            <Mic className="h-4 w-4" />
            开始录音回复
          </button>
        )}
        {phase === "recording" && (
          <button
            onClick={stopVoiceReply}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#B42318] px-4 font-black text-white hover:bg-[#991B1B]"
          >
            <Mic className="h-4 w-4" />
            正在录音 {formatDuration(duration)}
          </button>
        )}
      </div>
      {error && <p className="mt-3 rounded-xl bg-[#FEE2E2] px-3 py-2 text-sm font-black text-[#B42318]">{error}</p>}
      {phase === "ready" && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-white p-3">
            <p className="mb-2 text-sm font-black text-[#3F2D1F]">试听 {formatDuration(duration)}</p>
            <audio controls src={audioUrl} className="w-full" />
          </div>
          {(transcript || editableTranscript) && (
            <label className="block">
              <span className="text-sm font-black text-[#3F2D1F]">识别到的回复</span>
              <textarea
                value={editableTranscript}
                onChange={(event) => setEditableTranscript(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 font-bold leading-6 outline-none focus:border-[#7A4E2D]"
              />
            </label>
          )}
          {!transcript && (
            <p className="text-sm font-bold text-[#6B4F35]">没有识别到文字也没关系，录音会原声发给萌萌。</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={resetVoiceReply}
              className="h-10 rounded-xl border border-[#D1D5DB] bg-white px-4 font-black hover:bg-[#F3F4F6]"
            >
              重新录制
            </button>
            <button
              onClick={sendVoiceReply}
              className="h-10 rounded-xl bg-[#0E9F6E] px-4 font-black text-white hover:bg-[#0C8F62]"
            >
              发送给孩子
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StoryCard({
  story,
  isListening,
  onToggleListen,
  onLike,
  onOpen,
}: {
  key?: React.Key;
  story: MemoryStory;
  isListening: boolean;
  onToggleListen: () => void;
  onLike: () => void;
  onOpen: () => void;
}) {
  const statusClass =
    story.safetyStatus === "safe"
      ? "bg-[#EAF5F0] text-[#0E9F6E]"
      : story.safetyStatus === "pending"
        ? "bg-[#FFEEDC] text-[#8A4700]"
        : "bg-[#FEE2E2] text-[#B42318]";
  const statusText = story.safetyStatus === "safe" ? "已通过" : story.safetyStatus === "pending" ? "待确认" : "暂时隐藏";

  return (
    <article className="rounded-2xl border border-[#D1D5DB] bg-white overflow-hidden shadow-sm">
      <div className="h-52 bg-[#F4F2EB]">
        <SafeImage
          src={getStoryImage(story)}
          fallbackSrc={BRAND_IMAGES.placeholder}
          alt={story.imageName || story.title}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-[#F4F2EB] px-3 py-1 text-xs font-black text-[#4B5563]">{story.yearTag}</span>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClass}`}>{statusText}</span>
        </div>
        <div>
          <h4 className="text-xl font-black text-[#111827]">{story.title}</h4>
          <p className="mt-2 line-clamp-3 text-sm font-semibold leading-6 text-[#4B5563]">{story.summary}</p>
        </div>
        {story.audioUrl && (
          <div className="rounded-xl bg-[#FAF8F2] border border-[#D1D5DB] p-3">
            <p className="text-sm font-black text-[#111827]">🎙 爷爷原声 {formatDuration(story.audioDuration)}</p>
            {isListening && <audio controls autoPlay src={story.audioUrl} className="mt-2 w-full" />}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          {story.audioUrl && (
            <button
              onClick={onToggleListen}
              className="h-11 rounded-xl border border-[#0E9F6E] px-4 font-black text-[#0E9F6E] hover:bg-[#EAF5F0] flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              ▶ 听这段故事
            </button>
          )}
          <button onClick={onOpen} className="h-11 flex-1 rounded-xl bg-[#0E9F6E] px-4 font-black text-white hover:bg-[#0C8F62]">
            📖 查看完整故事
          </button>
          <button
            onClick={onLike}
            className="h-11 rounded-xl border border-[#FD8603] px-4 font-black text-[#FD8603] hover:bg-[#FFEEDC] flex items-center gap-2"
          >
            <Heart className="h-4 w-4" />
            {story.likes}
          </button>
        </div>
      </div>
    </article>
  );
}
