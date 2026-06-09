import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { DEFAULT_FAMILY_MEMBERS, DEFAULT_RISK_WORDS, DEFAULT_STORIES } from "./data";
import { imageAssets } from "./data/imageAssets";
import { loadMediaBlob } from "./mediaDb";
import {
  createInteraction,
  createMemoryStory,
  createSafetyLog,
  createTasksForStory,
  detectRisk,
} from "./mockLogic";
import {
  AppState,
  AiCallSession,
  AiChatMessage,
  AiSettings,
  ChildTask,
  ChildTaskItem,
  DEFAULT_FAMILY_ID,
  FamilyMember,
  GuardianActionLog,
  InteractionEvent,
  MemoryStory,
  RiskWord,
  SafetyAction,
  SafetyLog,
  StoryDraft,
} from "./types";
import { getStoryImage } from "./utils/storyImage";
import { getTaskItemImage } from "./utils/taskItemImage";

const STORAGE_KEY = "silver-child-demo-store-v3";
const LEGACY_STORAGE_KEY = "silver-child-demo-store-v2";

type GuardianOperationOptions = {
  operatorId?: string;
  operatorName?: string;
  reason?: string;
  deleteRelatedStory?: boolean;
};

type Action =
  | { type: "ADD_STORY"; story: MemoryStory; tasks: ChildTask[] }
  | { type: "UPDATE_STORY"; storyId: string; patch: Partial<MemoryStory> }
  | { type: "DELETE_STORY"; storyId: string; options?: GuardianOperationOptions }
  | { type: "RESTORE_STORY"; storyId: string; options?: GuardianOperationOptions }
  | { type: "PURGE_DELETED"; targetType: DeletedRecord["targetType"]; targetId: string }
  | { type: "BULK_PURGE_DELETED"; records: Pick<DeletedRecord, "targetType" | "id">[] }
  | { type: "CLEAR_DELETED"; targetType?: DeletedRecord["targetType"] | "all" }
  | { type: "REGENERATE_TASKS"; storyId: string }
  | { type: "RESET_STORY_TASKS"; storyId: string; options?: GuardianOperationOptions }
  | { type: "RESET_CHILD_TASKS"; childUserId: string; options?: GuardianOperationOptions }
  | { type: "DELETE_TASK_COMPLETION"; taskId: string; options?: GuardianOperationOptions }
  | { type: "RESTORE_CHILD_TASK"; taskId: string; options?: GuardianOperationOptions }
  | { type: "LIKE_STORY"; storyId: string; fromRole?: InteractionEvent["fromRole"] }
  | { type: "COMPLETE_TASK"; taskId: string; userAnswer: ChildTask["userAnswer"]; stars?: number; feedback?: string }
  | { type: "ADD_INTERACTION"; event: InteractionEvent }
  | { type: "DELETE_INTERACTION"; eventId: string; options?: GuardianOperationOptions }
  | { type: "RESTORE_INTERACTION"; eventId: string; options?: GuardianOperationOptions }
  | { type: "BULK_DELETE_INTERACTIONS"; eventIds: string[]; options?: GuardianOperationOptions }
  | { type: "MARK_INTERACTION_READ"; eventId: string; role?: InteractionEvent["toRole"] }
  | { type: "UPDATE_SAFETY_LOG"; logId: string; action: SafetyAction }
  | { type: "DELETE_SAFETY_LOG"; logId: string; options?: GuardianOperationOptions }
  | { type: "RESTORE_SAFETY_LOG"; logId: string; options?: GuardianOperationOptions }
  | { type: "BULK_DELETE_SAFETY_LOGS"; logIds: string[]; options?: GuardianOperationOptions }
  | { type: "ADD_RISK_WORD"; word: RiskWord }
  | { type: "REMOVE_RISK_WORD"; wordId: string }
  | { type: "ADD_AI_CHAT_MESSAGES"; messages: AiChatMessage[] }
  | { type: "DELETE_AI_CHAT_MESSAGE"; messageId: string; options?: GuardianOperationOptions }
  | { type: "RESTORE_AI_CHAT_MESSAGE"; messageId: string; options?: GuardianOperationOptions }
  | { type: "BULK_DELETE_AI_CHAT_MESSAGES"; messageIds: string[]; options?: GuardianOperationOptions }
  | { type: "ADD_AI_CALL_SESSION"; session: AiCallSession }
  | { type: "END_AI_CALL_SESSION"; sessionId: string; endedAt: string; durationSeconds: number; status?: AiCallSession["status"] }
  | { type: "DELETE_AI_CALL_SESSION"; sessionId: string; options?: GuardianOperationOptions }
  | { type: "RESTORE_AI_CALL_SESSION"; sessionId: string; options?: GuardianOperationOptions }
  | { type: "SET_AI_ASSISTANT_ENABLED"; role: "child" | "elder"; enabled: boolean }
  | { type: "HYDRATE_MEDIA"; stories: MemoryStory[]; interactions: InteractionEvent[] };

export type DeletedRecord = {
  targetType: "interaction" | "task" | "story" | "safety_log" | "ai_chat" | "ai_call";
  id: string;
  label: string;
  deletedAt: string;
  deleteReason?: string;
};

type SilverStoreValue = {
  state: AppState;
  addStory: (draft: StoryDraft) => MemoryStory;
  updateStory: (storyId: string, patch: Partial<MemoryStory>) => void;
  deleteStory: (storyId: string, options?: GuardianOperationOptions) => void;
  deleteMemoryStory: (storyId: string, options?: GuardianOperationOptions) => void;
  restoreMemoryStory: (storyId: string, options?: GuardianOperationOptions) => void;
  permanentlyDeleteRecord: (targetType: DeletedRecord["targetType"], targetId: string) => void;
  bulkPermanentlyDeleteRecords: (records: Pick<DeletedRecord, "targetType" | "id">[]) => void;
  clearDeletedRecords: (targetType?: DeletedRecord["targetType"] | "all") => void;
  regenerateTasks: (storyId: string) => void;
  resetStoryTasks: (storyId: string, options?: GuardianOperationOptions) => void;
  resetChildTasks: (childUserId: string, options?: GuardianOperationOptions) => void;
  deleteTaskCompletion: (taskId: string, options?: GuardianOperationOptions) => void;
  restoreChildTask: (taskId: string, options?: GuardianOperationOptions) => void;
  likeStory: (storyId: string, fromRole?: InteractionEvent["fromRole"]) => void;
  completeTask: (
    taskId: string,
    userAnswer: ChildTask["userAnswer"],
    stars?: number,
    feedback?: string
  ) => void;
  addInteraction: (event: InteractionEvent) => void;
  deleteInteractionEvent: (eventId: string, options?: GuardianOperationOptions) => void;
  restoreInteractionEvent: (eventId: string, options?: GuardianOperationOptions) => void;
  bulkDeleteInteractionEvents: (eventIds: string[], options?: GuardianOperationOptions) => void;
  markInteractionRead: (eventId: string, role?: InteractionEvent["toRole"]) => void;
  updateSafetyLog: (logId: string, action: SafetyAction) => void;
  deleteSafetyLog: (logId: string, options?: GuardianOperationOptions) => void;
  restoreSafetyLog: (logId: string, options?: GuardianOperationOptions) => void;
  bulkDeleteSafetyLogs: (logIds: string[], options?: GuardianOperationOptions) => void;
  addRiskWord: (keyword: string, label?: string) => void;
  removeRiskWord: (wordId: string) => void;
  addAiChatMessages: (messages: AiChatMessage[]) => void;
  deleteAiChatMessage: (messageId: string, options?: GuardianOperationOptions) => void;
  restoreAiChatMessage: (messageId: string, options?: GuardianOperationOptions) => void;
  bulkDeleteAiChatMessages: (messageIds: string[], options?: GuardianOperationOptions) => void;
  addAiCallSession: (session: AiCallSession) => void;
  endAiCallSession: (sessionId: string, durationSeconds: number, status?: AiCallSession["status"]) => void;
  deleteAiCallSession: (sessionId: string, options?: GuardianOperationOptions) => void;
  restoreAiCallSession: (sessionId: string, options?: GuardianOperationOptions) => void;
  setAiAssistantEnabled: (role: "child" | "elder", enabled: boolean) => void;
  getDeletedRecords: () => DeletedRecord[];
};

const SilverStoreContext = createContext<SilverStoreValue | null>(null);

const DEFAULT_AI_SETTINGS: AiSettings = {
  childAssistantEnabled: true,
  elderAssistantEnabled: true,
};

function nowIso(): string {
  return new Date().toISOString();
}

function withDeleteMeta<T extends { deletedAt?: string; deletedBy?: string; deleteReason?: string }>(
  item: T,
  options?: GuardianOperationOptions
): T {
  return {
    ...item,
    deletedAt: item.deletedAt ?? nowIso(),
    deletedBy: options?.operatorId ?? "guardian",
    deleteReason: options?.reason,
  };
}

function clearDeleteMeta<T extends { deletedAt?: string; deletedBy?: string; deleteReason?: string }>(item: T): T {
  const { deletedAt, deletedBy, deleteReason, ...rest } = item;
  return rest as T;
}

function guardianLog(
  action: GuardianActionLog["action"],
  targetType: GuardianActionLog["targetType"],
  targetId: string,
  options?: GuardianOperationOptions
): GuardianActionLog {
  return {
    id: `guardian-log-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    action,
    targetId,
    targetType,
    operatorId: options?.operatorId ?? "guardian",
    operatorName: options?.operatorName ?? "家属守护员",
    createdAt: nowIso(),
    reason: options?.reason,
  };
}

function resetTasksForStory(tasks: ChildTask[]): ChildTask[] {
  return tasks
    .sort((a, b) => a.level - b.level)
    .map((task, index) => ({
      ...task,
      userAnswer: undefined,
      feedback: undefined,
      completedAt: undefined,
      completedBy: undefined,
      stars: 0,
      status: index === 0 ? "active" : "locked",
    }));
}

function getDeletedRecordLabel(record: DeletedRecord["targetType"], item: { id: string } & Record<string, unknown>): string {
  if (record === "story") return String(item.title ?? "已删除故事");
  if (record === "task") return String(item.title ?? "已删除任务记录");
  if (record === "interaction") return String(item.content ?? "已删除互动消息").slice(0, 30);
  if (record === "safety_log") return String(item.content ?? "已删除审核记录").slice(0, 30);
  if (record === "ai_call") return "已删除 AI 语音通话";
  return String(item.content ?? "已删除 AI 对话").slice(0, 30);
}

function collectDeletedRecords(state: AppState): DeletedRecord[] {
  const records: DeletedRecord[] = [
    ...state.stories
      .filter((item) => item.deletedAt)
      .map((item) => ({
        targetType: "story" as const,
        id: item.id,
        label: getDeletedRecordLabel("story", item as unknown as { id: string } & Record<string, unknown>),
        deletedAt: item.deletedAt as string,
        deleteReason: item.deleteReason,
      })),
    ...state.childTasks
      .filter((item) => item.deletedAt)
      .map((item) => ({
        targetType: "task" as const,
        id: item.id,
        label: getDeletedRecordLabel("task", item as unknown as { id: string } & Record<string, unknown>),
        deletedAt: item.deletedAt as string,
        deleteReason: item.deleteReason,
      })),
    ...state.interactions
      .filter((item) => item.deletedAt)
      .map((item) => ({
        targetType: "interaction" as const,
        id: item.id,
        label: getDeletedRecordLabel("interaction", item as unknown as { id: string } & Record<string, unknown>),
        deletedAt: item.deletedAt as string,
        deleteReason: item.deleteReason,
      })),
    ...state.safetyLogs
      .filter((item) => item.deletedAt)
      .map((item) => ({
        targetType: "safety_log" as const,
        id: item.id,
        label: getDeletedRecordLabel("safety_log", item as unknown as { id: string } & Record<string, unknown>),
        deletedAt: item.deletedAt as string,
        deleteReason: item.deleteReason,
      })),
    ...state.aiChatMessages
      .filter((item) => item.deletedAt)
      .map((item) => ({
        targetType: "ai_chat" as const,
        id: item.id,
        label: getDeletedRecordLabel("ai_chat", item as unknown as { id: string } & Record<string, unknown>),
        deletedAt: item.deletedAt as string,
        deleteReason: item.deleteReason,
      })),
    ...state.aiCallSessions
      .filter((item) => item.deletedAt)
      .map((item) => ({
        targetType: "ai_call" as const,
        id: item.id,
        label: getDeletedRecordLabel("ai_call", item as unknown as { id: string } & Record<string, unknown>),
        deletedAt: item.deletedAt as string,
        deleteReason: item.deleteReason,
      })),
  ];
  return records.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
}

function linkStoryAndTasks(story: MemoryStory): { story: MemoryStory; tasks: ChildTask[] } {
  const storyWithFamily = { ...story, familyId: story.familyId ?? DEFAULT_FAMILY_ID };
  const tasks = createTasksForStory(storyWithFamily);
  return {
    story: {
      ...storyWithFamily,
      childTaskIds: tasks.map((task) => task.id),
    },
    tasks,
  };
}

function createInitialState(): AppState {
  const storyBundles = DEFAULT_STORIES.map(linkStoryAndTasks);
  const stories = storyBundles.map((bundle) => bundle.story);
  const childTasks = storyBundles.flatMap((bundle) => bundle.tasks);
  const interactions: InteractionEvent[] = [
    {
      id: "event-default-flower",
      familyId: DEFAULT_FAMILY_ID,
      type: "flower",
      fromRole: "child",
      toRole: "elder",
      storyId: stories[0]?.id,
      createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
      content: "萌萌给爷爷送了一朵小红花：这个故事真温暖。",
      isRead: false,
      readByElder: false,
    },
    {
      id: "event-default-reply",
      familyId: DEFAULT_FAMILY_ID,
      type: "elder_text_reply",
      fromRole: "elder",
      toRole: "child",
      storyId: stories[0]?.id,
      createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
      content: "爷爷收到啦，晚上再给你讲收音机里的广播故事。",
      isRead: false,
      readByChild: false,
    },
  ];
  const storiesWithInteractions = stories.map((story) => ({
    ...story,
    interactionEventIds: interactions.filter((event) => event.storyId === story.id).map((event) => event.id),
  }));

  return {
    stories: storiesWithInteractions,
    childTasks,
    interactions,
    safetyLogs: storiesWithInteractions.map((story) =>
      createSafetyLog({
        sourceType: "TEXT",
        content: `已建立回忆《${story.title}》：${story.summary}`,
        storyId: story.id,
        riskWords: DEFAULT_RISK_WORDS,
      })
    ),
    familyMembers: DEFAULT_FAMILY_MEMBERS,
    riskWords: DEFAULT_RISK_WORDS,
    aiChatMessages: [],
    aiCallSessions: [],
    guardianActionLogs: [],
    aiSettings: DEFAULT_AI_SETTINGS,
  };
}

function normalizeStory(story: Partial<MemoryStory>): MemoryStory {
  const now = new Date().toISOString();
  const legacyImage =
    story.imageUrl?.startsWith("https://images.unsplash.com") || story.imageUrl?.startsWith("/assets/real-photos");
  const imageUrl = getStoryImage({
    title: story.title,
    summary: story.summary,
    fullText: story.fullText,
    imageUrl: legacyImage ? undefined : story.imageUrl,
  });
  return {
    id: story.id ?? `story-${Date.now()}`,
    familyId: story.familyId ?? DEFAULT_FAMILY_ID,
    title: story.title ?? "未命名回忆",
    fullText: story.fullText ?? "",
    summary: story.summary ?? "",
    yearTag: story.yearTag ?? "年代待补充",
    source: story.source ?? "manual",
    imageUrl,
    imageName: story.imageName,
    imageStorageKey: story.imageStorageKey,
    audioUrl: story.audioUrl,
    audioDuration: story.audioDuration,
    audioStorageKey: story.audioStorageKey,
    audioBlobId: story.audioBlobId ?? story.audioStorageKey,
    asrText: story.asrText ?? "",
    createdAt: story.createdAt ?? now,
    updatedAt: story.updatedAt ?? story.createdAt ?? now,
    likes: story.likes ?? 0,
    safetyStatus: story.safetyStatus ?? "safe",
    childTaskIds: story.childTaskIds ?? [],
    interactionEventIds: story.interactionEventIds ?? [],
    keywords: story.keywords ?? [],
    deletedAt: story.deletedAt,
    deletedBy: story.deletedBy,
    deleteReason: story.deleteReason,
  };
}

function localAvatarForMember(member: Partial<FamilyMember>, index: number): string {
  const text = `${member.id ?? ""}${member.name ?? ""}${member.role ?? ""}`;
  if (text.includes("child") || text.includes("萌") || text.includes("孙")) return imageAssets.avatars.childGirl;
  if (text.includes("grandma") || text.includes("奶") || text.includes("外婆")) return imageAssets.avatars.grandma;
  if (text.includes("guardian") || text.includes("parent") || text.includes("女士") || text.includes("家属")) {
    return imageAssets.avatars.father;
  }
  if (text.includes("worker") || text.includes("社区") || text.includes("老师")) return imageAssets.avatars.communityWorker;
  if (index === 1) return imageAssets.avatars.childGirl;
  if (index === 2) return imageAssets.avatars.father;
  if (index === 3) return imageAssets.avatars.grandma;
  return imageAssets.avatars.grandpa;
}

function normalizeFamilyMember(member: Partial<FamilyMember>, index: number): FamilyMember {
  const fallback = DEFAULT_FAMILY_MEMBERS[index] ?? DEFAULT_FAMILY_MEMBERS[0];
  const legacyAvatar =
    !member.avatar ||
    member.avatar.startsWith("http") ||
    member.avatar.startsWith("/assets/real-photos") ||
    member.avatar.startsWith("/image/") === false;
  return {
    id: member.id ?? fallback.id,
    familyId: member.familyId ?? fallback.familyId ?? DEFAULT_FAMILY_ID,
    name: member.name ?? fallback.name,
    role: member.role ?? fallback.role,
    avatar: legacyAvatar ? localAvatarForMember(member, index) : member.avatar,
    bindStatus: member.bindStatus ?? fallback.bindStatus,
    lastActiveAt: member.lastActiveAt ?? fallback.lastActiveAt,
  };
}

function normalizeTaskItem(item: ChildTaskItem): ChildTaskItem {
  const exactFallback = getTaskItemImage(item.label);
  const image =
    item.image ??
    (exactFallback !== imageAssets.objects.placeholder ? exactFallback : item.imageUrl ?? exactFallback);
  return {
    ...item,
    image,
    imageUrl: image,
  };
}

function normalizeTask(task: ChildTask): ChildTask {
  return {
    ...task,
    familyId: task.familyId ?? DEFAULT_FAMILY_ID,
    deletedAt: task.deletedAt,
    deletedBy: task.deletedBy,
    deleteReason: task.deleteReason,
    items: task.items.map(normalizeTaskItem),
  };
}

function normalizeInteraction(event: Partial<InteractionEvent>): InteractionEvent {
  const fromRole = event.fromRole ?? "guardian";
  const hasAudio = Boolean(event.audioUrl || event.audioStorageKey);
  const legacyType =
    event.type === "voice_reply"
      ? fromRole === "elder"
        ? "elder_voice_reply"
        : "child_voice_reply"
      : event.type === "text_reply"
        ? fromRole === "elder"
          ? "elder_text_reply"
          : "child_text_reply"
        : event.type ?? "like";
  const toRole =
    event.toRole ?? (fromRole === "elder" ? "child" : fromRole === "child" ? "elder" : "elder");
  return {
    id: event.id ?? `event-${Date.now()}`,
    familyId: event.familyId ?? DEFAULT_FAMILY_ID,
    type: hasAudio && legacyType === "child_text_reply" ? "child_voice_reply" : legacyType,
    fromRole,
    toRole,
    storyId: event.storyId,
    parentEventId: event.parentEventId,
    createdAt: event.createdAt ?? new Date().toISOString(),
    content: event.content ?? "",
    transcript: event.transcript,
    audioUrl: event.audioUrl,
    audioStorageKey: event.audioStorageKey,
    audioDuration: event.audioDuration,
    isRead: event.isRead ?? false,
    readByElder: event.readByElder ?? (toRole === "elder" ? event.isRead ?? false : undefined),
    readByChild: event.readByChild ?? (toRole === "child" ? event.isRead ?? false : undefined),
    deletedAt: event.deletedAt,
    deletedBy: event.deletedBy,
    deleteReason: event.deleteReason,
  };
}

function normalizeAiChatMessage(message: Partial<AiChatMessage>): AiChatMessage {
  return {
    id: message.id ?? `ai-msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    familyId: message.familyId ?? DEFAULT_FAMILY_ID,
    role: message.role ?? "assistant",
    userRole: message.userRole ?? "elder",
    userId: message.userId ?? "demo-elder",
    storyId: message.storyId,
    taskId: message.taskId,
    content: message.content ?? "",
    audioUrl: message.audioUrl,
    transcript: message.transcript,
    provider: message.provider ?? "fallback",
    createdAt: message.createdAt ?? new Date().toISOString(),
    deletedAt: message.deletedAt,
    deletedBy: message.deletedBy,
    deleteReason: message.deleteReason,
  };
}

function normalizeAiCallSession(session: Partial<AiCallSession>): AiCallSession {
  return {
    id: session.id ?? `ai-call-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    familyId: session.familyId ?? DEFAULT_FAMILY_ID,
    userId: session.userId ?? "demo-elder",
    userRole: session.userRole ?? "elder",
    storyId: session.storyId,
    taskId: session.taskId,
    mode: session.mode ?? "browser",
    provider: session.provider ?? "fallback",
    startedAt: session.startedAt ?? new Date().toISOString(),
    endedAt: session.endedAt,
    durationSeconds: session.durationSeconds,
    status: session.status ?? "ended",
    deletedAt: session.deletedAt,
    deletedBy: session.deletedBy,
    deleteReason: session.deleteReason,
  };
}

function normalizeLoadedState(parsed: Partial<AppState>): AppState {
  const base = createInitialState();
  const stories = Array.isArray(parsed.stories) ? parsed.stories.map(normalizeStory) : base.stories;
  const allParsedTasks = Array.isArray(parsed.childTasks) ? parsed.childTasks : [];
  const interactions = Array.isArray(parsed.interactions)
    ? parsed.interactions.map(normalizeInteraction)
    : base.interactions;
  const completionEvents = interactions.filter((event) => event.type === "task_completed");
  const taskBundles = stories.flatMap((story) => {
    const existing = allParsedTasks.filter((task) => task.memoryStoryId === story.id);
    const tasks = (existing.length ? existing : createTasksForStory(story)).map(normalizeTask);
    const everyCompleted = tasks.length > 0 && tasks.every((task) => task.status === "completed");
    const hasCompletionHistory = completionEvents.some((event) => event.storyId === story.id);
    return everyCompleted && !hasCompletionHistory ? resetTasksForStory(tasks) : tasks;
  });
  const storiesWithTaskIds = stories.map((story) => ({
    ...story,
    childTaskIds: taskBundles.filter((task) => task.memoryStoryId === story.id).map((task) => task.id),
    interactionEventIds: interactions.filter((event) => event.storyId === story.id).map((event) => event.id),
  }));

  const familyMembers =
    Array.isArray(parsed.familyMembers) && parsed.familyMembers.length
      ? parsed.familyMembers.map(normalizeFamilyMember)
      : base.familyMembers;

  return {
    stories: storiesWithTaskIds,
    childTasks: taskBundles,
    interactions,
    safetyLogs: Array.isArray(parsed.safetyLogs)
      ? parsed.safetyLogs.map((log) => ({
          ...log,
          familyId: log.familyId ?? DEFAULT_FAMILY_ID,
          deletedAt: log.deletedAt,
          deletedBy: log.deletedBy,
          deleteReason: log.deleteReason,
        }))
      : base.safetyLogs,
    familyMembers,
    riskWords: Array.isArray(parsed.riskWords) && parsed.riskWords.length ? parsed.riskWords : base.riskWords,
    aiChatMessages: Array.isArray(parsed.aiChatMessages)
      ? parsed.aiChatMessages.map(normalizeAiChatMessage)
      : base.aiChatMessages,
    aiCallSessions: Array.isArray(parsed.aiCallSessions)
      ? parsed.aiCallSessions.map(normalizeAiCallSession)
      : base.aiCallSessions,
    guardianActionLogs: Array.isArray(parsed.guardianActionLogs) ? parsed.guardianActionLogs : base.guardianActionLogs,
    aiSettings: {
      ...DEFAULT_AI_SETTINGS,
      ...(parsed.aiSettings ?? {}),
    },
  };
}

function loadInitialState(): AppState {
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return createInitialState();
    return normalizeLoadedState(JSON.parse(raw) as Partial<AppState>);
  } catch {
    return createInitialState();
  }
}

function sanitizeForPersistence(state: AppState): AppState {
  return {
    ...state,
    stories: state.stories.map((story) => ({
      ...story,
      imageUrl: story.imageStorageKey ? "" : story.imageUrl,
      audioUrl: story.audioStorageKey ? "" : story.audioUrl,
    })),
    interactions: state.interactions.map((event) => ({
      ...event,
      audioUrl: event.audioStorageKey ? "" : event.audioUrl,
    })),
  };
}

function getStorySafetyStatus(logs: SafetyLog[]): MemoryStory["safetyStatus"] {
  if (logs.some((log) => log.action === "blocked")) return "blocked";
  if (logs.some((log) => log.action === "pending_review")) return "pending";
  return "safe";
}

function linkEventToStory(stories: MemoryStory[], event: InteractionEvent): MemoryStory[] {
  if (!event.storyId) return stories;
  return stories.map((story) =>
    story.id === event.storyId
      ? {
          ...story,
          updatedAt: new Date().toISOString(),
          interactionEventIds: Array.from(new Set([...story.interactionEventIds, event.id])),
        }
      : story
  );
}

function purgeDeletedRecords(
  state: AppState,
  records: Pick<DeletedRecord, "targetType" | "id">[]
): AppState {
  const storyIds = new Set(records.filter((record) => record.targetType === "story").map((record) => record.id));
  const taskIds = new Set(records.filter((record) => record.targetType === "task").map((record) => record.id));
  const interactionIds = new Set(records.filter((record) => record.targetType === "interaction").map((record) => record.id));
  const safetyLogIds = new Set(records.filter((record) => record.targetType === "safety_log").map((record) => record.id));
  const aiChatIds = new Set(records.filter((record) => record.targetType === "ai_chat").map((record) => record.id));
  const aiCallIds = new Set(records.filter((record) => record.targetType === "ai_call").map((record) => record.id));

  return {
    ...state,
    stories: state.stories.filter((story) => !storyIds.has(story.id)),
    childTasks: state.childTasks.filter((task) => !taskIds.has(task.id) && !storyIds.has(task.memoryStoryId)),
    interactions: state.interactions.filter(
      (event) => !interactionIds.has(event.id) && (!event.storyId || !storyIds.has(event.storyId))
    ),
    safetyLogs: state.safetyLogs.filter(
      (log) => !safetyLogIds.has(log.id) && (!log.storyId || !storyIds.has(log.storyId))
    ),
    aiChatMessages: state.aiChatMessages.filter(
      (message) => !aiChatIds.has(message.id) && (!message.storyId || !storyIds.has(message.storyId))
    ),
    aiCallSessions: state.aiCallSessions.filter(
      (session) => !aiCallIds.has(session.id) && (!session.storyId || !storyIds.has(session.storyId))
    ),
  };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "ADD_STORY": {
      const textLog = createSafetyLog({
        sourceType: "TEXT",
        content: `新回忆《${action.story.title}》：${action.story.fullText}`,
        storyId: action.story.id,
        riskWords: state.riskWords,
      });
      const sourceLog =
        action.story.source === "voice"
          ? createSafetyLog({
              sourceType: "ASR",
              content: action.story.asrText || action.story.fullText,
              storyId: action.story.id,
              riskWords: state.riskWords,
            })
          : action.story.source === "photo"
            ? createSafetyLog({
                sourceType: "PHOTO",
                content: `上传照片 ${action.story.imageName ?? "未命名照片"}，并生成回忆《${action.story.title}》。`,
                storyId: action.story.id,
                riskWords: state.riskWords,
              })
            : undefined;
      const storyLogs = [textLog, sourceLog].filter(Boolean) as SafetyLog[];
      const storyCreated = createInteraction({
        type: "story_created",
        fromRole: "elder",
        toRole: "child",
        storyId: action.story.id,
        content: `爷爷新增了回忆《${action.story.title}》，儿童探索任务已生成。`,
      });
      const linkedStory: MemoryStory = {
        ...action.story,
        childTaskIds: action.tasks.map((task) => task.id),
        interactionEventIds: [storyCreated.id],
        safetyStatus: getStorySafetyStatus(storyLogs),
      };

      return {
        ...state,
        stories: [linkedStory, ...state.stories],
        childTasks: [...action.tasks, ...state.childTasks],
        interactions: [storyCreated, ...state.interactions],
        safetyLogs: [...storyLogs, ...state.safetyLogs],
      };
    }

    case "UPDATE_STORY":
      return {
        ...state,
        stories: state.stories.map((story) =>
          story.id === action.storyId
            ? { ...story, ...action.patch, updatedAt: new Date().toISOString() }
            : story
        ),
      };

    case "DELETE_STORY": {
      const log = guardianLog("delete_story", "story", action.storyId, action.options);
      return {
        ...state,
        stories: state.stories.map((story) =>
          story.id === action.storyId ? withDeleteMeta(story, action.options) : story
        ),
        childTasks: state.childTasks.map((task) =>
          task.memoryStoryId === action.storyId ? withDeleteMeta(task, action.options) : task
        ),
        interactions: state.interactions.map((event) =>
          event.storyId === action.storyId ? withDeleteMeta(event, action.options) : event
        ),
        safetyLogs: state.safetyLogs.map((safetyLog) =>
          safetyLog.storyId === action.storyId ? withDeleteMeta(safetyLog, action.options) : safetyLog
        ),
        aiChatMessages: state.aiChatMessages.map((message) =>
          message.storyId === action.storyId ? withDeleteMeta(message, action.options) : message
        ),
        aiCallSessions: state.aiCallSessions.map((session) =>
          session.storyId === action.storyId ? withDeleteMeta(session, action.options) : session
        ),
        guardianActionLogs: [log, ...state.guardianActionLogs],
      };
    }

    case "RESTORE_STORY": {
      const log = guardianLog("restore_story", "story", action.storyId, action.options);
      return {
        ...state,
        stories: state.stories.map((story) => (story.id === action.storyId ? clearDeleteMeta(story) : story)),
        childTasks: state.childTasks.map((task) =>
          task.memoryStoryId === action.storyId ? clearDeleteMeta(task) : task
        ),
        interactions: state.interactions.map((event) =>
          event.storyId === action.storyId ? clearDeleteMeta(event) : event
        ),
        safetyLogs: state.safetyLogs.map((safetyLog) =>
          safetyLog.storyId === action.storyId ? clearDeleteMeta(safetyLog) : safetyLog
        ),
        aiChatMessages: state.aiChatMessages.map((message) =>
          message.storyId === action.storyId ? clearDeleteMeta(message) : message
        ),
        aiCallSessions: state.aiCallSessions.map((session) =>
          session.storyId === action.storyId ? clearDeleteMeta(session) : session
        ),
        guardianActionLogs: [log, ...state.guardianActionLogs],
      };
    }

    case "PURGE_DELETED": {
      return purgeDeletedRecords(state, [{ targetType: action.targetType, id: action.targetId }]);
    }

    case "BULK_PURGE_DELETED":
      return purgeDeletedRecords(state, action.records);

    case "CLEAR_DELETED": {
      const records = collectDeletedRecords(state).filter(
        (record) => !action.targetType || action.targetType === "all" || record.targetType === action.targetType
      );
      return purgeDeletedRecords(state, records);
    }

    case "REGENERATE_TASKS":
    case "RESET_STORY_TASKS": {
      const story = state.stories.find((item) => item.id === action.storyId && !item.deletedAt);
      if (!story) return state;
      const freshTasks =
        action.type === "REGENERATE_TASKS"
          ? createTasksForStory({ ...story, childTaskIds: [] })
          : resetTasksForStory(
              state.childTasks.filter((task) => task.memoryStoryId === story.id).length
                ? state.childTasks.filter((task) => task.memoryStoryId === story.id)
                : createTasksForStory(story)
            );
      const freshStory = { ...story, childTaskIds: freshTasks.map((task) => task.id), updatedAt: new Date().toISOString() };
      const resetLog =
        action.type === "RESET_STORY_TASKS"
          ? guardianLog("reset_task", "task", action.storyId, action.options)
          : undefined;
      return {
        ...state,
        stories: state.stories.map((item) => (item.id === story.id ? freshStory : item)),
        childTasks: [
          ...freshTasks,
          ...state.childTasks.filter((task) => task.memoryStoryId !== story.id),
        ],
        interactions:
          action.type === "RESET_STORY_TASKS"
            ? state.interactions.map((event) =>
                event.storyId === story.id && event.type === "task_completed"
                  ? withDeleteMeta(event, action.options)
                  : event
              )
            : state.interactions,
        guardianActionLogs: resetLog ? [resetLog, ...state.guardianActionLogs] : state.guardianActionLogs,
      };
    }

    case "RESET_CHILD_TASKS": {
      const storyIds = new Set(state.stories.filter((story) => !story.deletedAt).map((story) => story.id));
      const grouped = new Map<string, ChildTask[]>();
      state.childTasks
        .filter((task) => storyIds.has(task.memoryStoryId) && !task.deletedAt)
        .forEach((task) => {
          grouped.set(task.memoryStoryId, [...(grouped.get(task.memoryStoryId) ?? []), task]);
        });
      const resetById = new Map<string, ChildTask>();
      grouped.forEach((tasks) => {
        resetTasksForStory(tasks).forEach((task) => resetById.set(task.id, task));
      });
      return {
        ...state,
        childTasks: state.childTasks.map((task) => resetById.get(task.id) ?? task),
        interactions: state.interactions.map((event) =>
          event.type === "task_completed" ? withDeleteMeta(event, action.options) : event
        ),
        guardianActionLogs: [
          guardianLog("reset_task", "task", action.childUserId, action.options),
          ...state.guardianActionLogs,
        ],
      };
    }

    case "DELETE_TASK_COMPLETION": {
      const target = state.childTasks.find((task) => task.id === action.taskId);
      if (!target) return state;
      const storyTasks = resetTasksForStory(
        state.childTasks.filter((task) => task.memoryStoryId === target.memoryStoryId && !task.deletedAt)
      );
      const resetTarget = storyTasks.find((task) => task.id === target.id);
      const nextTasks = state.childTasks.map((task) =>
        task.id === action.taskId
          ? resetTarget ?? {
              ...task,
              userAnswer: undefined,
              feedback: undefined,
              completedAt: undefined,
              completedBy: undefined,
              stars: 0,
              status: "active" as const,
            }
          : task
      );
      return {
        ...state,
        childTasks: nextTasks,
        interactions: state.interactions.map((event) =>
          event.type === "task_completed" && event.storyId === target.memoryStoryId
            ? withDeleteMeta(event, action.options)
            : event
        ),
        guardianActionLogs: [
          guardianLog("reset_task", "task", action.taskId, action.options),
          ...state.guardianActionLogs,
        ],
      };
    }

    case "RESTORE_CHILD_TASK":
      return {
        ...state,
        childTasks: state.childTasks.map((task) =>
          task.id === action.taskId ? clearDeleteMeta(task) : task
        ),
        guardianActionLogs: [
          guardianLog("restore_task", "task", action.taskId, action.options),
          ...state.guardianActionLogs,
        ],
      };

    case "LIKE_STORY": {
      const story = state.stories.find((item) => item.id === action.storyId && !item.deletedAt);
      if (!story) return state;
      const event = createInteraction({
        type: "like",
        fromRole: action.fromRole ?? "guardian",
        toRole: "elder",
        storyId: action.storyId,
        content: `家人给《${story.title}》点了赞。`,
      });
      return {
        ...state,
        stories: linkEventToStory(
          state.stories.map((item) =>
            item.id === action.storyId ? { ...item, likes: item.likes + 1 } : item
          ),
          event
        ),
        interactions: [event, ...state.interactions],
      };
    }

    case "COMPLETE_TASK": {
      const task = state.childTasks.find((item) => item.id === action.taskId);
      if (!task || task.status === "completed" || task.deletedAt) return state;
      const story = state.stories.find((item) => item.id === task.memoryStoryId && !item.deletedAt);
      if (!story) return state;
      const completedAt = new Date().toISOString();
      const updatedTasks = state.childTasks.map((item) => {
        if (item.id === action.taskId) {
          return {
            ...item,
            userAnswer: action.userAnswer,
            status: "completed" as const,
            stars: action.stars ?? 1,
            feedback: action.feedback ?? "你完成了这一关。",
            completedAt,
          };
        }
        if (item.memoryStoryId === task.memoryStoryId && item.level === task.level + 1) {
          return { ...item, status: item.status === "locked" ? "active" : item.status };
        }
        return item;
      });
      const event = createInteraction({
        type: "task_completed",
        fromRole: "child",
        toRole: "guardian",
        storyId: task.memoryStoryId,
        content: `萌萌完成了《${story?.title ?? "故事"}》的${task.abilityGoal}：${task.title}。`,
      });
      return {
        ...state,
        stories: linkEventToStory(state.stories, event),
        childTasks: updatedTasks,
        interactions: [event, ...state.interactions],
      };
    }

    case "ADD_INTERACTION": {
      const log = createSafetyLog({
        sourceType: "CHILD_INTERACTION",
        content: action.event.content,
        storyId: action.event.storyId,
        interactionId: action.event.id,
        riskWords: state.riskWords,
      });
      return {
        ...state,
        stories: linkEventToStory(state.stories, action.event),
        interactions: [action.event, ...state.interactions],
        safetyLogs: [log, ...state.safetyLogs],
      };
    }

    case "DELETE_INTERACTION": {
      return {
        ...state,
        interactions: state.interactions.map((event) =>
          event.id === action.eventId ? withDeleteMeta(event, action.options) : event
        ),
        guardianActionLogs: [
          guardianLog("delete_interaction", "interaction", action.eventId, action.options),
          ...state.guardianActionLogs,
        ],
      };
    }

    case "RESTORE_INTERACTION": {
      return {
        ...state,
        interactions: state.interactions.map((event) =>
          event.id === action.eventId ? clearDeleteMeta(event) : event
        ),
        guardianActionLogs: [
          guardianLog("restore_interaction", "interaction", action.eventId, action.options),
          ...state.guardianActionLogs,
        ],
      };
    }

    case "BULK_DELETE_INTERACTIONS": {
      const targets = new Set(action.eventIds);
      return {
        ...state,
        interactions: state.interactions.map((event) =>
          targets.has(event.id) ? withDeleteMeta(event, action.options) : event
        ),
        guardianActionLogs: [
          ...action.eventIds.map((id) => guardianLog("delete_interaction", "interaction", id, action.options)),
          ...state.guardianActionLogs,
        ],
      };
    }

    case "MARK_INTERACTION_READ":
      return {
        ...state,
        interactions: state.interactions.map((event) =>
          event.id === action.eventId
            ? {
                ...event,
                isRead: true,
                readByElder: action.role === "elder" || event.toRole === "elder" ? true : event.readByElder,
                readByChild: action.role === "child" || event.toRole === "child" ? true : event.readByChild,
              }
            : event
        ),
      };

    case "UPDATE_SAFETY_LOG": {
      const target = state.safetyLogs.find((log) => log.id === action.logId && !log.deletedAt);
      const stories =
        target?.storyId != null
          ? state.stories.map((story) => {
              if (story.id !== target.storyId) return story;
              const safetyStatus: MemoryStory["safetyStatus"] =
                action.action === "blocked"
                  ? "blocked"
                  : action.action === "pending_review"
                    ? "pending"
                    : "safe";
              return { ...story, safetyStatus, updatedAt: new Date().toISOString() };
            })
          : state.stories;
      return {
        ...state,
        stories,
        safetyLogs: state.safetyLogs.map((log) =>
          log.id === action.logId ? { ...log, action: action.action } : log
        ),
      };
    }

    case "DELETE_SAFETY_LOG": {
      const target = state.safetyLogs.find((log) => log.id === action.logId);
      return {
        ...state,
        safetyLogs: state.safetyLogs.map((log) =>
          log.id === action.logId ? withDeleteMeta(log, action.options) : log
        ),
        ...(action.options?.deleteRelatedStory && target?.storyId
          ? {
              stories: state.stories.map((story) =>
                story.id === target.storyId ? withDeleteMeta(story, action.options) : story
              ),
              childTasks: state.childTasks.map((task) =>
                task.memoryStoryId === target.storyId ? withDeleteMeta(task, action.options) : task
              ),
              interactions: state.interactions.map((event) =>
                event.storyId === target.storyId ? withDeleteMeta(event, action.options) : event
              ),
            }
          : {}),
        guardianActionLogs: [
          guardianLog("delete_safety_log", "safety_log", action.logId, action.options),
          ...state.guardianActionLogs,
        ],
      };
    }

    case "RESTORE_SAFETY_LOG": {
      return {
        ...state,
        safetyLogs: state.safetyLogs.map((log) => (log.id === action.logId ? clearDeleteMeta(log) : log)),
        guardianActionLogs: [
          guardianLog("restore_safety_log", "safety_log", action.logId, action.options),
          ...state.guardianActionLogs,
        ],
      };
    }

    case "BULK_DELETE_SAFETY_LOGS": {
      const targets = new Set(action.logIds);
      return {
        ...state,
        safetyLogs: state.safetyLogs.map((log) => (targets.has(log.id) ? withDeleteMeta(log, action.options) : log)),
        guardianActionLogs: [
          ...action.logIds.map((id) => guardianLog("delete_safety_log", "safety_log", id, action.options)),
          ...state.guardianActionLogs,
        ],
      };
    }

    case "ADD_RISK_WORD": {
      const highRiskLogs: SafetyLog[] = [];
      const stories = state.stories.map((story) => {
        const risk = detectRisk(`${story.title}${story.fullText}${story.asrText ?? ""}`, [action.word]);
        if (risk.riskLevel !== "high") return story;
        highRiskLogs.push({
          id: `safety-risk-${story.id}-${action.word.id}`,
          sourceType: "TEXT",
          content: `自定义关注词命中《${story.title}》，已进入家属确认流程。`,
          storyId: story.id,
          riskLevel: "high",
          action: "blocked",
          createdAt: new Date().toISOString(),
          matchedWord: action.word.keyword,
        });
        return { ...story, safetyStatus: "blocked" as const, updatedAt: new Date().toISOString() };
      });

      state.interactions.forEach((event) => {
        const risk = detectRisk(event.content, [action.word]);
        if (risk.riskLevel === "high") {
          highRiskLogs.push({
            id: `safety-risk-${event.id}-${action.word.id}`,
            sourceType: "CHILD_INTERACTION",
            content: `自定义关注词命中互动内容：${event.content}`,
            storyId: event.storyId,
            interactionId: event.id,
            riskLevel: "high",
            action: "blocked",
            createdAt: new Date().toISOString(),
            matchedWord: action.word.keyword,
          });
        }
      });

      return {
        ...state,
        stories,
        riskWords: [action.word, ...state.riskWords],
        safetyLogs: [...highRiskLogs, ...state.safetyLogs],
      };
    }

    case "REMOVE_RISK_WORD":
      return {
        ...state,
        riskWords: state.riskWords.filter((word) => word.id !== action.wordId),
      };

    case "ADD_AI_CHAT_MESSAGES":
      {
        const normalizedMessages = action.messages.map(normalizeAiChatMessage);
        const safetyLogs: SafetyLog[] = normalizedMessages
          .filter((message) => message.role === "assistant" && !message.deletedAt)
          .map((message) =>
            createSafetyLog({
              sourceType: "AI_CHAT",
              content: message.content,
              storyId: message.storyId,
              riskWords: state.riskWords,
            })
          );
        return {
          ...state,
          aiChatMessages: [...normalizedMessages, ...state.aiChatMessages],
          safetyLogs: [...safetyLogs, ...state.safetyLogs],
        };
      }

    case "DELETE_AI_CHAT_MESSAGE":
      return {
        ...state,
        aiChatMessages: state.aiChatMessages.map((message) =>
          message.id === action.messageId ? withDeleteMeta(message, action.options) : message
        ),
        guardianActionLogs: [
          guardianLog("delete_ai_chat", "ai_chat", action.messageId, action.options),
          ...state.guardianActionLogs,
        ],
      };

    case "RESTORE_AI_CHAT_MESSAGE":
      return {
        ...state,
        aiChatMessages: state.aiChatMessages.map((message) =>
          message.id === action.messageId ? clearDeleteMeta(message) : message
        ),
        guardianActionLogs: [
          guardianLog("restore_ai_chat", "ai_chat", action.messageId, action.options),
          ...state.guardianActionLogs,
        ],
      };

    case "BULK_DELETE_AI_CHAT_MESSAGES": {
      const targets = new Set(action.messageIds);
      return {
        ...state,
        aiChatMessages: state.aiChatMessages.map((message) =>
          targets.has(message.id) ? withDeleteMeta(message, action.options) : message
        ),
        guardianActionLogs: [
          ...action.messageIds.map((id) => guardianLog("delete_ai_chat", "ai_chat", id, action.options)),
          ...state.guardianActionLogs,
        ],
      };
    }

    case "ADD_AI_CALL_SESSION":
      return {
        ...state,
        aiCallSessions: [normalizeAiCallSession(action.session), ...state.aiCallSessions],
      };

    case "END_AI_CALL_SESSION":
      return {
        ...state,
        aiCallSessions: state.aiCallSessions.map((session) =>
          session.id === action.sessionId
            ? {
                ...session,
                endedAt: action.endedAt,
                durationSeconds: action.durationSeconds,
                status: action.status ?? "ended",
              }
            : session
        ),
      };

    case "DELETE_AI_CALL_SESSION":
      return {
        ...state,
        aiCallSessions: state.aiCallSessions.map((session) =>
          session.id === action.sessionId ? withDeleteMeta(session, action.options) : session
        ),
        guardianActionLogs: [
          guardianLog("delete_ai_call", "ai_call", action.sessionId, action.options),
          ...state.guardianActionLogs,
        ],
      };

    case "RESTORE_AI_CALL_SESSION":
      return {
        ...state,
        aiCallSessions: state.aiCallSessions.map((session) =>
          session.id === action.sessionId ? clearDeleteMeta(session) : session
        ),
        guardianActionLogs: [
          guardianLog("restore_ai_call", "ai_call", action.sessionId, action.options),
          ...state.guardianActionLogs,
        ],
      };

    case "SET_AI_ASSISTANT_ENABLED":
      return {
        ...state,
        aiSettings: {
          ...state.aiSettings,
          childAssistantEnabled:
            action.role === "child" ? action.enabled : state.aiSettings.childAssistantEnabled,
          elderAssistantEnabled:
            action.role === "elder" ? action.enabled : state.aiSettings.elderAssistantEnabled,
        },
      };

    case "HYDRATE_MEDIA":
      return {
        ...state,
        stories: state.stories.map((story) => {
          const hydrated = action.stories.find((item) => item.id === story.id);
          return hydrated ? { ...story, ...hydrated } : story;
        }),
        interactions: state.interactions.map((event) => {
          const hydrated = action.interactions.find((item) => item.id === event.id);
          return hydrated ? { ...event, ...hydrated } : event;
        }),
      };

    default:
      return state;
  }
}

export function SilverStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeForPersistence(state)));
  }, [state]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateMedia() {
      const stories = await Promise.all(
        state.stories.map(async (story) => {
          const patch: MemoryStory = { ...story };
          if (story.imageStorageKey && !story.imageUrl) {
            const blob = await loadMediaBlob(story.imageStorageKey);
            if (blob) patch.imageUrl = URL.createObjectURL(blob);
          }
          if (story.audioStorageKey && !story.audioUrl) {
            const blob = await loadMediaBlob(story.audioStorageKey);
            if (blob) patch.audioUrl = URL.createObjectURL(blob);
          }
          return patch;
        })
      );

      const interactions = await Promise.all(
        state.interactions.map(async (event) => {
          const patch: InteractionEvent = { ...event };
          if (event.audioStorageKey && !event.audioUrl) {
            const blob = await loadMediaBlob(event.audioStorageKey);
            if (blob) patch.audioUrl = URL.createObjectURL(blob);
          }
          return patch;
        })
      );

      if (!cancelled) {
        dispatch({ type: "HYDRATE_MEDIA", stories, interactions });
      }
    }

    hydrateMedia().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SilverStoreValue>(
    () => ({
      state,
      addStory(draft) {
        const story = createMemoryStory(draft);
        const tasks = createTasksForStory(story);
        dispatch({ type: "ADD_STORY", story, tasks });
        return story;
      },
      updateStory(storyId, patch) {
        dispatch({ type: "UPDATE_STORY", storyId, patch });
      },
      deleteStory(storyId, options) {
        dispatch({ type: "DELETE_STORY", storyId, options });
      },
      deleteMemoryStory(storyId, options) {
        dispatch({ type: "DELETE_STORY", storyId, options });
      },
      restoreMemoryStory(storyId, options) {
        dispatch({ type: "RESTORE_STORY", storyId, options });
      },
      permanentlyDeleteRecord(targetType, targetId) {
        dispatch({ type: "PURGE_DELETED", targetType, targetId });
      },
      bulkPermanentlyDeleteRecords(records) {
        dispatch({ type: "BULK_PURGE_DELETED", records });
      },
      clearDeletedRecords(targetType = "all") {
        dispatch({ type: "CLEAR_DELETED", targetType });
      },
      regenerateTasks(storyId) {
        dispatch({ type: "REGENERATE_TASKS", storyId });
      },
      resetStoryTasks(storyId, options) {
        dispatch({ type: "RESET_STORY_TASKS", storyId, options });
      },
      resetChildTasks(childUserId, options) {
        dispatch({ type: "RESET_CHILD_TASKS", childUserId, options });
      },
      deleteTaskCompletion(taskId, options) {
        dispatch({ type: "DELETE_TASK_COMPLETION", taskId, options });
      },
      restoreChildTask(taskId, options) {
        dispatch({ type: "RESTORE_CHILD_TASK", taskId, options });
      },
      likeStory(storyId, fromRole) {
        dispatch({ type: "LIKE_STORY", storyId, fromRole });
      },
      completeTask(taskId, userAnswer, stars, feedback) {
        dispatch({ type: "COMPLETE_TASK", taskId, userAnswer, stars, feedback });
      },
      addInteraction(event) {
        dispatch({ type: "ADD_INTERACTION", event });
      },
      deleteInteractionEvent(eventId, options) {
        dispatch({ type: "DELETE_INTERACTION", eventId, options });
      },
      restoreInteractionEvent(eventId, options) {
        dispatch({ type: "RESTORE_INTERACTION", eventId, options });
      },
      bulkDeleteInteractionEvents(eventIds, options) {
        dispatch({ type: "BULK_DELETE_INTERACTIONS", eventIds, options });
      },
      markInteractionRead(eventId, role) {
        dispatch({ type: "MARK_INTERACTION_READ", eventId, role });
      },
      updateSafetyLog(logId, actionValue) {
        dispatch({ type: "UPDATE_SAFETY_LOG", logId, action: actionValue });
      },
      deleteSafetyLog(logId, options) {
        dispatch({ type: "DELETE_SAFETY_LOG", logId, options });
      },
      restoreSafetyLog(logId, options) {
        dispatch({ type: "RESTORE_SAFETY_LOG", logId, options });
      },
      bulkDeleteSafetyLogs(logIds, options) {
        dispatch({ type: "BULK_DELETE_SAFETY_LOGS", logIds, options });
      },
      addRiskWord(keyword, label) {
        const word: RiskWord = {
          id: `risk-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
          keyword: keyword.trim(),
          label: label?.trim() || "家属自定义关注词",
          createdAt: new Date().toISOString(),
        };
        dispatch({ type: "ADD_RISK_WORD", word });
      },
      removeRiskWord(wordId) {
        dispatch({ type: "REMOVE_RISK_WORD", wordId });
      },
      addAiChatMessages(messages) {
        dispatch({ type: "ADD_AI_CHAT_MESSAGES", messages });
      },
      deleteAiChatMessage(messageId, options) {
        dispatch({ type: "DELETE_AI_CHAT_MESSAGE", messageId, options });
      },
      restoreAiChatMessage(messageId, options) {
        dispatch({ type: "RESTORE_AI_CHAT_MESSAGE", messageId, options });
      },
      bulkDeleteAiChatMessages(messageIds, options) {
        dispatch({ type: "BULK_DELETE_AI_CHAT_MESSAGES", messageIds, options });
      },
      addAiCallSession(session) {
        dispatch({ type: "ADD_AI_CALL_SESSION", session });
      },
      endAiCallSession(sessionId, durationSeconds, status) {
        dispatch({ type: "END_AI_CALL_SESSION", sessionId, endedAt: new Date().toISOString(), durationSeconds, status });
      },
      deleteAiCallSession(sessionId, options) {
        dispatch({ type: "DELETE_AI_CALL_SESSION", sessionId, options });
      },
      restoreAiCallSession(sessionId, options) {
        dispatch({ type: "RESTORE_AI_CALL_SESSION", sessionId, options });
      },
      setAiAssistantEnabled(role, enabled) {
        dispatch({ type: "SET_AI_ASSISTANT_ENABLED", role, enabled });
      },
      getDeletedRecords() {
        return collectDeletedRecords(state);
      },
    }),
    [state]
  );

  return <SilverStoreContext.Provider value={value}>{children}</SilverStoreContext.Provider>;
}

export function useSilverStore(): SilverStoreValue {
  const value = useContext(SilverStoreContext);
  if (!value) {
    throw new Error("useSilverStore must be used inside SilverStoreProvider");
  }
  return value;
}
