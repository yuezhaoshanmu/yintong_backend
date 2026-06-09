export type StorySource = "voice" | "photo" | "manual";
export type SafetyStatus = "safe" | "pending" | "blocked";
export type TaskType = "observe" | "classify" | "sequence" | "assemble" | "quiz" | "emotion";
export type TaskStatus = "locked" | "active" | "completed";
export type InteractionType =
  | "like"
  | "flower"
  | "child_voice_reply"
  | "child_text_reply"
  | "elder_voice_reply"
  | "elder_text_reply"
  | "voice_reply"
  | "text_reply"
  | "story_created"
  | "task_completed";
export type Role = "elder" | "child" | "guardian";
export type SafetySourceType = "ASR" | "PHOTO" | "TEXT" | "CHILD_INTERACTION" | "AI_CHAT";
export type RiskLevel = "low" | "medium" | "high";
export type SafetyAction = "passed" | "pending_review" | "blocked";
export const DEFAULT_FAMILY_ID = "family-demo-001";

export type AiProvider = "fallback" | "deepseek";
export type AiVoiceMode = "browser" | "realtime";
export type AiUserRole = "elder" | "child";

export interface SoftDeleteMeta {
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: string;
}

export interface MemoryStory {
  id: string;
  familyId?: string;
  title: string;
  fullText: string;
  summary: string;
  yearTag: string;
  source: StorySource;
  imageUrl?: string;
  imageName?: string;
  imageStorageKey?: string;
  audioUrl?: string;
  audioDuration?: number;
  audioStorageKey?: string;
  audioBlobId?: string;
  asrText?: string;
  createdAt: string;
  updatedAt: string;
  likes: number;
  safetyStatus: SafetyStatus;
  childTaskIds: string[];
  interactionEventIds: string[];
  keywords?: string[];
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: string;
}

export interface ChildTaskItem {
  id: string;
  label: string;
  icon: string;
  image?: string;
  imageUrl?: string;
  imageAlt?: string;
  category?: string;
  correctCategory?: string;
  zoneId?: string;
  correctZoneId?: string;
  order?: number;
  hint?: string;
  isDistractor?: boolean;
  isCorrect?: boolean;
}

export interface ChildTask {
  id: string;
  familyId?: string;
  memoryStoryId: string;
  level: number;
  title: string;
  type: TaskType;
  instruction: string;
  abilityGoal: string;
  items: ChildTaskItem[];
  correctAnswer: string[] | Record<string, string> | string;
  userAnswer?: string[] | Record<string, string> | string;
  status: TaskStatus;
  stars: number;
  feedback?: string;
  completedAt?: string;
  completedBy?: string;
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: string;
}

export interface InteractionEvent {
  id: string;
  familyId?: string;
  type: InteractionType;
  fromRole: Role;
  toRole?: Role;
  storyId?: string;
  parentEventId?: string;
  createdAt: string;
  content: string;
  transcript?: string;
  audioUrl?: string;
  audioStorageKey?: string;
  audioDuration?: number;
  isRead?: boolean;
  readByElder?: boolean;
  readByChild?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: string;
}

export interface SafetyLog {
  id: string;
  familyId?: string;
  sourceType: SafetySourceType;
  content: string;
  storyId?: string;
  interactionId?: string;
  riskLevel: RiskLevel;
  action: SafetyAction;
  createdAt: string;
  matchedWord?: string;
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: string;
}

export interface FamilyMember {
  id: string;
  familyId?: string;
  name: string;
  role: Role | "grandparent" | "parent";
  avatar: string;
  bindStatus: "已绑定" | "待确认" | "未绑定";
  lastActiveAt: string;
}

export interface RiskWord {
  id: string;
  keyword: string;
  label: string;
  createdAt: string;
  isDefault?: boolean;
}

export interface AiChatMessage {
  id: string;
  familyId?: string;
  role: "user" | "assistant";
  userRole: AiUserRole;
  userId: string;
  storyId?: string;
  taskId?: string;
  content: string;
  audioUrl?: string;
  transcript?: string;
  provider: AiProvider;
  createdAt: string;
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: string;
}

export interface AiCallSession {
  id: string;
  familyId?: string;
  userId: string;
  userRole: AiUserRole;
  storyId?: string;
  taskId?: string;
  mode: AiVoiceMode;
  provider: AiProvider;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  status: "active" | "ended" | "failed";
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: string;
}

export interface GuardianActionLog {
  id: string;
  action:
    | "delete_interaction"
    | "restore_interaction"
    | "reset_task"
    | "delete_story"
    | "restore_story"
    | "delete_safety_log"
    | "restore_safety_log"
    | "delete_ai_chat"
    | "restore_ai_chat"
    | "delete_ai_call"
    | "restore_ai_call"
    | "restore_task";
  targetId: string;
  targetType: "interaction" | "task" | "story" | "safety_log" | "ai_chat" | "ai_call";
  operatorId: string;
  operatorName: string;
  createdAt: string;
  reason?: string;
}

export interface AiSettings {
  childAssistantEnabled: boolean;
  elderAssistantEnabled: boolean;
}

export interface AppState {
  stories: MemoryStory[];
  childTasks: ChildTask[];
  interactions: InteractionEvent[];
  safetyLogs: SafetyLog[];
  familyMembers: FamilyMember[];
  riskWords: RiskWord[];
  aiChatMessages: AiChatMessage[];
  aiCallSessions: AiCallSession[];
  guardianActionLogs: GuardianActionLog[];
  aiSettings: AiSettings;
}

export type StoryDraft = {
  familyId?: string;
  title: string;
  fullText: string;
  yearTag: string;
  source: StorySource;
  imageUrl?: string;
  imageName?: string;
  imageStorageKey?: string;
  audioUrl?: string;
  audioDuration?: number;
  audioStorageKey?: string;
  audioBlobId?: string;
  asrText?: string;
};

export type ToastKind = "success" | "error" | "info";
