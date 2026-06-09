import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Flower2,
  Lock,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Star,
  Trophy,
  Volume2,
} from "lucide-react";
import { imageAssets } from "../data/imageAssets";
import { saveMediaBlob } from "../mediaDb";
import {
  createId,
  createInteraction,
  formatDateTime,
  formatDuration,
  taskTypeFeedback,
} from "../mockLogic";
import { useAuth } from "../auth";
import { useSilverStore } from "../store";
import { ChildTask, ChildTaskItem, MemoryStory, ToastKind } from "../types";
import { getStoryImage } from "../utils/storyImage";
import { getTaskItemImage } from "../utils/taskItemImage";
import SafeImage from "./SafeImage";
import StoryDetailModal from "./StoryDetailModal";
import ChatBotWidget from "./ai/ChatBotWidget";

type ChildTerminalProps = {
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

function getDefaultChildStoryId(stories: MemoryStory[]): string {
  const candyStory = stories.find((story) => `${story.title}${story.fullText}${story.summary}`.includes("白兔糖"));
  return candyStory?.id ?? stories[0]?.id ?? "";
}

export default function ChildTerminal({ onShowToast }: ChildTerminalProps) {
  const { state, resetStoryTasks, markInteractionRead, addInteraction } = useSilverStore();
  const { currentUser } = useAuth();
  const activeStories = useMemo(() => state.stories.filter((story) => !story.deletedAt), [state.stories]);
  const activeStoryIds = useMemo(() => new Set(activeStories.map((story) => story.id)), [activeStories]);
  const [activeStoryId, setActiveStoryId] = useState(() =>
    getDefaultChildStoryId(state.stories.filter((story) => !story.deletedAt))
  );
  const [activeTaskId, setActiveTaskId] = useState("");
  const [detailStoryId, setDetailStoryId] = useState<string | null>(null);
  const [expandedStory, setExpandedStory] = useState(false);

  const activeStory = activeStories.find((story) => story.id === activeStoryId) ?? activeStories[0];
  const tasks = useMemo(
    () =>
      activeStory
        ? state.childTasks
            .filter((task) => !task.deletedAt && task.memoryStoryId === activeStory.id)
            .sort((a, b) => a.level - b.level)
        : [],
    [activeStory, state.childTasks]
  );
  const activeTask =
    tasks.find((task) => task.id === activeTaskId) ??
    tasks.find((task) => task.status === "active") ??
    tasks[0];
  const allCompleted = tasks.length > 0 && tasks.every((task) => task.status === "completed");
  const childReplies = state.interactions
    .filter(
      (event) =>
        !event.deletedAt &&
        event.fromRole === "elder" &&
        event.toRole === "child" &&
        (!event.storyId || activeStoryIds.has(event.storyId))
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  useEffect(() => {
    childReplies
      .filter((event) => !event.readByChild)
      .forEach((event) => markInteractionRead(event.id, "child"));
  }, [childReplies, markInteractionRead]);

  useEffect(() => {
    if (!activeStory && activeStories[0]) {
      setActiveStoryId(getDefaultChildStoryId(activeStories));
    }
  }, [activeStories, activeStory]);

  useEffect(() => {
    const nextTask = tasks.find((task) => task.status === "active") ?? tasks[0];
    if (nextTask) {
      setActiveTaskId(nextTask.id);
    }
    setExpandedStory(false);
  }, [activeStoryId, tasks.length]);

  if (!activeStory) {
    return (
      <div className="rounded-2xl border border-[#D1D5DB] bg-white p-10 text-center">
        <h2 className="text-2xl font-black text-[#111827]">还没有故事任务</h2>
        <p className="mt-2 font-bold text-[#4B5563]">请先请爷爷讲一段故事，或者选一张家里的老照片。</p>
      </div>
    );
  }

  function sendAiMessageToFamily(text: string) {
    const clean = text.trim();
    if (!clean) return;
    addInteraction(
      createInteraction({
        type: "child_text_reply",
        fromRole: "child",
        toRole: "elder",
        storyId: activeStory.id,
        content: `萌萌想对爷爷说：${clean}`,
      })
    );
    onShowToast("这句话已经送到爷爷的互动信箱。", "success");
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[#F2C94C] bg-[#FFF7ED] p-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="h-52 overflow-hidden rounded-2xl border-4 border-white bg-white shadow-sm lg:w-80 lg:shrink-0">
            <SafeImage
              src={getStoryImage(activeStory)}
              fallbackSrc={imageAssets.placeholders.story}
              alt={activeStory.title}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-[#FD8603]">萌萌的小书桌</p>
            <h2 className="mt-1 text-3xl font-black text-[#111827]">{activeStory.title}</h2>
            <p className="mt-3 text-lg font-bold leading-8 text-[#4B5563]">{activeStory.summary}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={() => setDetailStoryId(activeStory.id)}
                className="h-12 rounded-xl bg-[#0E9F6E] px-5 font-black text-white hover:bg-[#0C8F62] disabled:cursor-not-allowed disabled:opacity-60"
              >
                查看爷爷的完整故事
              </button>
              <select
                value={activeStory.id}
                onChange={(event) => setActiveStoryId(event.target.value)}
                className="h-12 rounded-xl border border-[#D1D5DB] bg-white px-4 font-black outline-none focus:border-[#0E9F6E]"
              >
                {activeStories.map((story) => (
                  <option key={story.id} value={story.id}>
                    {story.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      <ListenAndReadStory
        story={activeStory}
        expanded={expandedStory}
        onToggleExpanded={() => setExpandedStory((value) => !value)}
        onOpenDetail={() => setDetailStoryId(activeStory.id)}
      />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="h-fit rounded-2xl border border-[#D1D5DB] bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-black text-[#111827]">关卡地图</h3>
            <button
              onClick={() => {
                resetStoryTasks(activeStory.id);
                onShowToast("本故事任务进度已重置，关卡 101 重新开启。", "info");
              }}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#D1D5DB] px-2 text-xs font-black text-[#4B5563] hover:bg-[#F3F4F6]"
              title="重置本故事任务进度"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重置
            </button>
          </div>
          <p className="mt-1 text-xs font-bold text-[#6B7280]">小工具：只重置当前故事，不影响回忆内容。</p>
          <div className="mt-4 space-y-3">
            {tasks.map((task) => {
              const isCurrent = task.id === activeTask?.id;
              return (
                <button
                  key={task.id}
                  onClick={() => task.status !== "locked" && setActiveTaskId(task.id)}
                  disabled={task.status === "locked"}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    isCurrent
                      ? "border-[#0E9F6E] bg-[#EAF5F0] shadow-sm ring-2 ring-[#0E9F6E]/20"
                      : task.status === "completed"
                        ? "border-[#0E9F6E] bg-white"
                        : task.status === "active"
                          ? "border-[#FD8603] bg-[#FFF7ED] hover:border-[#0E9F6E]"
                          : "cursor-not-allowed border-[#D1D5DB] bg-[#F4F2EB] opacity-70"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-[#4B5563]">关卡 {task.level}</span>
                    <TaskStatusBadge status={task.status} />
                  </div>
                  <p className="mt-2 font-black text-[#111827]">{task.title}</p>
                  <p className="mt-1 text-xs font-bold text-[#4B5563]">{task.abilityGoal}</p>
                  <div className="mt-2 flex gap-1" aria-label={`${task.stars} 颗星`}>
                    {Array.from({ length: 1 }).map((_, index) => (
                      <Star
                        key={index}
                        className={`h-4 w-4 ${
                          task.stars > index ? "fill-[#FD8603] text-[#FD8603]" : "text-[#D1D5DB]"
                        }`}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-h-[560px] rounded-2xl border border-[#D1D5DB] bg-white p-6">
          {activeTask && (
            <TaskPlayground task={activeTask} storyTitle={activeStory.title} onShowToast={onShowToast} />
          )}
        </main>
      </section>

      {allCompleted && (
        <CompletionPanel storyId={activeStory.id} storyTitle={activeStory.title} onShowToast={onShowToast} />
      )}

      <section className="rounded-[18px] border border-[#E1D3BF] bg-[#FFFDF8] p-5 shadow-[0_12px_30px_rgba(99,72,39,0.08)]">
        <h3 className="text-xl font-black text-[#3F2D1F]">爷爷回复你了</h3>
        <div className="mt-4 space-y-3">
          {childReplies.length === 0 ? (
            <p className="rounded-2xl bg-[#F7F0E4] p-4 font-bold text-[#6B4F35]">
              给爷爷送花、留言或录音后，这里会收到他的回复。
            </p>
          ) : (
            childReplies.slice(0, 5).map((event) => (
              <div key={event.id} className="ml-auto max-w-2xl rounded-[22px_22px_6px_22px] bg-[#EAF5F0] p-4 shadow-sm">
                <p className="text-sm font-black text-[#0E6F52]">{formatDateTime(event.createdAt)}</p>
                {event.audioUrl ? (
                  <div className="mt-2">
                    <p className="font-black text-[#2D3A30]">
                      爷爷给你录了一句话 {event.audioDuration ? formatDuration(event.audioDuration) : ""}
                    </p>
                    {event.transcript && <p className="mt-2 font-bold leading-7 text-[#3F2D1F]">爷爷说：{event.transcript}</p>}
                    <audio controls src={event.audioUrl} className="mt-3 w-full" />
                  </div>
                ) : (
                  <p className="mt-2 font-black leading-7 text-[#3F2D1F]">爷爷说：{event.content}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      addInteraction(
                        createInteraction({
                          type: "flower",
                          fromRole: "child",
                          toRole: "elder",
                          storyId: event.storyId,
                          parentEventId: event.id,
                          content: "萌萌又送给爷爷一朵小花：我听到你的回复啦。",
                        })
                      );
                      onShowToast("小花已经送给爷爷。", "success");
                    }}
                    className="rounded-full bg-[#FD8603] px-4 py-2 text-sm font-black text-white hover:bg-[#E67500]"
                  >
                    再送一朵小花
                  </button>
                  <button
                    onClick={() => {
                      addInteraction(
                        createInteraction({
                          type: "child_text_reply",
                          fromRole: "child",
                          toRole: "elder",
                          storyId: event.storyId,
                          parentEventId: event.id,
                          content: "萌萌说：爷爷，我还想听一个故事。",
                        })
                      );
                      onShowToast("已经告诉爷爷：你还想听一个故事。", "success");
                    }}
                    className="rounded-full border border-[#0E9F6E] bg-white px-4 py-2 text-sm font-black text-[#0E6F52] hover:bg-[#EAF5F0]"
                  >
                    我还想听一个故事
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {detailStoryId && (
        <StoryDetailModal
          storyId={detailStoryId}
          mode="child"
          onClose={() => setDetailStoryId(null)}
          onShowToast={onShowToast}
        />
      )}

      {currentUser && (
        <ChatBotWidget
          role="child"
          currentUser={currentUser}
          currentStory={activeStory}
          currentTask={activeTask}
          onSendToFamily={sendAiMessageToFamily}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
}

function ListenAndReadStory({
  story,
  expanded,
  onToggleExpanded,
  onOpenDetail,
}: {
  story: MemoryStory;
  expanded: boolean;
  onToggleExpanded: () => void;
  onOpenDetail: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const needsCollapse = story.fullText.length > 120;
  const visibleText = expanded || !needsCollapse ? story.fullText : `${story.fullText.slice(0, 120)}……`;

  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#EAF5F0] text-[#0E9F6E]">
          <Volume2 className="h-7 w-7" />
        </div>
        <div className="flex-1">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
            <div>
              <p className="text-sm font-black text-[#0E9F6E]">听爷爷讲这个故事</p>
              <h3 className="mt-1 text-2xl font-black text-[#111827]">你可以一边听爷爷的声音，一边看故事。</h3>
            </div>
            <button
              onClick={onOpenDetail}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#D1D5DB] px-4 font-black hover:bg-[#F3F4F6]"
            >
              <BookOpen className="h-4 w-4" />
              完整故事
            </button>
          </div>

          <div className="mt-5 rounded-2xl bg-[#FFF7ED] p-4">
            {story.audioUrl ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-black text-[#111827]">原声录音 {formatDuration(story.audioDuration)}</p>
                  <button
                    onClick={() => void audioRef.current?.play()}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#FD8603] px-4 font-black text-white hover:bg-[#E67500]"
                  >
                    <Play className="h-4 w-4" />
                    播放爷爷的声音
                  </button>
                </div>
                <audio ref={audioRef} controls src={story.audioUrl} className="w-full" />
              </div>
            ) : (
              <p className="rounded-xl bg-white p-4 font-bold text-[#4B5563]">
                这条故事还没有爷爷原声，可以先阅读文字故事。
              </p>
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-[#D1D5DB] bg-[#FAF8F2] p-5">
            <p className="text-sm font-black text-[#4B5563]">文字故事</p>
            <p className="mt-3 whitespace-pre-wrap text-lg font-bold leading-9 text-[#111827]">{visibleText}</p>
            {needsCollapse && (
              <button
                onClick={onToggleExpanded}
                className="mt-4 h-11 rounded-xl border border-[#D1D5DB] bg-white px-4 font-black hover:bg-[#F3F4F6]"
              >
                {expanded ? "收起文字故事" : "展开完整文字故事"}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function TaskStatusBadge({ status }: { status: ChildTask["status"] }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#0E9F6E] px-2 py-1 text-[11px] font-black text-white">
        <CheckCircle2 className="h-3 w-3" />
        已完成
      </span>
    );
  }
  if (status === "active") {
    return <span className="rounded-full bg-[#FD8603] px-2 py-1 text-[11px] font-black text-white">进行中</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#E5E7EB] px-2 py-1 text-[11px] font-black text-[#4B5563]">
      <Lock className="h-3 w-3" />
      未解锁
    </span>
  );
}

function TaskPlayground({
  task,
  storyTitle,
  onShowToast,
}: {
  task: ChildTask;
  storyTitle: string;
  onShowToast: (message: string, type?: ToastKind) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#F2C94C] bg-[#FFF7ED] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-[#FD8603]">{task.abilityGoal}</p>
            <h3 className="mt-1 text-2xl font-black text-[#111827]">
              {task.level} · {task.title}
            </h3>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 1 }).map((_, index) => (
              <Star
                key={index}
                className={`h-6 w-6 ${
                  task.stars > index ? "fill-[#FD8603] text-[#FD8603]" : "text-[#D1D5DB]"
                }`}
              />
            ))}
          </div>
        </div>
        <p className="mt-3 text-lg font-black text-[#111827]">{task.instruction}</p>
      </div>

      {task.status === "locked" && (
        <div className="rounded-2xl bg-[#F4F2EB] p-8 text-center">
          <Lock className="mx-auto h-12 w-12 text-[#9CA3AF]" />
          <p className="mt-3 text-xl font-black text-[#111827]">先完成前一关，再来挑战这里。</p>
        </div>
      )}

      {task.status !== "locked" && task.type === "observe" && <ObserveTask task={task} onShowToast={onShowToast} />}
      {task.status !== "locked" && task.type === "classify" && <ClassifyTask task={task} onShowToast={onShowToast} />}
      {task.status !== "locked" && task.type === "sequence" && <SequenceTask task={task} onShowToast={onShowToast} />}
      {task.status !== "locked" && task.type === "assemble" && <AssembleTask task={task} onShowToast={onShowToast} />}
      {task.status !== "locked" && task.type === "quiz" && <QuizTask task={task} onShowToast={onShowToast} />}
      {task.status !== "locked" && task.type === "emotion" && (
        <EmotionTask task={task} storyTitle={storyTitle} onShowToast={onShowToast} />
      )}
    </div>
  );
}

function childTaskPhoto(item: ChildTaskItem): string | undefined {
  return getTaskItemImage(item.label);
}

function getTaskItemCaption(item: ChildTaskItem): string {
  const captions: Record<string, string> = {
    白兔糖: "故事里的糖果",
    玻璃罐: "装糖的小罐子",
    供销社: "爷爷小时候买东西的地方",
    平板电脑: "现在的电子产品",
    披萨: "不是故事里的食物",
    飞机: "和这段故事无关",
  };
  return captions[item.label] ?? (item.isDistractor ? "不是这段故事里的物件" : `故事里的${item.label}`);
}

function TaskItemVisual({ item, compact = false }: { item: ChildTaskItem; compact?: boolean }) {
  const imageUrl = item.image ?? item.imageUrl ?? childTaskPhoto(item);
  if (imageUrl) {
    return (
      <figure className="overflow-hidden rounded-[14px] bg-[#F7F0E4] shadow-inner">
        <SafeImage
          src={imageUrl}
          fallbackSrc={imageAssets.placeholders.object}
          alt={item.imageAlt || item.label}
          className={`${compact ? "aspect-[4/3]" : "aspect-[4/3]"} w-full object-cover`}
        />
      </figure>
    );
  }
  return (
    <div className="flex aspect-[4/3] items-center justify-center rounded-[14px] bg-[#F7F0E4]">
      <span className={compact ? "text-2xl" : "text-4xl"}>{item.icon}</span>
    </div>
  );
}

function ObserveTask({ task, onShowToast }: { task: ChildTask; onShowToast: (message: string, type?: ToastKind) => void }) {
  const { completeTask } = useSilverStore();
  const correct = task.correctAnswer as string[];
  const [selected, setSelected] = useState<string[]>(Array.isArray(task.userAnswer) ? task.userAnswer : []);
  const [wrongId, setWrongId] = useState("");
  const [hint, setHint] = useState(task.status === "completed" ? task.feedback ?? "" : "");

  useEffect(() => {
    setSelected(Array.isArray(task.userAnswer) ? task.userAnswer : []);
    setWrongId("");
    setHint(task.status === "completed" ? task.feedback ?? "" : "");
  }, [task.id, task.status, task.userAnswer, task.feedback]);

  function choose(item: ChildTaskItem) {
    if (task.status === "completed") return;
    if (!correct.includes(item.id)) {
      setWrongId(item.id);
      setHint(item.hint ?? "这个不是爷爷故事里的物件，再想想爷爷提到了什么？");
      window.setTimeout(() => {
        setWrongId((current) => (current === item.id ? "" : current));
      }, 900);
      return;
    }
    const next = Array.from(new Set([...selected, item.id]));
    setSelected(next);
    setHint(item.hint ?? "找得很认真，继续看看还有哪些物件。");
    if (next.length === correct.length) {
      const feedback = taskTypeFeedback(task, next);
      completeTask(task.id, next, 1, feedback);
      setHint(feedback);
      onShowToast("观察识别完成，获得 1 颗星。", "success");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {task.items.map((item) => {
          const isSelected = selected.includes(item.id) || (task.status === "completed" && correct.includes(item.id));
          const isWrong = wrongId === item.id;
          return (
            <button
              key={item.id}
              onClick={() => choose(item)}
              className={`min-h-48 rounded-[18px] border-2 bg-white p-3 text-left shadow-sm transition ${
                isWrong
                  ? "border-[#B42318] bg-[#FEE2E2]"
                  : isSelected
                    ? "border-[#0E9F6E] bg-[#EAF5F0]"
                    : "border-[#D8C8B0] hover:border-[#FD8603]"
              }`}
            >
              <p className="mb-2 min-h-10 text-center text-xs font-black leading-5 text-[#8A6A45]">
                {getTaskItemCaption(item)}
              </p>
              <TaskItemVisual item={item} />
              <p className="mt-3 text-center text-lg font-black text-[#3F2D1F]">{item.label}</p>
            </button>
          );
        })}
      </div>
      {hint && <p className="rounded-xl border border-[#F2C94C] bg-[#FFF7ED] px-4 py-3 font-black text-[#8A4700]">{hint}</p>}
      {task.status === "completed" && <CompletedBanner text={task.feedback} />}
    </div>
  );
}

function ClassifyTask({ task, onShowToast }: { task: ChildTask; onShowToast: (message: string, type?: ToastKind) => void }) {
  const { completeTask } = useSilverStore();
  const correct = task.correctAnswer as Record<string, string>;
  const categories = Array.from(new Set(task.items.map((item) => item.correctCategory ?? correct[item.id] ?? "故事物件")));
  const [placements, setPlacements] = useState<Record<string, string>>(
    typeof task.userAnswer === "object" && !Array.isArray(task.userAnswer) ? task.userAnswer : {}
  );
  const [hint, setHint] = useState(task.status === "completed" ? task.feedback ?? "" : "");

  useEffect(() => {
    setPlacements(typeof task.userAnswer === "object" && !Array.isArray(task.userAnswer) ? task.userAnswer : {});
    setHint(task.status === "completed" ? task.feedback ?? "" : "");
  }, [task.id, task.status, task.userAnswer, task.feedback]);

  function onDrop(category: string, itemId: string) {
    if (task.status === "completed") return;
    if (correct[itemId] !== category) {
      setHint("这个分类还不对，它会弹回去。再想想它是物件、食物、地点还是人物。");
      return;
    }
    const next = { ...placements, [itemId]: category };
    setPlacements(next);
    setHint("放对了！");
    if (Object.keys(next).length === task.items.length) {
      const feedback = taskTypeFeedback(task, next);
      completeTask(task.id, next, 1, feedback);
      setHint(feedback);
      onShowToast("分类匹配完成，获得 1 颗星。", "success");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_1fr]">
      <div className="rounded-2xl border border-[#D1D5DB] bg-[#FAF8F2] p-4">
        <p className="mb-3 font-black text-[#111827]">物品卡片</p>
        <div className="space-y-3">
          {task.items.map((item) => {
            const placed = placements[item.id] || (task.status === "completed" ? correct[item.id] : "");
            return (
              <div
                key={item.id}
                draggable={!placed}
                onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
                className={`flex items-center gap-3 rounded-xl border p-3 font-black ${
                  placed ? "border-[#0E9F6E] bg-[#EAF5F0] text-[#0E9F6E]" : "cursor-grab border-[#D1D5DB] bg-white"
                }`}
              >
                <div className="w-20 shrink-0">
                  <TaskItemVisual item={item} compact />
                </div>
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {categories.map((category) => (
            <div
              key={category}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onDrop(category, event.dataTransfer.getData("text/plain"))}
              className="min-h-40 rounded-2xl border-2 border-dashed border-[#D1D5DB] bg-white p-4"
            >
              <p className="font-black text-[#111827]">{category}篮子</p>
              <div className="mt-3 space-y-2">
                {task.items
                  .filter((item) => (placements[item.id] || (task.status === "completed" ? correct[item.id] : "")) === category)
                  .map((item) => (
                    <div key={item.id} className="rounded-lg bg-[#EAF5F0] px-3 py-2 font-black text-[#0E9F6E]">
                      {item.label}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
        {hint && <p className="rounded-xl border border-[#F2C94C] bg-[#FFF7ED] px-4 py-3 font-black text-[#8A4700]">{hint}</p>}
        {task.status === "completed" && <CompletedBanner text={task.feedback} />}
      </div>
    </div>
  );
}

function SequenceTask({ task, onShowToast }: { task: ChildTask; onShowToast: (message: string, type?: ToastKind) => void }) {
  const { completeTask } = useSilverStore();
  const correct = task.correctAnswer as string[];
  const createInitialOrder = () =>
    Array.isArray(task.userAnswer)
      ? task.userAnswer
      : [...task.items].sort((a, b) => (b.order ?? 0) - (a.order ?? 0)).map((item) => item.id);
  const [order, setOrder] = useState<string[]>(createInitialOrder);
  const [dragId, setDragId] = useState("");
  const [hint, setHint] = useState(task.status === "completed" ? task.feedback ?? "" : "");

  useEffect(() => {
    setOrder(createInitialOrder());
    setHint(task.status === "completed" ? task.feedback ?? "" : "");
  }, [task.id, task.status, task.userAnswer, task.feedback]);

  function move(index: number, direction: -1 | 1) {
    const next = [...order];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  }

  function dropOn(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = order.filter((id) => id !== dragId);
    next.splice(next.indexOf(targetId), 0, dragId);
    setOrder(next);
    setDragId("");
  }

  function check() {
    const ok = order.every((id, index) => id === correct[index]);
    if (!ok) {
      const firstWrong = order.findIndex((id, index) => id !== correct[index]);
      setHint(`第 ${firstWrong + 1} 张可能应该更早或更晚，再换一换。`);
      return;
    }
    const feedback = taskTypeFeedback(task, order);
    completeTask(task.id, order, 1, feedback);
    setHint(feedback);
    onShowToast("顺序排列完成，获得 1 颗星。", "success");
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {order.map((itemId, index) => {
          const item = task.items.find((entry) => entry.id === itemId);
          if (!item) return null;
          return (
            <div
              key={item.id}
              draggable={task.status !== "completed"}
              onDragStart={() => setDragId(item.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropOn(item.id)}
              className="flex items-center gap-4 rounded-2xl border border-[#D1D5DB] bg-[#FAF8F2] p-4"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FD8603] font-black text-white">
                {index + 1}
              </span>
              <p className="flex-1 text-lg font-black text-[#111827]">{item.label}</p>
              {task.status !== "completed" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => move(index, -1)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#D1D5DB] bg-white hover:bg-[#F3F4F6]"
                    aria-label="向前移动"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#D1D5DB] bg-white hover:bg-[#F3F4F6]"
                    aria-label="向后移动"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {task.status !== "completed" && (
        <button onClick={check} className="h-12 rounded-xl bg-[#0E9F6E] px-5 font-black text-white hover:bg-[#0C8F62]">
          检查顺序
        </button>
      )}
      {hint && <p className="rounded-xl border border-[#F2C94C] bg-[#FFF7ED] px-4 py-3 font-black text-[#8A4700]">{hint}</p>}
      {task.status === "completed" && <CompletedBanner text={task.feedback} />}
    </div>
  );
}

function AssembleTask({ task, onShowToast }: { task: ChildTask; onShowToast: (message: string, type?: ToastKind) => void }) {
  const { completeTask } = useSilverStore();
  const correct = task.correctAnswer as Record<string, string>;
  const zones = useMemo(() => {
    try {
      const parsed = JSON.parse(task.feedback || "[]") as { id: string; label: string; hint: string }[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      // Completed tasks store human feedback, so fall back to zone ids below.
    }
    return Array.from(new Set(Object.values(correct))).map((id) => ({
      id,
      label: id === "body" ? "主体" : id === "antenna" ? "天线位置" : id === "knob" ? "旋钮位置" : id === "battery" ? "电池仓" : "目标位置",
      hint: "这个部件的位置还不对，再观察一下。",
    }));
  }, [correct, task.feedback]);
  const [placements, setPlacements] = useState<Record<string, string>>(
    typeof task.userAnswer === "object" && !Array.isArray(task.userAnswer) ? task.userAnswer : {}
  );
  const [hint, setHint] = useState(task.status === "completed" ? task.feedback ?? "" : "");

  useEffect(() => {
    setPlacements(typeof task.userAnswer === "object" && !Array.isArray(task.userAnswer) ? task.userAnswer : {});
    setHint(task.status === "completed" ? task.feedback ?? "" : "");
  }, [task.id, task.status, task.userAnswer, task.feedback]);

  function handleDrop(zoneId: string, itemId: string) {
    if (task.status === "completed") return;
    if (correct[itemId] !== zoneId) {
      const target = zones.find((zone) => zone.id === correct[itemId]);
      setHint(target?.hint || "这个部件的位置还不对，再观察一下。");
      return;
    }
    const next = { ...placements, [itemId]: zoneId };
    setPlacements(next);
    setHint("装对了！");
    if (Object.keys(next).length === task.items.length) {
      const feedback = taskTypeFeedback(task, next);
      completeTask(task.id, next, 1, feedback);
      setHint(feedback);
      onShowToast("场景装配完成，获得 1 颗星。", "success");
    }
  }

  const completed = task.status === "completed";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_1fr]">
        <div className="space-y-3 rounded-2xl border border-[#D1D5DB] bg-[#FAF8F2] p-4">
          <p className="font-black text-[#111827]">可装配部件</p>
          {task.items.map((item) => {
            const placed = placements[item.id] || (completed ? correct[item.id] : "");
            return (
              <div
                key={item.id}
                draggable={!placed}
                onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
                className={`flex items-center gap-3 rounded-xl border p-3 font-black ${
                  placed ? "border-[#0E9F6E] bg-[#EAF5F0] text-[#0E9F6E]" : "cursor-grab border-[#D1D5DB] bg-white"
                }`}
              >
                <div className="w-20 shrink-0">
                  <TaskItemVisual item={item} compact />
                </div>
                {item.label}
              </div>
            );
          })}
        </div>

        <div className="rounded-3xl border border-[#F2C94C] bg-[#FFF7ED] p-5">
          <div
            className={`relative mx-auto aspect-[4/3] max-w-xl rounded-3xl border-4 border-[#D1D5DB] bg-white p-5 ${
              completed ? "animate-pulse" : ""
            }`}
          >
            <div className="absolute inset-8 flex items-center justify-center rounded-3xl border-4 border-[#0E9F6E] bg-[#EAF5F0]">
              <span className="text-5xl">📻</span>
            </div>
            <div className="relative z-10 grid grid-cols-2 gap-4">
              {zones.map((zone) => (
                <div
                  key={zone.id}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleDrop(zone.id, event.dataTransfer.getData("text/plain"))}
                  className="flex min-h-28 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#FD8603] bg-white/85 p-3 text-center"
                >
                  <p className="text-sm font-black text-[#8A4700]">{zone.label}</p>
                  {task.items
                    .filter((item) => (placements[item.id] || (completed ? correct[item.id] : "")) === zone.id)
                    .map((item) => (
                      <div key={item.id} className="mt-2 rounded-lg bg-[#EAF5F0] px-3 py-2 font-black text-[#0E9F6E]">
                        {item.label}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {hint && <p className="rounded-xl border border-[#F2C94C] bg-[#FFF7ED] px-4 py-3 font-black text-[#8A4700]">{hint}</p>}
      {completed && <CompletedBanner text={task.feedback} />}
    </div>
  );
}

function QuizTask({ task, onShowToast }: { task: ChildTask; onShowToast: (message: string, type?: ToastKind) => void }) {
  const { completeTask } = useSilverStore();
  const correct = task.correctAnswer as string;
  const [selected, setSelected] = useState(typeof task.userAnswer === "string" ? task.userAnswer : "");
  const [feedback, setFeedback] = useState(task.status === "completed" ? task.feedback ?? "" : "");

  useEffect(() => {
    setSelected(typeof task.userAnswer === "string" ? task.userAnswer : "");
    setFeedback(task.status === "completed" ? task.feedback ?? "" : "");
  }, [task.id, task.status, task.userAnswer, task.feedback]);

  function choose(item: ChildTaskItem) {
    if (task.status === "completed") return;
    setSelected(item.id);
    if (item.id !== correct) {
      setFeedback("这个答案和爷爷的故事不太一样，再想想故事里的原因。");
      return;
    }
    const result = taskTypeFeedback(task, item.id);
    setFeedback(result);
    completeTask(task.id, item.id, 1, result);
    onShowToast("问答推理完成，获得 1 颗星。", "success");
  }

  return (
    <div className="space-y-4">
      {task.items.map((item) => (
        <button
          key={item.id}
          onClick={() => choose(item)}
          className={`flex w-full items-center gap-4 rounded-2xl border-2 p-5 text-left ${
            selected === item.id
              ? item.id === correct
                ? "border-[#0E9F6E] bg-[#EAF5F0]"
                : "border-[#B42318] bg-[#FEE2E2]"
              : "border-[#D1D5DB] bg-white hover:border-[#FD8603]"
          }`}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FD8603] font-black text-white">
            {item.icon}
          </span>
          <span className="text-lg font-black text-[#111827]">{item.label}</span>
        </button>
      ))}
      {feedback && <p className="rounded-xl bg-[#EAF5F0] px-4 py-3 font-black text-[#0E9F6E]">{feedback}</p>}
      {task.status === "completed" && <CompletedBanner text={task.feedback} />}
    </div>
  );
}

function EmotionTask({
  task,
  storyTitle,
  onShowToast,
}: {
  task: ChildTask;
  storyTitle: string;
  onShowToast: (message: string, type?: ToastKind) => void;
}) {
  const { completeTask, addInteraction } = useSilverStore();
  const [selected, setSelected] = useState(typeof task.userAnswer === "string" ? task.userAnswer : "");

  useEffect(() => {
    setSelected(typeof task.userAnswer === "string" ? task.userAnswer : "");
  }, [task.id, task.userAnswer]);

  function choose(item: ChildTaskItem) {
    setSelected(item.id);
    if (task.status !== "completed") {
      const feedback = taskTypeFeedback(task, item.id);
      completeTask(task.id, item.id, 1, feedback);
      addInteraction(
        createInteraction({
          type: "child_text_reply",
          fromRole: "child",
          toRole: "elder",
          storyId: task.memoryStoryId,
          content: `萌萌听完《${storyTitle}》后说：${item.label}`,
        })
      );
      onShowToast("这句话已经送到爷爷的互动信箱。", "success");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {task.items.map((item) => (
          <button
            key={item.id}
            onClick={() => choose(item)}
            className={`min-h-36 rounded-2xl border-2 p-5 ${
              selected === item.id ? "border-[#0E9F6E] bg-[#EAF5F0]" : "border-[#D1D5DB] bg-white hover:border-[#FD8603]"
            }`}
          >
            <div className="text-3xl">{item.icon}</div>
            <p className="mt-3 text-lg font-black text-[#111827]">{item.label}</p>
          </button>
        ))}
      </div>
      {task.status === "completed" && <CompletedBanner text={task.feedback} />}
    </div>
  );
}

function CompletedBanner({ text }: { text?: string }) {
  const finalText = text || "这一关完成了，下一关已经解锁。";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#0E9F6E] bg-[#EAF5F0] p-4">
      <Trophy className="h-7 w-7 text-[#0E9F6E]" />
      <p className="text-lg font-black text-[#0E9F6E]">{finalText}</p>
    </div>
  );
}

function CompletionPanel({
  storyId,
  storyTitle,
  onShowToast,
}: {
  storyId: string;
  storyTitle: string;
  onShowToast: (message: string, type?: ToastKind) => void;
}) {
  const { addInteraction } = useSilverStore();
  const [recording, setRecording] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");

  function sendFlower() {
    addInteraction(
      createInteraction({
        type: "flower",
        fromRole: "child",
        toRole: "elder",
        storyId,
        content: `萌萌给爷爷送了一朵小红花：我完成了《${storyTitle}》的全部探索。`,
      })
    );
    onShowToast("小红花已经送到爷爷那里。", "success");
  }

  function startChildRecognition() {
    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) return;
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
        if (result.isFinal) {
          finalText = `${finalText}${text}`;
        } else {
          interimText = `${interimText}${text}`;
        }
      }
      transcriptRef.current = finalText;
      setTranscript(`${finalText}${interimText}`.trim());
    };
    recognition.onerror = () => undefined;
    recognition.onend = () => undefined;
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
    }
  }

  async function startVoice() {
    if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
      addInteraction(
        createInteraction({
          type: "child_text_reply",
          fromRole: "child",
          toRole: "elder",
          storyId,
          content: "萌萌想对爷爷说：爷爷，我下次还想听你讲故事。",
        })
      );
      onShowToast("当前浏览器无法录音，已发送一条文字回应。", "info");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      transcriptRef.current = "";
      setTranscript("");
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void saveVoiceReply(recorder.mimeType || "audio/webm");
      };
      recorder.start();
      startChildRecognition();
      setRecording(true);
    } catch {
      onShowToast("无法使用麦克风，请检查浏览器权限或发送文字回应。", "error");
    }
  }

  async function saveVoiceReply(mimeType: string) {
    setSavingVoice(true);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    recognitionRef.current?.stop();
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const seconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
    const key = createId("child-audio");
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);
    setDuration(seconds);
    try {
      await saveMediaBlob(key, blob);
    } catch {
      onShowToast("语音可在当前会话播放，但本地长期保存失败。", "error");
    }
    const finalTranscript = transcriptRef.current.trim() || transcript.trim();
    addInteraction(
      createInteraction({
        type: "child_voice_reply",
        fromRole: "child",
        toRole: "elder",
        storyId,
        content: `萌萌给爷爷录了一句话：我完成了《${storyTitle}》。`,
        transcript: finalTranscript,
        audioUrl: url,
        audioStorageKey: key,
        audioDuration: seconds,
      })
    );
    setSavingVoice(false);
    onShowToast("语音已经送到爷爷的互动信箱。", "success");
  }

  function stopVoice() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <section className="space-y-5 rounded-2xl border-2 border-[#FD8603] bg-[#FFF7ED] p-6 text-center">
      <Sparkles className="mx-auto h-12 w-12 text-[#FD8603]" />
      <h3 className="text-2xl font-black text-[#111827]">全部任务完成啦</h3>
      <p className="text-lg font-bold text-[#4B5563]">
        你已经把爷爷的故事看懂、排好、装配好，还表达了自己的感受。
      </p>
      <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4 md:grid-cols-2">
        <button
          onClick={sendFlower}
          disabled={recording || savingVoice}
          className="flex h-14 items-center justify-center gap-2 rounded-xl bg-[#FD8603] font-black text-white hover:bg-[#E67500] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Flower2 className="h-5 w-5" />
          送小红花给爷爷
        </button>
        <button
          onClick={recording ? stopVoice : startVoice}
          disabled={savingVoice}
          className="flex h-14 items-center justify-center gap-2 rounded-xl bg-[#0E9F6E] font-black text-white hover:bg-[#0C8F62] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {recording ? <Pause className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          {recording ? "停止并发送" : savingVoice ? "正在发送" : "录一句话给爷爷"}
        </button>
      </div>
      {transcript && (
        <p className="mx-auto max-w-xl rounded-xl bg-white p-3 text-left text-sm font-bold text-[#4B5563]">
          识别到的话：{transcript}
        </p>
      )}
      {audioUrl && (
        <div className="mx-auto max-w-xl rounded-xl border border-[#D1D5DB] bg-white p-4">
          <p className="mb-2 font-black text-[#111827]">刚刚发送的语音 {formatDuration(duration)}</p>
          <audio controls src={audioUrl} className="w-full" />
        </div>
      )}
    </section>
  );
}
