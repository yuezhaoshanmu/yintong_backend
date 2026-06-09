import React, { useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Clipboard,
  Eye,
  Link as LinkIcon,
  MessagesSquare,
  Phone,
  Printer,
  QrCode,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Trash2,
  TrendingUp,
  Undo2,
  X,
} from "lucide-react";
import { useAuth } from "../auth";
import { formatDateTime, isToday } from "../mockLogic";
import { DeletedRecord, useSilverStore } from "../store";
import {
  AiCallSession,
  AiChatMessage,
  ChildTask,
  InteractionEvent,
  MemoryStory,
  SafetyAction,
  SafetyLog,
  ToastKind,
} from "../types";
import { imageAssets } from "../data/imageAssets";
import { getStoryImage } from "../utils/storyImage";
import SafeImage from "./SafeImage";
import StoryDetailModal from "./StoryDetailModal";

type AdminConsoleProps = {
  onShowToast: (message: string, type?: ToastKind) => void;
};

type ConfirmAction = {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
};

const sourceLabel: Record<SafetyLog["sourceType"], string> = {
  ASR: "语音文字记录",
  PHOTO: "照片上传记录",
  TEXT: "故事文本记录",
  CHILD_INTERACTION: "家庭互动记录",
  AI_CHAT: "AI 对话记录",
};

const actionLabel: Record<SafetyAction, string> = {
  passed: "已通过",
  pending_review: "待家属确认",
  blocked: "暂时拦截",
};

const riskLabel: Record<SafetyLog["riskLevel"], string> = {
  low: "低风险",
  medium: "需要确认",
  high: "重点关注",
};

const interactionTypeLabel: Record<InteractionEvent["type"], string> = {
  like: "点赞",
  flower: "送花",
  child_voice_reply: "孩子语音",
  child_text_reply: "孩子留言",
  elder_voice_reply: "长辈语音",
  elder_text_reply: "长辈回复",
  voice_reply: "语音互动",
  text_reply: "文字互动",
  story_created: "新增故事",
  task_completed: "任务完成",
};

const deletedTypeLabel: Record<DeletedRecord["targetType"], string> = {
  interaction: "家庭互动",
  task: "儿童任务",
  story: "故事记录",
  safety_log: "审核记录",
  ai_chat: "AI 对话",
  ai_call: "AI 通话",
};

function byNewest<T extends { createdAt?: string; startedAt?: string; deletedAt?: string }>(a: T, b: T) {
  const left = a.createdAt ?? a.startedAt ?? a.deletedAt ?? "";
  const right = b.createdAt ?? b.startedAt ?? b.deletedAt ?? "";
  return new Date(right).getTime() - new Date(left).getTime();
}

function secondsText(seconds = 0) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes} 分 ${rest} 秒` : `${rest} 秒`;
}

function deletedRecordKey(record: Pick<DeletedRecord, "targetType" | "id">) {
  return `${record.targetType}:${record.id}`;
}

export default function AdminConsole({ onShowToast }: AdminConsoleProps) {
  const { currentUser } = useAuth();
  const {
    state,
    updateSafetyLog,
    addRiskWord,
    removeRiskWord,
    deleteInteractionEvent,
    restoreInteractionEvent,
    bulkDeleteInteractionEvents,
    deleteTaskCompletion,
    restoreChildTask,
    resetStoryTasks,
    deleteMemoryStory,
    restoreMemoryStory,
    deleteSafetyLog,
    restoreSafetyLog,
    bulkDeleteSafetyLogs,
    bulkDeleteAiChatMessages,
    deleteAiChatMessage,
    restoreAiChatMessage,
    deleteAiCallSession,
    restoreAiCallSession,
    setAiAssistantEnabled,
    getDeletedRecords,
    permanentlyDeleteRecord,
    bulkPermanentlyDeleteRecords,
    clearDeletedRecords,
  } = useSilverStore();

  const [activeTab, setActiveTab] = useState<"overview" | "deleted">("overview");
  const [detailStoryId, setDetailStoryId] = useState<string | null>(null);
  const [detailSafetyLogId, setDetailSafetyLogId] = useState<string | null>(null);
  const [newRiskWord, setNewRiskWord] = useState("");
  const [newRiskLabel, setNewRiskLabel] = useState("家属自定义关注词");
  const [qrOpen, setQrOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [selectedInteractionIds, setSelectedInteractionIds] = useState<string[]>([]);
  const [selectedSafetyLogIds, setSelectedSafetyLogIds] = useState<string[]>([]);
  const [showAiDetails, setShowAiDetails] = useState(false);
  const [deletedFilter, setDeletedFilter] = useState<DeletedRecord["targetType"] | "all">("all");
  const [selectedDeletedKeys, setSelectedDeletedKeys] = useState<string[]>([]);
  const [safetyRiskFilter, setSafetyRiskFilter] = useState<SafetyLog["riskLevel"] | "all">("all");
  const [safetyActionFilter, setSafetyActionFilter] = useState<SafetyAction | "all">("all");
  const [safetyTypeFilter, setSafetyTypeFilter] = useState<SafetyLog["sourceType"] | "all">("all");
  const [safetySearch, setSafetySearch] = useState("");

  const activeStories = useMemo(() => state.stories.filter((story) => !story.deletedAt), [state.stories]);
  const activeStoryIds = useMemo(() => new Set(activeStories.map((story) => story.id)), [activeStories]);
  const activeTasks = useMemo(
    () => state.childTasks.filter((task) => !task.deletedAt && activeStoryIds.has(task.memoryStoryId)),
    [activeStoryIds, state.childTasks]
  );
  const activeInteractions = useMemo(
    () =>
      state.interactions.filter(
        (event) => !event.deletedAt && (!event.storyId || activeStoryIds.has(event.storyId))
      ),
    [activeStoryIds, state.interactions]
  );
  const activeSafetyLogs = useMemo(
    () =>
      state.safetyLogs.filter((log) => !log.deletedAt && (!log.storyId || activeStoryIds.has(log.storyId))),
    [activeStoryIds, state.safetyLogs]
  );
  const activeAiChatMessages = useMemo(
    () => state.aiChatMessages.filter((message) => !message.deletedAt),
    [state.aiChatMessages]
  );
  const activeAiCallSessions = useMemo(
    () => state.aiCallSessions.filter((session) => !session.deletedAt),
    [state.aiCallSessions]
  );

  const storyById = useMemo(() => new Map(activeStories.map((story) => [story.id, story])), [activeStories]);
  const deletedRecords = getDeletedRecords();
  const filteredDeletedRecords = useMemo(
    () => deletedRecords.filter((record) => deletedFilter === "all" || record.targetType === deletedFilter),
    [deletedFilter, deletedRecords]
  );
  const filteredSafetyLogs = useMemo(() => {
    const query = safetySearch.trim().toLowerCase();
    return activeSafetyLogs.filter((log) => {
      const story = log.storyId ? storyById.get(log.storyId) : undefined;
      const haystack = `${story?.title ?? ""}${log.content}${log.matchedWord ?? ""}`.toLowerCase();
      return (
        (safetyRiskFilter === "all" || log.riskLevel === safetyRiskFilter) &&
        (safetyActionFilter === "all" || log.action === safetyActionFilter) &&
        (safetyTypeFilter === "all" || log.sourceType === safetyTypeFilter) &&
        (!query || haystack.includes(query))
      );
    });
  }, [activeSafetyLogs, safetyActionFilter, safetyRiskFilter, safetySearch, safetyTypeFilter, storyById]);
  const safetyStats = useMemo(
    () => ({
      pending: activeSafetyLogs.filter((log) => log.action === "pending_review").length,
      passed: activeSafetyLogs.filter((log) => log.action === "passed").length,
      blocked: activeSafetyLogs.filter((log) => log.action === "blocked").length,
      today: activeSafetyLogs.filter((log) => isToday(log.createdAt)).length,
    }),
    [activeSafetyLogs]
  );

  const metrics = useMemo(() => {
    const todayStories = activeStories.filter((story) => isToday(story.createdAt)).length;
    const todayTasks = activeTasks.filter(
      (task) => task.status === "completed" && task.completedAt && isToday(task.completedAt)
    ).length;
    const todayInteractions = activeInteractions.filter((event) => isToday(event.createdAt)).length;
    const pendingLogs = activeSafetyLogs.filter((log) => log.action === "pending_review");
    const pendingLogStoryIds = new Set(pendingLogs.map((log) => log.storyId).filter(Boolean));
    const pendingStoryOnly = activeStories.filter(
      (story) => story.safetyStatus === "pending" && !pendingLogStoryIds.has(story.id)
    ).length;
    const pendingContent = pendingLogs.length + pendingStoryOnly;
    const vitality = activeInteractions.filter((event) =>
      [
        "flower",
        "child_voice_reply",
        "child_text_reply",
        "elder_voice_reply",
        "elder_text_reply",
        "voice_reply",
        "text_reply",
        "task_completed",
        "like",
      ].includes(event.type)
    ).length;
    const latestInteractionTime = activeInteractions.length
      ? Math.max(...activeInteractions.map((event) => new Date(event.createdAt).getTime()))
      : 0;
    const daysWithoutInteraction = latestInteractionTime
      ? Math.floor((Date.now() - latestInteractionTime) / (1000 * 60 * 60 * 24))
      : 9;
    const lonelinessRisk = daysWithoutInteraction >= 3 ? "需要关注" : "稳定";
    const completedTasks = activeTasks.filter((task) => task.status === "completed").length;
    const totalTasks = activeTasks.length;
    const taskCompletion = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      todayStories,
      todayTasks,
      todayInteractions,
      pendingContent,
      vitality,
      lonelinessRisk,
      daysWithoutInteraction,
      taskCompletion,
      completedTasks,
      totalTasks,
    };
  }, [activeInteractions, activeSafetyLogs, activeStories, activeTasks]);

  const aiStats = useMemo(() => {
    const todayAiConversationCount = activeAiChatMessages.filter(
      (message) => message.role === "assistant" && isToday(message.createdAt)
    ).length;
    const todayVoiceSeconds = activeAiCallSessions
      .filter((session) => isToday(session.startedAt))
      .reduce((sum, session) => sum + (session.durationSeconds ?? 0), 0);
    const childHelpCount = activeAiChatMessages.filter(
      (message) => message.role === "user" && message.userRole === "child"
    ).length;
    const elderUseCount = activeAiChatMessages.filter(
      (message) => message.role === "user" && message.userRole === "elder"
    ).length;
    const recentSummaries = activeAiChatMessages
      .filter((message) => message.role === "assistant")
      .slice()
      .sort(byNewest)
      .slice(0, 3);

    return {
      todayAiConversationCount,
      todayVoiceSeconds,
      childHelpCount,
      elderUseCount,
      recentSummaries,
    };
  }, [activeAiCallSessions, activeAiChatMessages]);

  const completedTasks = activeTasks
    .filter((task) => task.status === "completed")
    .slice()
    .sort(byNewest);
  const passedSafetyLogIds = activeSafetyLogs.filter((log) => log.action === "passed").map((log) => log.id);

  function operationOptions(reason: string, deleteRelatedStory = false) {
    return {
      operatorId: currentUser?.id ?? "guardian",
      operatorName: currentUser?.name ?? "家属守护员",
      reason,
      deleteRelatedStory,
    };
  }

  function runConfirmed(action: ConfirmAction) {
    setConfirmAction(action);
  }

  function openLogDetail(log: SafetyLog) {
    if (!log.storyId) {
      onShowToast("这条记录没有关联故事详情。", "info");
      return;
    }
    setDetailStoryId(log.storyId);
    setDetailSafetyLogId(log.id);
  }

  function handleLogAction(log: SafetyLog, action: SafetyAction) {
    updateSafetyLog(log.id, action);
    const text =
      action === "passed"
        ? "内容已通过，故事卡片会正常展示。"
        : action === "blocked"
          ? "内容已暂时拦截，前台故事卡会显示温和状态。"
          : "已标记为待家属确认。";
    onShowToast(text, "success");
  }

  function submitRiskWord(event: React.FormEvent) {
    event.preventDefault();
    const keyword = newRiskWord.trim();
    if (!keyword) {
      onShowToast("请先输入一个关注词。", "error");
      return;
    }
    if (state.riskWords.some((word) => word.keyword === keyword)) {
      onShowToast("这个关注词已经存在。", "info");
      return;
    }
    addRiskWord(keyword, newRiskLabel.trim() || "家属自定义关注词");
    setNewRiskWord("");
    onShowToast("关注词已添加，现有故事和家人留言已经检查过。", "success");
  }

  function shareFamilyLink() {
    const link = "https://silver-child.example/family-bind/WANG-MENG-2026";
    navigator.clipboard
      ?.writeText(link)
      .then(() => onShowToast("绑定链接已复制到剪贴板。", "success"))
      .catch(() => onShowToast(`绑定链接：${link}`, "info"));
  }

  function printQr() {
    onShowToast("即将打开浏览器打印预览。", "info");
    window.setTimeout(() => window.print(), 200);
  }

  function toggleId(id: string, selectedIds: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) {
    setter(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  }

  function confirmDeleteInteraction(event: InteractionEvent) {
    runConfirmed({
      title: "删除这条家庭互动？",
      message: "删除后长辈端和儿童端会同步不显示，今日互动次数也会重新计算。",
      confirmLabel: "删除互动",
      danger: true,
      onConfirm: () => {
        deleteInteractionEvent(event.id, operationOptions("家属删除单条家庭互动"));
        setSelectedInteractionIds((ids) => ids.filter((id) => id !== event.id));
        onShowToast("家庭互动已删除。", "info");
      },
    });
  }

  function confirmBulkDeleteInteractions() {
    if (!selectedInteractionIds.length) {
      onShowToast("请先选择要删除的互动。", "error");
      return;
    }
    runConfirmed({
      title: "批量删除家庭互动？",
      message: `将删除 ${selectedInteractionIds.length} 条互动，三端展示和今日互动次数会同步更新。`,
      confirmLabel: "批量删除",
      danger: true,
      onConfirm: () => {
        bulkDeleteInteractionEvents(selectedInteractionIds, operationOptions("家属批量删除家庭互动"));
        setSelectedInteractionIds([]);
        onShowToast("已批量删除家庭互动。", "info");
      },
    });
  }

  function confirmDeleteTaskCompletion(task: ChildTask) {
    runConfirmed({
      title: "删除这条任务完成记录？",
      message: "删除后对应关卡会恢复为未完成，关联的任务完成互动会从统计和动态里移除。",
      confirmLabel: "删除完成记录",
      danger: true,
      onConfirm: () => {
        deleteTaskCompletion(task.id, operationOptions("家属删除儿童任务完成记录"));
        onShowToast("任务完成记录已删除，儿童端任务进度已同步回退。", "info");
      },
    });
  }

  function confirmResetStoryTasks(story: MemoryStory) {
    runConfirmed({
      title: "重置这个故事的儿童任务？",
      message: `《${story.title}》的儿童任务会恢复为第一关进行中，其余未解锁，认知训练完成度会重新计算。`,
      confirmLabel: "重置任务",
      danger: true,
      onConfirm: () => {
        resetStoryTasks(story.id, operationOptions("家属重置某个故事任务进度"));
        onShowToast("故事任务进度已重置。", "info");
      },
    });
  }

  function confirmDeleteStory(story: MemoryStory) {
    runConfirmed({
      title: "删除这条故事记录？",
      message: "删除后会同时移除该故事关联的儿童任务、家庭互动和审核记录。",
      confirmLabel: "删除故事",
      danger: true,
      onConfirm: () => {
        deleteMemoryStory(story.id, operationOptions("家属删除故事"));
        onShowToast("故事已删除，关联任务、互动和审核记录已同步隐藏。", "info");
      },
    });
  }

  function confirmDeleteSafetyLog(log: SafetyLog, deleteRelatedStory = false) {
    runConfirmed({
      title: deleteRelatedStory ? "删除审核记录并同时删除关联故事？" : "删除这条审核记录？",
      message: deleteRelatedStory
        ? "审核记录会被删除，关联故事及其儿童任务、家庭互动也会同步隐藏。"
        : "只删除审核记录，不会删除关联故事。",
      confirmLabel: deleteRelatedStory ? "同时删除" : "删除记录",
      danger: true,
      onConfirm: () => {
        deleteSafetyLog(log.id, operationOptions("家属删除审核记录", deleteRelatedStory));
        setSelectedSafetyLogIds((ids) => ids.filter((id) => id !== log.id));
        onShowToast(deleteRelatedStory ? "审核记录和关联故事已删除。" : "审核记录已删除。", "info");
      },
    });
  }

  function confirmBulkDeleteSelectedSafetyLogs() {
    if (!selectedSafetyLogIds.length) {
      onShowToast("请先选择要删除的审核记录。", "error");
      return;
    }
    runConfirmed({
      title: "批量删除审核记录？",
      message: `将删除 ${selectedSafetyLogIds.length} 条审核记录，不会删除关联故事。`,
      confirmLabel: "批量删除",
      danger: true,
      onConfirm: () => {
        bulkDeleteSafetyLogs(selectedSafetyLogIds, operationOptions("家属批量删除审核记录"));
        setSelectedSafetyLogIds([]);
        onShowToast("已批量删除审核记录。", "info");
      },
    });
  }

  function confirmClearPassedSafetyLogs() {
    if (!passedSafetyLogIds.length) {
      onShowToast("当前没有已通过审核记录可清理。", "info");
      return;
    }
    runConfirmed({
      title: "批量清理已通过记录？",
      message: `将清理 ${passedSafetyLogIds.length} 条已通过审核记录，不会删除故事。`,
      confirmLabel: "清理已通过",
      danger: true,
      onConfirm: () => {
        bulkDeleteSafetyLogs(passedSafetyLogIds, operationOptions("家属批量清理已通过审核记录"));
        setSelectedSafetyLogIds([]);
        onShowToast("已通过审核记录已清理。", "info");
      },
    });
  }

  function confirmDeleteAllAiRecords() {
    const chatIds = activeAiChatMessages.map((message) => message.id);
    const callIds = activeAiCallSessions.map((session) => session.id);
    if (!chatIds.length && !callIds.length) {
      onShowToast("当前没有可删除的 AI 记录。", "info");
      return;
    }
    runConfirmed({
      title: "删除 AI 使用记录？",
      message: "AI 对话和通话记录会软删除，AI 使用统计会同步更新。",
      confirmLabel: "删除 AI 记录",
      danger: true,
      onConfirm: () => {
        if (chatIds.length) bulkDeleteAiChatMessages(chatIds, operationOptions("家属删除 AI 对话记录"));
        callIds.forEach((id) => deleteAiCallSession(id, operationOptions("家属删除 AI 通话记录")));
        onShowToast("AI 记录已删除，统计已同步更新。", "info");
      },
    });
  }

  function restoreRecord(record: DeletedRecord) {
    if (record.targetType === "story") restoreMemoryStory(record.id, operationOptions("家属恢复故事"));
    if (record.targetType === "task") restoreChildTask(record.id, operationOptions("家属恢复儿童任务"));
    if (record.targetType === "interaction") restoreInteractionEvent(record.id, operationOptions("家属恢复家庭互动"));
    if (record.targetType === "safety_log") restoreSafetyLog(record.id, operationOptions("家属恢复审核记录"));
    if (record.targetType === "ai_chat") restoreAiChatMessage(record.id, operationOptions("家属恢复 AI 对话"));
    if (record.targetType === "ai_call") restoreAiCallSession(record.id, operationOptions("家属恢复 AI 通话"));
    onShowToast("已恢复记录。", "success");
  }

  function restoreRecords(records: DeletedRecord[]) {
    if (!records.length) {
      onShowToast("请先选择要恢复的记录。", "error");
      return;
    }
    records.forEach(restoreRecord);
    setSelectedDeletedKeys((keys) =>
      keys.filter((key) => !records.some((record) => deletedRecordKey(record) === key))
    );
    onShowToast(`已恢复 ${records.length} 条记录。`, "success");
  }

  function confirmPermanentDelete(record: DeletedRecord) {
    runConfirmed({
      title: "永久删除这条记录？",
      message: "永久删除后无法从已删除记录中恢复，请确认不再需要这条数据。",
      confirmLabel: "永久删除",
      danger: true,
      onConfirm: () => {
        permanentlyDeleteRecord(record.targetType, record.id);
        onShowToast("记录已永久删除。", "info");
      },
    });
  }

  function confirmBulkPermanentDelete(records: DeletedRecord[]) {
    if (!records.length) {
      onShowToast("请先选择要永久删除的记录。", "error");
      return;
    }
    runConfirmed({
      title: "批量永久删除已删除记录？",
      message: `将永久删除 ${records.length} 条记录，删除后无法恢复。`,
      confirmLabel: "永久删除",
      danger: true,
      onConfirm: () => {
        bulkPermanentlyDeleteRecords(records);
        setSelectedDeletedKeys([]);
        onShowToast(`已永久删除 ${records.length} 条记录。`, "info");
      },
    });
  }

  function confirmClearDeletedRecords(records: DeletedRecord[]) {
    if (!records.length) {
      onShowToast("暂无已删除记录。", "info");
      return;
    }
    runConfirmed({
      title: "确认清空已删除记录？",
      message: "清空后将无法恢复，建议只在确认无误后操作。",
      confirmLabel: "确认清空",
      danger: true,
      onConfirm: () => {
        clearDeletedRecords(deletedFilter);
        setSelectedDeletedKeys([]);
        onShowToast(`已永久删除 ${records.length} 条记录。`, "info");
      },
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[#D1D5DB] bg-white p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-black text-[#0E9F6E]">社区守护管理台</p>
            <h2 className="mt-1 text-3xl font-black text-[#111827]">家庭故事与儿童训练联动看板</h2>
            <p className="mt-2 font-bold text-[#4B5563]">
              删除、恢复、任务重置和 AI 开关会同步影响三端展示与统计。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex rounded-xl bg-[#F4F2EB] p-1">
              <button
                onClick={() => setActiveTab("overview")}
                className={`h-11 rounded-lg px-4 font-black ${
                  activeTab === "overview" ? "bg-white text-[#0E9F6E] shadow-sm" : "text-[#4B5563]"
                }`}
              >
                管理看板
              </button>
              <button
                onClick={() => setActiveTab("deleted")}
                className={`h-11 rounded-lg px-4 font-black ${
                  activeTab === "deleted" ? "bg-white text-[#0E9F6E] shadow-sm" : "text-[#4B5563]"
                }`}
              >
                已删除记录
              </button>
            </div>
            <button
              onClick={() => setQrOpen(true)}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0E9F6E] px-5 font-black text-white hover:bg-[#0C8F62]"
            >
              <QrCode className="h-5 w-5" />
              家庭绑定二维码
            </button>
          </div>
        </div>
      </section>

      {activeTab === "deleted" ? (
        <DeletedRecordsPanel
          records={filteredDeletedRecords}
          filter={deletedFilter}
          selectedKeys={selectedDeletedKeys}
          onFilterChange={(filter) => {
            setDeletedFilter(filter);
            setSelectedDeletedKeys([]);
          }}
          onSelect={(record) => {
            const key = deletedRecordKey(record);
            setSelectedDeletedKeys((keys) =>
              keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key]
            );
          }}
          onSelectAll={() => setSelectedDeletedKeys(filteredDeletedRecords.map(deletedRecordKey))}
          onClearSelection={() => setSelectedDeletedKeys([])}
          onBulkRestore={() =>
            restoreRecords(filteredDeletedRecords.filter((record) => selectedDeletedKeys.includes(deletedRecordKey(record))))
          }
          onBulkPermanentDelete={() =>
            confirmBulkPermanentDelete(
              filteredDeletedRecords.filter((record) => selectedDeletedKeys.includes(deletedRecordKey(record)))
            )
          }
          onClearFiltered={() => confirmClearDeletedRecords(filteredDeletedRecords)}
          onRestore={restoreRecord}
          onPermanentDelete={confirmPermanentDelete}
        />
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="今日新增回忆" value={metrics.todayStories} note="过滤已删除故事" />
            <MetricCard title="今日儿童任务完成" value={metrics.todayTasks} note="过滤已删除任务" />
            <MetricCard title="今日互动次数" value={metrics.todayInteractions} note="过滤已删除互动" />
            <MetricCard
              title="待审核内容"
              value={metrics.pendingContent}
              note="过滤已删除审核记录"
              danger={metrics.pendingContent > 0}
            />
          </section>

          <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <InsightCard
              icon={<TrendingUp className="h-6 w-6 text-[#0E9F6E]" />}
              title="互动活力指数"
              value={metrics.vitality}
              note="点赞、送花、孩子留言、爷爷回复和任务完成共同形成活力指数。"
              percent={Math.min(100, metrics.vitality * 8)}
            />
            <InsightCard
              icon={<ShieldAlert className="h-6 w-6 text-[#FD8603]" />}
              title="陪伴风险提示"
              value={metrics.lonelinessRisk}
              note={`系统根据连续互动情况自动评估，当前已连续 ${metrics.daysWithoutInteraction} 天未出现新的互动。`}
              percent={metrics.lonelinessRisk === "需要关注" ? 78 : 24}
              warm
            />
            <InsightCard
              icon={<CheckCircle2 className="h-6 w-6 text-[#0E9F6E]" />}
              title="认知训练完成度"
              value={`${metrics.taskCompletion}%`}
              note={`已完成 ${metrics.completedTasks} / 共 ${metrics.totalTasks} 个任务。`}
              percent={metrics.taskCompletion}
            />
          </section>

          <AIUsagePanel
            childEnabled={state.aiSettings.childAssistantEnabled}
            elderEnabled={state.aiSettings.elderAssistantEnabled}
            aiStats={aiStats}
            showDetails={showAiDetails}
            messages={activeAiChatMessages}
            calls={activeAiCallSessions}
            onToggleChild={(enabled) => setAiAssistantEnabled("child", enabled)}
            onToggleElder={(enabled) => setAiAssistantEnabled("elder", enabled)}
            onDeleteAll={confirmDeleteAllAiRecords}
            onToggleDetails={() => setShowAiDetails((value) => !value)}
            onDeleteMessage={(message) =>
              runConfirmed({
                title: "删除这条 AI 对话？",
                message: "删除后 AI 对话统计会同步更新。",
                confirmLabel: "删除对话",
                danger: true,
                onConfirm: () => {
                  deleteAiChatMessage(message.id, operationOptions("家属删除单条 AI 对话"));
                  onShowToast("AI 对话已删除。", "info");
                },
              })
            }
            onDeleteCall={(session) =>
              runConfirmed({
                title: "删除这条 AI 通话？",
                message: "删除后 AI 语音通话时长统计会同步更新。",
                confirmLabel: "删除通话",
                danger: true,
                onConfirm: () => {
                  deleteAiCallSession(session.id, operationOptions("家属删除单条 AI 通话"));
                  onShowToast("AI 通话已删除。", "info");
                },
              })
            }
          />

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
            <div className="space-y-6">
              <section className="overflow-hidden rounded-2xl border border-[#D1D5DB] bg-white">
                <SectionHeader
                  icon={<MessagesSquare className="h-5 w-5 text-[#0E9F6E]" />}
                  title="家庭互动动态"
                  note="单条删除和批量删除都会软删除互动，并同步更新三端展示与今日互动次数。"
                  action={
                    <button
                      onClick={confirmBulkDeleteInteractions}
                      className="flex h-10 items-center gap-2 rounded-lg border border-[#B42318] px-3 text-sm font-black text-[#B42318] hover:bg-[#FEE2E2]"
                    >
                      <Trash2 className="h-4 w-4" />
                      批量删除
                    </button>
                  }
                />
                <div className="max-h-[460px] overflow-y-auto divide-y divide-[#D1D5DB]">
                  {activeInteractions.length === 0 ? (
                    <p className="p-6 font-bold text-[#4B5563]">暂无家庭互动动态。</p>
                  ) : (
                    activeInteractions
                      .slice()
                      .sort(byNewest)
                      .map((event) => (
                        <InteractionRow
                          key={event.id}
                          event={event}
                          story={event.storyId ? storyById.get(event.storyId) : undefined}
                          selected={selectedInteractionIds.includes(event.id)}
                          onSelect={() => toggleId(event.id, selectedInteractionIds, setSelectedInteractionIds)}
                          onDelete={() => confirmDeleteInteraction(event)}
                        />
                      ))
                  )}
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-[#D1D5DB] bg-white">
                <SectionHeader
                  icon={<RotateCcw className="h-5 w-5 text-[#FD8603]" />}
                  title="儿童任务完成度"
                  note="可删除单条完成记录，也可按故事重置任务进度。"
                />
                <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
                  <div className="space-y-3">
                    <p className="text-sm font-black text-[#111827]">已完成任务记录</p>
                    {completedTasks.length === 0 ? (
                      <p className="rounded-xl bg-[#FAF8F2] p-4 font-bold text-[#4B5563]">暂无已完成任务。</p>
                    ) : (
                      completedTasks.slice(0, 8).map((task) => (
                        <CompletedTaskRow
                          key={task.id}
                          task={task}
                          story={storyById.get(task.memoryStoryId)}
                          onDelete={() => confirmDeleteTaskCompletion(task)}
                        />
                      ))
                    )}
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-black text-[#111827]">按故事重置任务</p>
                    {activeStories.map((story) => (
                      <StoryTaskResetRow
                        key={story.id}
                        story={story}
                        tasks={activeTasks.filter((task) => task.memoryStoryId === story.id)}
                        onReset={() => confirmResetStoryTasks(story)}
                      />
                    ))}
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-[#D1D5DB] bg-white">
                <SectionHeader
                  icon={<Clipboard className="h-5 w-5 text-[#0E9F6E]" />}
                  title="故事记录"
                  note="删除故事会同步隐藏关联儿童任务、家庭互动、审核记录、AI 对话和 AI 通话。"
                />
                <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
                  {activeStories.map((story) => (
                    <StoryManagementRow
                      key={story.id}
                      story={story}
                      taskCount={activeTasks.filter((task) => task.memoryStoryId === story.id).length}
                      interactionCount={activeInteractions.filter((event) => event.storyId === story.id).length}
                      onView={() => setDetailStoryId(story.id)}
                      onDelete={() => confirmDeleteStory(story)}
                    />
                  ))}
                </div>
              </section>

              <ContentProtectionWall
                logs={filteredSafetyLogs}
                stats={safetyStats}
                storyById={storyById}
                selectedIds={selectedSafetyLogIds}
                riskFilter={safetyRiskFilter}
                actionFilter={safetyActionFilter}
                typeFilter={safetyTypeFilter}
                search={safetySearch}
                onRiskFilterChange={setSafetyRiskFilter}
                onActionFilterChange={setSafetyActionFilter}
                onTypeFilterChange={setSafetyTypeFilter}
                onSearchChange={setSafetySearch}
                onSelect={(logId) => toggleId(logId, selectedSafetyLogIds, setSelectedSafetyLogIds)}
                onBulkDelete={confirmBulkDeleteSelectedSafetyLogs}
                onClearPassed={confirmClearPassedSafetyLogs}
                onShowDeleted={() => {
                  setActiveTab("deleted");
                  setDeletedFilter("safety_log");
                  setSelectedDeletedKeys([]);
                }}
                onAction={handleLogAction}
                onView={openLogDetail}
                onDelete={(log) => confirmDeleteSafetyLog(log)}
              />
            </div>

            <aside className="space-y-6">
              <RiskWordsPanel
                riskWords={state.riskWords}
                newRiskWord={newRiskWord}
                newRiskLabel={newRiskLabel}
                onWordChange={setNewRiskWord}
                onLabelChange={setNewRiskLabel}
                onSubmit={submitRiskWord}
                onRemove={(wordId) => {
                  removeRiskWord(wordId);
                  onShowToast("关注词已删除。", "info");
                }}
              />
              <FamilyMembersPanel members={state.familyMembers} />
            </aside>
          </section>
        </>
      )}

      {qrOpen && <QrModal onClose={() => setQrOpen(false)} onPrint={printQr} onShare={shareFamilyLink} />}

      {detailStoryId && (
        <StoryDetailModal
          storyId={detailStoryId}
          safetyLogId={detailSafetyLogId ?? undefined}
          mode="admin"
          onClose={() => {
            setDetailStoryId(null);
            setDetailSafetyLogId(null);
          }}
          onShowToast={onShowToast}
        />
      )}

      {confirmAction && (
        <ConfirmModal
          action={confirmAction}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            confirmAction.onConfirm();
            setConfirmAction(null);
          }}
        />
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  note,
  danger,
}: {
  title: string;
  value: number;
  note: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#D1D5DB] bg-white p-5">
      <p className="text-sm font-black text-[#4B5563]">{title}</p>
      <p className={`mt-2 text-4xl font-black ${danger ? "text-[#B42318]" : "text-[#0E9F6E]"}`}>{value}</p>
      <p className="mt-2 text-xs font-bold text-[#4B5563]">{note}</p>
    </div>
  );
}

function InsightCard({
  icon,
  title,
  value,
  note,
  percent,
  warm,
}: {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  note: string;
  percent: number;
  warm?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#D1D5DB] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-[#4B5563]">{title}</p>
          <p className="mt-2 text-3xl font-black text-[#111827]">{value}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FAF8F2]">{icon}</div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#F4F2EB]">
        <div
          className={`h-full ${warm ? "bg-[#FD8603]" : "bg-[#0E9F6E]"}`}
          style={{ width: `${Math.max(4, Math.min(100, percent))}%` }}
        />
      </div>
      <p className="mt-3 text-xs font-bold leading-5 text-[#4B5563]">{note}</p>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  note,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  note: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 border-b border-[#D1D5DB] px-6 py-5 lg:flex-row lg:items-center">
      <div>
        <h3 className="flex items-center gap-2 text-2xl font-black text-[#111827]">
          {icon}
          {title}
        </h3>
        <p className="mt-1 text-sm font-bold text-[#4B5563]">{note}</p>
      </div>
      {action}
    </div>
  );
}

function AIUsagePanel({
  childEnabled,
  elderEnabled,
  aiStats,
  showDetails,
  messages,
  calls,
  onToggleChild,
  onToggleElder,
  onDeleteAll,
  onToggleDetails,
  onDeleteMessage,
  onDeleteCall,
}: {
  childEnabled: boolean;
  elderEnabled: boolean;
  aiStats: {
    todayAiConversationCount: number;
    todayVoiceSeconds: number;
    childHelpCount: number;
    elderUseCount: number;
    recentSummaries: AiChatMessage[];
  };
  showDetails: boolean;
  messages: AiChatMessage[];
  calls: AiCallSession[];
  onToggleChild: (enabled: boolean) => void;
  onToggleElder: (enabled: boolean) => void;
  onDeleteAll: () => void;
  onToggleDetails: () => void;
  onDeleteMessage: (message: AiChatMessage) => void;
  onDeleteCall: (session: AiCallSession) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#D1D5DB] bg-white">
      <SectionHeader
        icon={<Bot className="h-5 w-5 text-[#0E9F6E]" />}
        title="AI 陪伴使用情况"
        note="AI 对话和语音统计会过滤已删除记录。关闭开关后，对应端无法继续使用助手。"
        action={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onToggleDetails}
              className="flex h-10 items-center gap-2 rounded-lg border border-[#D1D5DB] px-3 text-sm font-black hover:bg-[#F3F4F6]"
            >
              <Eye className="h-4 w-4" />
              查看详情
            </button>
            <button
              onClick={onDeleteAll}
              className="flex h-10 items-center gap-2 rounded-lg border border-[#B42318] px-3 text-sm font-black text-[#B42318] hover:bg-[#FEE2E2]"
            >
              <Trash2 className="h-4 w-4" />
              删除 AI 记录
            </button>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-4">
        <MetricCard title="今日 AI 对话次数" value={aiStats.todayAiConversationCount} note="按助手回复计数" />
        <MetricCard title="今日语音通话时长" value={aiStats.todayVoiceSeconds} note={secondsText(aiStats.todayVoiceSeconds)} />
        <MetricCard title="萌萌求助次数" value={aiStats.childHelpCount} note="儿童端用户消息" />
        <MetricCard title="王爷爷使用助手次数" value={aiStats.elderUseCount} note="长辈端用户消息" />
      </div>
      <div className="grid grid-cols-1 gap-5 px-5 pb-5 lg:grid-cols-[360px_1fr]">
        <div className="space-y-3 rounded-2xl bg-[#FAF8F2] p-4">
          <ToggleRow label="允许萌萌使用故事小伙伴" enabled={childEnabled} onChange={onToggleChild} />
          <ToggleRow label="允许王爷爷使用陪伴小助手" enabled={elderEnabled} onChange={onToggleElder} />
        </div>
        <div className="rounded-2xl bg-[#FAF8F2] p-4">
          <p className="font-black text-[#111827]">最近 AI 对话摘要</p>
          <div className="mt-3 space-y-2">
            {aiStats.recentSummaries.length === 0 ? (
              <p className="text-sm font-bold text-[#4B5563]">暂无 AI 对话。</p>
            ) : (
              aiStats.recentSummaries.map((message) => (
                <p key={message.id} className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-[#4B5563]">
                  {message.userRole === "child" ? "萌萌" : "王爷爷"} · {message.provider === "deepseek" ? "AI 已连接" : "演示回复中"}：{message.content.slice(0, 80)}
                </p>
              ))
            )}
          </div>
        </div>
      </div>
      {showDetails && (
        <div className="border-t border-[#D1D5DB] p-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <p className="font-black text-[#111827]">AI 对话详情</p>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                {messages.slice().sort(byNewest).map((message) => (
                  <div key={message.id} className="rounded-xl border border-[#D1D5DB] bg-[#FAF8F2] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-[#0E9F6E]">
                          {message.userRole === "child" ? "儿童端" : "长辈端"} · {message.role === "user" ? "用户" : "助手"} · {formatDateTime(message.createdAt)}
                        </p>
                        <p className="mt-1 text-sm font-bold leading-6 text-[#111827]">{message.content}</p>
                      </div>
                      <button
                        onClick={() => onDeleteMessage(message)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#B42318] text-[#B42318] hover:bg-[#FEE2E2]"
                        aria-label="删除 AI 对话"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="font-black text-[#111827]">AI 通话详情</p>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                {calls.slice().sort(byNewest).map((session) => (
                  <div key={session.id} className="rounded-xl border border-[#D1D5DB] bg-[#FAF8F2] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-[#111827]">
                          {session.userRole === "child" ? "故事小伙伴" : "陪伴小助手"}
                        </p>
                        <p className="text-xs font-bold text-[#4B5563]">
                          {formatDateTime(session.startedAt)} · {secondsText(session.durationSeconds ?? 0)} · {session.mode === "browser" ? "浏览器轮次式" : "实时预留"}
                        </p>
                      </div>
                      <button
                        onClick={() => onDeleteCall(session)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#B42318] text-[#B42318] hover:bg-[#FEE2E2]"
                        aria-label="删除 AI 通话"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ToggleRow({ label, enabled, onChange }: { label: string; enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-3">
      <span className="font-black text-[#111827]">{label}</span>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative h-8 w-14 rounded-full transition ${enabled ? "bg-[#0E9F6E]" : "bg-[#9CA3AF]"}`}
        aria-label={label}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${
            enabled ? "left-7" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

function InteractionRow({
  event,
  story,
  selected,
  onSelect,
  onDelete,
}: {
  key?: React.Key;
  event: InteractionEvent;
  story?: MemoryStory;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-3 p-4">
      <input type="checkbox" checked={selected} onChange={onSelect} className="mt-2 h-4 w-4 accent-[#0E9F6E]" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#EAF5F0] px-3 py-1 text-xs font-black text-[#0E9F6E]">
            {interactionTypeLabel[event.type]}
          </span>
          <span className="text-xs font-bold text-[#4B5563]">{formatDateTime(event.createdAt)}</span>
          {story && <span className="text-xs font-bold text-[#6B4F35]">关联故事：{story.title}</span>}
        </div>
        <p className="mt-2 break-words font-black leading-7 text-[#111827]">{event.transcript || event.content}</p>
      </div>
      <button
        onClick={onDelete}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#B42318] text-[#B42318] hover:bg-[#FEE2E2]"
        aria-label="删除互动"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function CompletedTaskRow({
  task,
  story,
  onDelete,
}: {
  key?: React.Key;
  task: ChildTask;
  story?: MemoryStory;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-[#D1D5DB] bg-[#FAF8F2] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-[#111827]">{task.title}</p>
          <p className="mt-1 text-xs font-bold text-[#4B5563]">
            {story?.title ?? "未关联故事"} · {task.completedAt ? formatDateTime(task.completedAt) : "完成时间缺失"}
          </p>
        </div>
        <button
          onClick={onDelete}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#B42318] text-[#B42318] hover:bg-[#FEE2E2]"
          aria-label="删除任务完成记录"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function StoryTaskResetRow({ story, tasks, onReset }: { key?: React.Key; story: MemoryStory; tasks: ChildTask[]; onReset: () => void }) {
  const completed = tasks.filter((task) => task.status === "completed").length;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#D1D5DB] bg-[#FAF8F2] p-3">
      <div>
        <p className="font-black text-[#111827]">{story.title}</p>
        <p className="text-xs font-bold text-[#4B5563]">已完成 {completed} / {tasks.length} 关</p>
      </div>
      <button
        onClick={onReset}
        className="flex h-10 items-center gap-2 rounded-lg border border-[#FD8603] px-3 text-sm font-black text-[#8A4700] hover:bg-[#FFEEDC]"
      >
        <RotateCcw className="h-4 w-4" />
        重置
      </button>
    </div>
  );
}

function StoryManagementRow({
  story,
  taskCount,
  interactionCount,
  onView,
  onDelete,
}: {
  key?: React.Key;
  story: MemoryStory;
  taskCount: number;
  interactionCount: number;
  onView: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex gap-4 rounded-xl border border-[#D1D5DB] bg-[#FAF8F2] p-3">
      <SafeImage
        src={getStoryImage(story)}
        fallbackSrc={imageAssets.placeholders.story}
        alt={story.title}
        className="h-24 w-28 shrink-0 rounded-lg border border-[#E1D3BF] object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-black text-[#111827]">{story.title}</p>
        <p className="mt-1 text-xs font-bold text-[#4B5563]">
          {taskCount} 个任务 · {interactionCount} 条互动 · {formatDateTime(story.createdAt)}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={onView}
            className="flex h-9 items-center gap-1 rounded-lg border border-[#D1D5DB] px-3 text-xs font-black hover:bg-white"
          >
            <Eye className="h-3.5 w-3.5" />
            查看
          </button>
          <button
            onClick={onDelete}
            className="flex h-9 items-center gap-1 rounded-lg border border-[#B42318] px-3 text-xs font-black text-[#B42318] hover:bg-[#FEE2E2]"
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

function ContentProtectionWall({
  logs,
  stats,
  storyById,
  selectedIds,
  riskFilter,
  actionFilter,
  typeFilter,
  search,
  onRiskFilterChange,
  onActionFilterChange,
  onTypeFilterChange,
  onSearchChange,
  onSelect,
  onBulkDelete,
  onClearPassed,
  onShowDeleted,
  onAction,
  onView,
  onDelete,
}: {
  logs: SafetyLog[];
  stats: { pending: number; passed: number; blocked: number; today: number };
  storyById: Map<string, MemoryStory>;
  selectedIds: string[];
  riskFilter: SafetyLog["riskLevel"] | "all";
  actionFilter: SafetyAction | "all";
  typeFilter: SafetyLog["sourceType"] | "all";
  search: string;
  onRiskFilterChange: (value: SafetyLog["riskLevel"] | "all") => void;
  onActionFilterChange: (value: SafetyAction | "all") => void;
  onTypeFilterChange: (value: SafetyLog["sourceType"] | "all") => void;
  onSearchChange: (value: string) => void;
  onSelect: (logId: string) => void;
  onBulkDelete: () => void;
  onClearPassed: () => void;
  onShowDeleted: () => void;
  onAction: (log: SafetyLog, action: SafetyAction) => void;
  onView: (log: SafetyLog) => void;
  onDelete: (log: SafetyLog) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#D1D5DB] bg-white">
      <div className="flex flex-col justify-between gap-4 border-b border-[#D1D5DB] px-6 py-5 xl:flex-row xl:items-start">
        <div>
          <h3 className="flex items-center gap-2 text-2xl font-black text-[#111827]">
            <ShieldCheck className="h-5 w-5 text-[#0E9F6E]" />
            内容保护墙
          </h3>
          <p className="mt-1 text-sm font-bold text-[#4B5563]">
            展示故事、语音、儿童互动和 AI 对话中的安全审核记录
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onBulkDelete}
            className="h-10 rounded-lg border border-[#B42318] px-3 text-sm font-black text-[#B42318] hover:bg-[#FEE2E2]"
          >
            删除所选
          </button>
          <button
            onClick={onClearPassed}
            className="h-10 rounded-lg border border-[#D1D5DB] px-3 text-sm font-black hover:bg-[#F3F4F6]"
          >
            批量清理已通过
          </button>
          <button
            onClick={onShowDeleted}
            className="h-10 rounded-lg border border-[#0E9F6E] px-3 text-sm font-black text-[#0E6F52] hover:bg-[#EAF5F0]"
          >
            查看已删除审核记录
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-[#D1D5DB] p-5 xl:grid-cols-4">
        <SafetyStatCard label="待确认" value={stats.pending} tone="warm" />
        <SafetyStatCard label="已通过" value={stats.passed} tone="safe" />
        <SafetyStatCard label="已拦截" value={stats.blocked} tone="danger" />
        <SafetyStatCard label="今日新增" value={stats.today} tone="neutral" />
      </div>

      <div className="grid grid-cols-1 gap-3 border-b border-[#D1D5DB] bg-[#FAF8F2] p-5 xl:grid-cols-[160px_160px_180px_1fr]">
        <FilterSelect
          label="风险等级"
          value={riskFilter}
          onChange={(value) => onRiskFilterChange(value as SafetyLog["riskLevel"] | "all")}
          options={[
            ["all", "全部"],
            ["low", "低"],
            ["medium", "中"],
            ["high", "高"],
          ]}
        />
        <FilterSelect
          label="状态"
          value={actionFilter}
          onChange={(value) => onActionFilterChange(value as SafetyAction | "all")}
          options={[
            ["all", "全部"],
            ["passed", "已通过"],
            ["pending_review", "待确认"],
            ["blocked", "已拦截"],
          ]}
        />
        <FilterSelect
          label="类型"
          value={typeFilter}
          onChange={(value) => onTypeFilterChange(value as SafetyLog["sourceType"] | "all")}
          options={[
            ["all", "全部"],
            ["TEXT", "故事文本"],
            ["ASR", "语音识别"],
            ["PHOTO", "图片"],
            ["CHILD_INTERACTION", "儿童互动"],
            ["AI_CHAT", "AI 对话"],
          ]}
        />
        <label className="block">
          <span className="text-xs font-black text-[#4B5563]">搜索</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索故事标题或内容摘要"
            className="mt-1 h-11 w-full rounded-xl border border-[#D1D5DB] bg-white px-3 font-bold outline-none focus:border-[#0E9F6E]"
          />
        </label>
      </div>

      <div className="max-h-[720px] space-y-4 overflow-y-auto p-5">
        {logs.length === 0 ? (
          <p className="rounded-2xl bg-[#FAF8F2] p-8 text-center font-black text-[#4B5563]">
            暂无需要处理的内容。
          </p>
        ) : (
          logs.slice().sort(byNewest).map((log) => (
            <SafetyAuditCard
              key={log.id}
              log={log}
              story={log.storyId ? storyById.get(log.storyId) : undefined}
              selected={selectedIds.includes(log.id)}
              onSelect={() => onSelect(log.id)}
              onAction={(action) => onAction(log, action)}
              onView={() => onView(log)}
              onDelete={() => onDelete(log)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function SafetyStatCard({ label, value, tone }: { label: string; value: number; tone: "safe" | "warm" | "danger" | "neutral" }) {
  const toneClass =
    tone === "safe"
      ? "text-[#0E9F6E]"
      : tone === "warm"
        ? "text-[#8A4700]"
        : tone === "danger"
          ? "text-[#B42318]"
          : "text-[#111827]";
  return (
    <div className="rounded-xl border border-[#D1D5DB] bg-[#FAF8F2] p-4">
      <p className="text-xs font-black text-[#4B5563]">{label}</p>
      <p className={`mt-2 text-3xl font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#4B5563]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-11 w-full rounded-xl border border-[#D1D5DB] bg-white px-3 font-bold outline-none focus:border-[#0E9F6E]"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function SafetyAuditCard({
  log,
  story,
  selected,
  onSelect,
  onAction,
  onView,
  onDelete,
}: {
  key?: React.Key;
  log: SafetyLog;
  story?: MemoryStory;
  selected: boolean;
  onSelect: () => void;
  onAction: (action: SafetyAction) => void;
  onView: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="grid grid-cols-1 gap-4 rounded-2xl border border-[#D1D5DB] bg-white p-4 shadow-sm xl:grid-cols-[minmax(0,1fr)_132px]">
      <div className="flex min-w-0 gap-4">
        <input type="checkbox" checked={selected} onChange={onSelect} className="mt-2 h-4 w-4 accent-[#0E9F6E]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill text={sourceLabel[log.sourceType]} tone="neutral" />
            <StatusPill text={riskLabel[log.riskLevel]} tone={log.riskLevel === "high" ? "danger" : log.riskLevel === "medium" ? "warm" : "safe"} />
            <StatusPill text={actionLabel[log.action]} tone={log.action === "blocked" ? "danger" : log.action === "pending_review" ? "warm" : "safe"} />
          </div>
          <p className="mt-3 font-black text-[#111827]">{story?.title ?? "未关联故事"}</p>
          <p className="mt-2 line-clamp-2 break-words text-sm font-bold leading-6 text-[#4B5563]">{log.content}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-[#6B7280]">
            <span>{log.matchedWord ? `命中原因：${log.matchedWord}` : "审核说明：未命中高风险关注词"}</span>
            <span>{formatDateTime(log.createdAt)}</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
        <AuditButton label="查看详情" onClick={onView} />
        <AuditButton label="通过" onClick={() => onAction("passed")} tone="safe" />
        <AuditButton label="待家属确认" onClick={() => onAction("pending_review")} tone="warm" />
        <AuditButton label="暂时拦截" onClick={() => onAction("blocked")} tone="dangerFill" />
        <AuditButton label="删除" onClick={onDelete} tone="danger" />
      </div>
    </article>
  );
}

function StatusPill({ text, tone }: { text: string; tone: "safe" | "warm" | "danger" | "neutral" }) {
  const toneClass =
    tone === "safe"
      ? "bg-[#EAF5F0] text-[#0E9F6E]"
      : tone === "warm"
        ? "bg-[#FFF7ED] text-[#8A4700]"
        : tone === "danger"
          ? "bg-[#FEE2E2] text-[#B42318]"
          : "bg-[#F4F2EB] text-[#4B5563]";
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${toneClass}`}>{text}</span>;
}

function AuditButton({
  label,
  onClick,
  tone = "neutral",
}: {
  label: string;
  onClick: () => void;
  tone?: "neutral" | "safe" | "warm" | "danger" | "dangerFill";
}) {
  const toneClass =
    tone === "safe"
      ? "border-[#0E9F6E] bg-[#EAF5F0] text-[#0E6F52]"
      : tone === "warm"
        ? "border-[#FD8603] bg-[#FFF7ED] text-[#8A4700]"
        : tone === "danger"
          ? "border-[#B42318] bg-white text-[#B42318]"
          : tone === "dangerFill"
            ? "border-[#B42318] bg-[#FEE2E2] text-[#B42318]"
            : "border-[#D1D5DB] bg-white text-[#111827]";
  return (
    <button onClick={onClick} className={`h-10 rounded-lg border px-3 text-xs font-black hover:brightness-95 ${toneClass}`}>
      {label}
    </button>
  );
}

function DeletedRecordsPanel({
  records,
  filter,
  selectedKeys,
  onFilterChange,
  onSelect,
  onSelectAll,
  onClearSelection,
  onBulkRestore,
  onBulkPermanentDelete,
  onClearFiltered,
  onRestore,
  onPermanentDelete,
}: {
  records: DeletedRecord[];
  filter: DeletedRecord["targetType"] | "all";
  selectedKeys: string[];
  onFilterChange: (filter: DeletedRecord["targetType"] | "all") => void;
  onSelect: (record: DeletedRecord) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkRestore: () => void;
  onBulkPermanentDelete: () => void;
  onClearFiltered: () => void;
  onRestore: (record: DeletedRecord) => void;
  onPermanentDelete: (record: DeletedRecord) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#D1D5DB] bg-white">
      <SectionHeader
        icon={<Undo2 className="h-5 w-5 text-[#0E9F6E]" />}
        title="已删除记录"
        note="展示故事、任务、互动、审核、AI 对话和 AI 通话的软删除记录，可恢复，也可永久删除。"
      />
      <div className="space-y-4 border-b border-[#D1D5DB] bg-[#FAF8F2] p-5">
        <div className="flex flex-wrap gap-2">
          {([
            ["all", "全部"],
            ["story", "故事"],
            ["task", "任务"],
            ["interaction", "互动"],
            ["safety_log", "审核"],
            ["ai_chat", "AI 对话"],
            ["ai_call", "AI 通话"],
          ] as [DeletedRecord["targetType"] | "all", string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => onFilterChange(value)}
              className={`h-9 rounded-lg border px-3 text-sm font-black ${
                filter === value
                  ? "border-[#0E9F6E] bg-[#EAF5F0] text-[#0E6F52]"
                  : "border-[#D1D5DB] bg-white text-[#4B5563] hover:bg-[#F3F4F6]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-black text-[#4B5563]">
            当前筛选 {records.length} 条，已选择 {selectedKeys.length} 条
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={onSelectAll} className="h-10 rounded-lg border border-[#D1D5DB] bg-white px-3 text-sm font-black hover:bg-[#F3F4F6]">
              全选
            </button>
            <button onClick={onClearSelection} className="h-10 rounded-lg border border-[#D1D5DB] bg-white px-3 text-sm font-black hover:bg-[#F3F4F6]">
              取消选择
            </button>
            <button onClick={onBulkRestore} className="h-10 rounded-lg bg-[#0E9F6E] px-3 text-sm font-black text-white hover:bg-[#0C8F62]">
              批量恢复
            </button>
            <button onClick={onBulkPermanentDelete} className="h-10 rounded-lg border border-[#B42318] bg-white px-3 text-sm font-black text-[#B42318] hover:bg-[#FEE2E2]">
              批量永久删除
            </button>
            <button onClick={onClearFiltered} className="h-10 rounded-lg bg-[#B42318] px-3 text-sm font-black text-white hover:bg-[#991B1B]">
              一键清空已删除记录
            </button>
          </div>
        </div>
      </div>
      <div className="divide-y divide-[#D1D5DB]">
        {records.length === 0 ? (
          <p className="p-6 font-bold text-[#4B5563]">暂无已删除记录。</p>
        ) : (
          records.map((record) => (
            <div key={`${record.targetType}-${record.id}`} className="flex flex-col justify-between gap-3 p-5 lg:flex-row lg:items-center">
              <div className="flex min-w-0 gap-3">
                <input
                  type="checkbox"
                  checked={selectedKeys.includes(deletedRecordKey(record))}
                  onChange={() => onSelect(record)}
                  className="mt-2 h-4 w-4 accent-[#0E9F6E]"
                />
                <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#F4F2EB] px-3 py-1 text-xs font-black text-[#4B5563]">
                    {deletedTypeLabel[record.targetType]}
                  </span>
                  <span className="text-xs font-bold text-[#4B5563]">{formatDateTime(record.deletedAt)}</span>
                </div>
                <p className="mt-2 font-black text-[#111827]">{record.label}</p>
                {record.deleteReason && <p className="mt-1 text-xs font-bold text-[#6B7280]">原因：{record.deleteReason}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onRestore(record)}
                  className="flex h-10 items-center gap-2 rounded-lg bg-[#0E9F6E] px-3 text-sm font-black text-white hover:bg-[#0C8F62]"
                >
                  <Undo2 className="h-4 w-4" />
                  恢复
                </button>
                <button
                  onClick={() => onPermanentDelete(record)}
                  className="flex h-10 items-center gap-2 rounded-lg border border-[#B42318] px-3 text-sm font-black text-[#B42318] hover:bg-[#FEE2E2]"
                >
                  <Trash2 className="h-4 w-4" />
                  永久删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function RiskWordsPanel({
  riskWords,
  newRiskWord,
  newRiskLabel,
  onWordChange,
  onLabelChange,
  onSubmit,
  onRemove,
}: {
  riskWords: { id: string; keyword: string; label: string; isDefault?: boolean }[];
  newRiskWord: string;
  newRiskLabel: string;
  onWordChange: (value: string) => void;
  onLabelChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onRemove: (wordId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-5">
      <h3 className="text-xl font-black text-[#111827]">风控词库</h3>
      <p className="mt-1 text-sm font-bold text-[#4B5563]">
        默认关注词以温和标签展示；新增家属关注词后，会检查故事和留言。
      </p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <input
          value={newRiskWord}
          onChange={(event) => onWordChange(event.target.value)}
          placeholder="输入家属关注词"
          className="h-11 w-full rounded-xl border border-[#D1D5DB] px-3 font-bold outline-none focus:border-[#0E9F6E]"
        />
        <input
          value={newRiskLabel}
          onChange={(event) => onLabelChange(event.target.value)}
          placeholder="词条说明"
          className="h-11 w-full rounded-xl border border-[#D1D5DB] px-3 font-bold outline-none focus:border-[#0E9F6E]"
        />
        <button className="h-11 w-full rounded-xl bg-[#0E9F6E] font-black text-white hover:bg-[#0C8F62]">
          添加关注词
        </button>
      </form>
      <div className="mt-4 space-y-2">
        {riskWords.map((word) => (
          <div key={word.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#D1D5DB] bg-[#FAF8F2] p-3">
            <div>
              <p className="text-sm font-black text-[#111827]">{word.isDefault ? word.label : word.keyword}</p>
              <p className="text-xs font-bold text-[#4B5563]">{word.isDefault ? "默认打码展示" : word.label}</p>
            </div>
            {!word.isDefault && (
              <button
                onClick={() => onRemove(word.id)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#B42318] text-[#B42318] hover:bg-[#FEE2E2]"
                aria-label="删除关注词"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function FamilyMembersPanel({ members }: { members: { id: string; avatar: string; name: string; bindStatus: string; lastActiveAt: string }[] }) {
  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-5">
      <h3 className="text-xl font-black text-[#111827]">家庭成员</h3>
      <div className="mt-4 space-y-3">
        {members.map((member) => (
          <div key={member.id} className="flex items-center gap-3 rounded-xl border border-[#D1D5DB] bg-[#FAF8F2] p-3">
            <SafeImage
              src={member.avatar}
              fallbackSrc={imageAssets.placeholders.avatar}
              alt={member.name}
              className="h-11 w-11 rounded-full object-cover"
            />
            <div className="flex-1">
              <p className="font-black text-[#111827]">{member.name}</p>
              <p className="text-xs font-bold text-[#4B5563]">
                {member.bindStatus} · 最近活跃 {formatDateTime(member.lastActiveAt)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function QrModal({ onClose, onPrint, onShare }: { onClose: () => void; onPrint: () => void; onShare: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#D1D5DB] bg-white p-6 text-center shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-black text-[#111827]">家庭绑定二维码</h3>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D1D5DB] hover:bg-[#F3F4F6]"
            aria-label="关闭二维码弹窗"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mx-auto mt-5 grid h-64 w-64 grid-cols-6 gap-1 rounded-2xl border-4 border-[#0E9F6E] bg-[#FAF8F2] p-5">
          {Array.from({ length: 36 }).map((_, index) => (
            <div
              key={index}
              className={`rounded ${
                [0, 1, 6, 7, 28, 29, 34, 35, 10, 14, 17, 22, 25, 31].includes(index)
                  ? "bg-[#0E9F6E]"
                  : index % 5 === 0
                    ? "bg-[#FD8603]"
                    : "bg-white"
              }`}
            />
          ))}
        </div>
        <p className="mt-4 text-sm font-bold text-[#4B5563]">
          家庭绑定二维码，可复制邀请链接或打开打印预览。
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={onPrint}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#D1D5DB] font-black hover:bg-[#F3F4F6]"
          >
            <Printer className="h-4 w-4" />
            打印二维码
          </button>
          <button
            onClick={onShare}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0E9F6E] font-black text-white hover:bg-[#0C8F62]"
          >
            <LinkIcon className="h-4 w-4" />
            分享链接
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({
  action,
  onCancel,
  onConfirm,
}: {
  action: ConfirmAction;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/55 p-4">
      <section className="w-full max-w-md rounded-2xl border border-[#D1D5DB] bg-white p-6 shadow-2xl">
        <h3 className="text-xl font-black text-[#111827]">{action.title}</h3>
        <p className="mt-3 font-bold leading-7 text-[#4B5563]">{action.message}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            className="h-12 rounded-xl border border-[#D1D5DB] font-black hover:bg-[#F3F4F6]"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className={`h-12 rounded-xl font-black text-white ${
              action.danger ? "bg-[#B42318] hover:bg-[#991B1B]" : "bg-[#0E9F6E] hover:bg-[#0C8F62]"
            }`}
          >
            {action.confirmLabel ?? "确认"}
          </button>
        </div>
      </section>
    </div>
  );
}
