import React, { useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Edit3,
  Flower2,
  Headphones,
  RefreshCw,
  Shield,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { imageAssets } from "../data/imageAssets";
import {
  formatDateTime,
  formatDuration,
  getTaskProgress,
  sourceText,
  summarizeText,
  taskTypeName,
} from "../mockLogic";
import { useSilverStore } from "../store";
import { SafetyAction, ToastKind } from "../types";
import { getStoryImage } from "../utils/storyImage";
import SafeImage from "./SafeImage";

type Props = {
  storyId: string;
  safetyLogId?: string;
  onClose: () => void;
  mode?: "elder" | "child" | "admin";
  onShowToast: (message: string, type?: ToastKind) => void;
};

const safetyStatusText = {
  safe: "低风险，已通过",
  pending: "等待家属确认",
  blocked: "暂时拦截",
};

const logActionText = {
  passed: "已通过",
  pending_review: "待家属确认",
  blocked: "暂时拦截",
};

export default function StoryDetailModal({
  storyId,
  safetyLogId,
  onClose,
  mode = "elder",
  onShowToast,
}: Props) {
  const { state, updateStory, deleteStory, regenerateTasks, updateSafetyLog } = useSilverStore();
  const story = state.stories.find((item) => item.id === storyId && !item.deletedAt);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [title, setTitle] = useState(story?.title ?? "");
  const [fullText, setFullText] = useState(story?.fullText ?? "");

  const linkedTasks = useMemo(
    () =>
      state.childTasks
        .filter((task) => !task.deletedAt && task.memoryStoryId === storyId)
        .sort((a, b) => a.level - b.level),
    [state.childTasks, storyId]
  );
  const linkedEvents = useMemo(
    () => state.interactions.filter((event) => !event.deletedAt && event.storyId === storyId),
    [state.interactions, storyId]
  );
  const linkedLogs = useMemo(
    () => state.safetyLogs.filter((log) => !log.deletedAt && log.storyId === storyId),
    [state.safetyLogs, storyId]
  );
  const selectedLog = linkedLogs.find((log) => log.id === safetyLogId);

  if (!story) return null;

  const progress = getTaskProgress(story, linkedTasks);
  const keywords = story.keywords?.length ? story.keywords : ["家庭回忆"];
  const canManage = mode === "elder";
  const canAudit = mode === "admin";
  const asrChanged = Boolean(story.asrText && story.asrText.trim() && story.asrText.trim() !== story.fullText.trim());
  const flowerCount = linkedEvents.filter((event) => event.type === "flower").length;
  const familyTextEvents = linkedEvents.filter(
    (event) =>
      !event.audioUrl &&
      ["child_text_reply", "elder_text_reply", "text_reply", "voice_reply"].includes(event.type)
  );
  const familyVoiceEvents = linkedEvents.filter(
    (event) =>
      Boolean(event.audioUrl) &&
      ["child_voice_reply", "elder_voice_reply", "voice_reply"].includes(event.type)
  );

  const handleSave = () => {
    const cleanTitle = title.trim();
    const cleanText = fullText.trim();
    if (!cleanTitle || !cleanText) {
      onShowToast("标题和故事内容都需要填写。", "error");
      return;
    }
    updateStory(story.id, {
      title: cleanTitle,
      fullText: cleanText,
      summary: summarizeText(cleanText),
    });
    setIsEditing(false);
    onShowToast("完整故事已更新。", "success");
  };

  const handleDelete = () => {
    deleteStory(story.id);
    onShowToast("这条回忆已删除，相关儿童任务也已同步移除。", "info");
    onClose();
  };

  const handleAudit = (action: SafetyAction) => {
    const targetLogId = selectedLog?.id ?? linkedLogs[0]?.id;
    if (!targetLogId) {
      onShowToast("暂无可操作的审核记录。", "info");
      return;
    }
    updateSafetyLog(targetLogId, action);
    onShowToast(action === "passed" ? "已通过审核。" : action === "blocked" ? "已暂时拦截。" : "已标记待家属确认。", "success");
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4 py-6">
      <div className="w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-[#D1D5DB] flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-[#D1D5DB] px-6 py-5 bg-[#FAF8F2]">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#4B5563]">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-4 w-4" />
                {story.yearTag}
              </span>
              <span>创建：{formatDateTime(story.createdAt)}</span>
              <span>来源：{sourceText(story.source)}</span>
              <span className="inline-flex items-center gap-1">
                <Shield className="h-4 w-4 text-[#0E9F6E]" />
                {safetyStatusText[story.safetyStatus]}
              </span>
            </div>
            <h3 className="mt-2 text-2xl font-black text-[#111827]">{story.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="h-11 w-11 rounded-full border border-[#D1D5DB] bg-white hover:bg-[#F3F4F6] flex items-center justify-center"
            aria-label="关闭完整故事"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
            <div className="space-y-4">
              <div className="aspect-[4/3] rounded-xl overflow-hidden border border-[#D1D5DB] bg-[#F4F2EB]">
                <SafeImage
                  src={getStoryImage(story)}
                  fallbackSrc={imageAssets.placeholders.story}
                  alt={story.imageName || story.title}
                  className="h-full w-full object-cover"
                />
              </div>
              {story.audioUrl ? (
                <div className="rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] p-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-black text-[#111827]">
                    <Headphones className="h-4 w-4 text-[#0E9F6E]" />
                    爷爷原声 {story.audioDuration ? formatDuration(story.audioDuration) : ""}
                  </p>
                  <audio controls src={story.audioUrl} className="w-full" />
                </div>
              ) : (
                <div className="rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] p-4 text-sm font-bold text-[#4B5563]">
                  这条故事没有绑定原声录音。
                </div>
              )}
            </div>

            <div className="space-y-5">
              {isEditing ? (
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-sm font-black text-[#111827]">故事标题</span>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-4 py-3 font-bold outline-none focus:border-[#0E9F6E]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-black text-[#111827]">完整故事</span>
                    <textarea
                      value={fullText}
                      onChange={(event) => setFullText(event.target.value)}
                      rows={8}
                      className="mt-1 w-full rounded-xl border border-[#D1D5DB] px-4 py-3 font-bold leading-relaxed outline-none focus:border-[#0E9F6E]"
                    />
                  </label>
                  <div className="flex gap-3">
                    <button onClick={handleSave} className="h-12 rounded-xl bg-[#0E9F6E] px-5 font-black text-white hover:bg-[#0C8F62]">
                      保存修改
                    </button>
                    <button onClick={() => setIsEditing(false)} className="h-12 rounded-xl border border-[#D1D5DB] px-5 font-black text-[#111827] hover:bg-[#F3F4F6]">
                      取消编辑
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <section className="rounded-xl bg-[#F9FAFB] border border-[#D1D5DB] p-5">
                    <h4 className="flex items-center gap-2 text-lg font-black text-[#111827]">
                      <BookOpen className="h-5 w-5 text-[#0E9F6E]" />
                      完整故事
                    </h4>
                    <p className="mt-3 whitespace-pre-line text-base leading-8 font-semibold text-[#111827]">
                      {story.fullText}
                    </p>
                  </section>

                  <section className="rounded-xl border border-[#D1D5DB] p-4 bg-white">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-[#4B5563]">语音识别文本</p>
                      {asrChanged && (
                        <span className="rounded-full bg-[#FFEEDC] px-3 py-1 text-xs font-black text-[#8A4700]">
                          已由长辈修改润色
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-base font-bold leading-7 text-[#111827]">
                      {story.asrText?.trim() || "这条故事没有语音识别文本。"}
                    </p>
                  </section>

                  <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-[#D1D5DB] p-4 bg-white">
                      <p className="text-sm font-black text-[#4B5563]">摘要</p>
                      <p className="mt-2 text-base font-bold text-[#111827]">{story.summary}</p>
                    </div>
                    <div className="rounded-xl border border-[#D1D5DB] p-4 bg-white">
                      <p className="text-sm font-black text-[#4B5563]">关键词</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {keywords.map((word) => (
                          <span key={word} className="rounded-full bg-[#EAF5F0] px-3 py-1 text-sm font-black text-[#0E9F6E]">
                            {word}
                          </span>
                        ))}
                      </div>
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[#D1D5DB] bg-white p-5">
              <h4 className="flex items-center gap-2 text-lg font-black text-[#111827]">
                <Star className="h-5 w-5 text-[#FD8603]" />
                儿童任务
              </h4>
              <p className="mt-2 text-sm font-bold text-[#4B5563]">
                已完成 {progress.completed} / {progress.total} 个任务，累计 {progress.stars} 颗星。
              </p>
              <div className="mt-4 space-y-2">
                {linkedTasks.map((task) => (
                  <div key={task.id} className="rounded-lg bg-[#FAF8F2] px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-[#111827]">
                        {task.level} · {taskTypeName(task.type)} · {task.abilityGoal}
                      </span>
                      <span className={`text-xs font-black ${task.status === "completed" ? "text-[#0E9F6E]" : "text-[#4B5563]"}`}>
                        {task.status === "completed" ? `已完成 ${task.stars}星` : task.status === "active" ? "进行中" : "未解锁"}
                      </span>
                    </div>
                    {task.feedback && <p className="mt-1 text-xs font-bold text-[#4B5563]">{task.feedback}</p>}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#D1D5DB] bg-white p-5">
              <h4 className="flex items-center gap-2 text-lg font-black text-[#111827]">
                <Flower2 className="h-5 w-5 text-[#FD8603]" />
                家庭互动
              </h4>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-[#FAF8F2] p-3">
                  <p className="text-xl font-black text-[#111827]">{story.likes}</p>
                  <p className="text-xs font-bold text-[#4B5563]">点赞</p>
                </div>
                <div className="rounded-lg bg-[#FAF8F2] p-3">
                  <p className="text-xl font-black text-[#111827]">{flowerCount}</p>
                  <p className="text-xs font-bold text-[#4B5563]">送花</p>
                </div>
                <div className="rounded-lg bg-[#FAF8F2] p-3">
                  <p className="text-xl font-black text-[#111827]">{familyVoiceEvents.length}</p>
                  <p className="text-xs font-bold text-[#4B5563]">语音互动</p>
                </div>
              </div>
              <div className="mt-4 space-y-3 max-h-64 overflow-y-auto">
                {[...familyTextEvents, ...familyVoiceEvents].length === 0 ? (
                  <p className="text-sm font-bold text-[#4B5563]">还没有家人回应。</p>
                ) : (
                  [...familyTextEvents, ...familyVoiceEvents].map((event) => (
                    <div key={event.id} className="rounded-lg bg-[#FAF8F2] px-3 py-2">
                      <p className="text-xs font-black text-[#0E9F6E]">
                        {event.fromRole === "elder" ? "爷爷回复" : event.fromRole === "child" ? "孩子回应" : "家人互动"}
                      </p>
                      <p className="text-sm font-black text-[#111827]">{event.transcript || event.content}</p>
                      <p className="mt-1 text-xs font-bold text-[#4B5563]">{formatDateTime(event.createdAt)}</p>
                      {event.audioUrl && <audio controls src={event.audioUrl} className="mt-2 w-full" />}
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[#D1D5DB] bg-white p-5">
            <h4 className="text-lg font-black text-[#111827]">后台审核状态</h4>
            {selectedLog && (
              <div className="mt-3 rounded-xl bg-[#FAF8F2] border border-[#D1D5DB] p-4">
                <p className="font-black text-[#111827]">当前查看记录：{selectedLog.content}</p>
                <p className="mt-2 text-sm font-bold text-[#4B5563]">
                  风险等级：{selectedLog.riskLevel === "high" ? "高关注" : selectedLog.riskLevel === "medium" ? "需确认" : "低风险，已通过"}
                  {selectedLog.matchedWord ? ` · 命中原因：${selectedLog.matchedWord}` : ""}
                  · 当前状态：{logActionText[selectedLog.action]}
                </p>
              </div>
            )}
            <div className="mt-4 space-y-2">
              {linkedLogs.map((log) => (
                <div key={log.id} className="rounded-lg bg-[#FAF8F2] px-3 py-2 text-sm font-bold text-[#4B5563]">
                  {formatDateTime(log.createdAt)} · {log.riskLevel === "low" ? "低风险" : log.riskLevel === "medium" ? "需确认" : "高关注"} · {logActionText[log.action]}
                </div>
              ))}
            </div>
            {canAudit && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => handleAudit("passed")} className="h-10 rounded-lg bg-[#EAF5F0] px-3 text-sm font-black text-[#0E9F6E] hover:bg-[#D8F3E7]">
                  通过
                </button>
                <button onClick={() => handleAudit("pending_review")} className="h-10 rounded-lg bg-[#FFEEDC] px-3 text-sm font-black text-[#8A4700] hover:bg-[#FFE0BF]">
                  待家属确认
                </button>
                <button onClick={() => handleAudit("blocked")} className="h-10 rounded-lg bg-[#FEE2E2] px-3 text-sm font-black text-[#B42318] hover:bg-[#FCA5A5]/50">
                  暂时拦截
                </button>
              </div>
            )}
          </section>
        </div>

        {canManage && (
          <div className="border-t border-[#D1D5DB] bg-[#FAF8F2] px-6 py-4 flex flex-wrap justify-between gap-3">
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setIsEditing(true)}
                className="h-11 rounded-xl border border-[#0E9F6E] px-4 font-black text-[#0E9F6E] hover:bg-[#EAF5F0] flex items-center gap-2"
              >
                <Edit3 className="h-4 w-4" />
                编辑故事
              </button>
              <button
                onClick={() => {
                  regenerateTasks(story.id);
                  onShowToast("已重新生成儿童探索任务。", "success");
                }}
                className="h-11 rounded-xl border border-[#D1D5DB] px-4 font-black text-[#111827] hover:bg-white flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                重新生成儿童任务
              </button>
            </div>

            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-[#B42318]">确认删除？</span>
                <button
                  onClick={handleDelete}
                  className="h-11 rounded-xl bg-[#B42318] px-4 font-black text-white hover:bg-[#991B1B] flex items-center gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  删除
                </button>
                <button onClick={() => setConfirmDelete(false)} className="h-11 rounded-xl border border-[#D1D5DB] px-4 font-black hover:bg-white">
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="h-11 rounded-xl border border-[#B42318] px-4 font-black text-[#B42318] hover:bg-[#FEE2E2] flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                删除故事
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
