import {
  ChildTask,
  ChildTaskItem,
  DEFAULT_FAMILY_ID,
  InteractionEvent,
  MemoryStory,
  RiskLevel,
  RiskWord,
  SafetyAction,
  SafetyLog,
  SafetySourceType,
  StoryDraft,
  TaskType,
} from "./types";
import { imageAssets } from "./data/imageAssets";
import { getTaskItemImage } from "./utils/taskItemImage";

export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDuration(seconds = 0): string {
  const safe = Math.max(0, Math.round(seconds));
  const min = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export function isToday(value: string): boolean {
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function summarizeText(text: string): string {
  const clean = text.trim().replace(/\s+/g, "");
  return clean.length > 40 ? `${clean.slice(0, 40)}...` : clean;
}

export function extractKeywords(text: string): string[] {
  const dict = ["收音机", "天线", "风扇", "广播", "白兔糖", "糖纸", "玻璃罐", "供销社", "自行车", "车铃", "车把", "车轮", "照片", "相册", "相框", "老屋"];
  const found = dict.filter((word) => text.includes(word));
  return Array.from(new Set(found.length ? found : ["家庭回忆"]));
}

export function createDemoAsrText(selectedTheme: string): string {
  const templates: Record<string, string> = {
    收音机:
      "演示模式文本：那时候家里有一台老式收音机，晚上吃完饭，大家围在桌边听广播。风扇慢慢转着，窗外有虫鸣声，我到现在还记得那种安静又热闹的感觉。",
    白兔糖:
      "演示模式文本：小时候去供销社，最惦记的是玻璃罐里的白兔糖。糖纸剥开以后有淡淡的奶香，我舍不得一下吃完，总是含很久。",
    自行车:
      "演示模式文本：我年轻时骑着那辆二八自行车穿过巷子，车铃一响，邻居家的孩子就知道我回来了。",
    老照片:
      "演示模式文本：这张老照片一拿出来，我就想起那间老屋。大家挤在一起拍照，衣服朴素，笑得却很亮。",
  };
  return templates[selectedTheme] ?? templates["老照片"];
}

type StoryKit = {
  coreObject: string;
  correctObjects: ChildTaskItem[];
  distractors: ChildTaskItem[];
  classifyItems: ChildTaskItem[];
  sequence: ChildTaskItem[];
  assembleZones: { id: string; label: string; hint: string }[];
  assembleItems: ChildTaskItem[];
  quizQuestion: string;
  quizOptions: ChildTaskItem[];
  quizAnswer: string;
  quizFeedback: string;
};

function taskItemPhoto(item: ChildTaskItem): string | undefined {
  return getTaskItemImage(item.label);
}

function withTaskPhoto(item: ChildTaskItem): ChildTaskItem {
  const imageUrl = item.image ?? item.imageUrl ?? taskItemPhoto(item);
  return {
    ...item,
    image: imageUrl,
    imageUrl,
    imageAlt: imageUrl ? `${item.label}真实照片` : item.imageAlt,
  };
}

function getStoryKit(story: MemoryStory): StoryKit {
  const text = `${story.title}${story.fullText}${story.asrText ?? ""}`;
  if (text.includes("收音机") || text.includes("广播")) {
    return {
      coreObject: "收音机",
      correctObjects: [
        { id: "radio", label: "收音机", icon: "📻" },
        { id: "antenna", label: "天线", icon: "📡" },
        { id: "fan", label: "风扇", icon: "🌀" },
      ],
      distractors: [
        { id: "phone", label: "手机", icon: "📱", isDistractor: true },
        { id: "gamepad", label: "游戏机", icon: "🎮", isDistractor: true },
        { id: "rocket", label: "火箭", icon: "🚀", isDistractor: true },
      ],
      classifyItems: [
        { id: "radio", label: "收音机", icon: "📻", correctCategory: "老物件" },
        { id: "antenna", label: "天线", icon: "📡", correctCategory: "老物件" },
        { id: "fan", label: "风扇", icon: "🌀", correctCategory: "生活用品" },
        { id: "table", label: "饭桌", icon: "🪑", correctCategory: "地点" },
      ],
      sequence: [
        { id: "s1", label: "晚饭后坐到桌边", icon: "1", order: 1 },
        { id: "s2", label: "爷爷拿出收音机", icon: "2", order: 2 },
        { id: "s3", label: "广播里的音乐响起", icon: "3", order: 3 },
        { id: "s4", label: "一家人安静地听故事", icon: "4", order: 4 },
      ],
      assembleZones: [
        { id: "body", label: "主体", hint: "收音机主体在中间。" },
        { id: "antenna", label: "天线", hint: "天线通常在收音机上方，再试试看。" },
        { id: "knob", label: "旋钮", hint: "旋钮一般在收音机正面。" },
        { id: "battery", label: "电池仓", hint: "电池仓多在背面或底部。" },
      ],
      assembleItems: [
        { id: "part-body", label: "木色外壳", icon: "📻", correctZoneId: "body" },
        { id: "part-antenna", label: "金属天线", icon: "📡", correctZoneId: "antenna" },
        { id: "part-knob", label: "调频旋钮", icon: "⚙️", correctZoneId: "knob" },
        { id: "part-battery", label: "电池仓盖", icon: "🔋", correctZoneId: "battery" },
      ],
      quizQuestion: "为什么爷爷觉得这台收音机很珍贵？",
      quizOptions: [
        { id: "a", label: "因为它陪伴了一家人听广播", icon: "A" },
        { id: "b", label: "因为它可以玩电子游戏", icon: "B" },
        { id: "c", label: "因为它是一台新手机", icon: "C" },
      ],
      quizAnswer: "a",
      quizFeedback: "你理解了爷爷为什么觉得这段回忆珍贵：它陪伴了一家人。",
    };
  }

  if (text.includes("白兔糖") || text.includes("供销社") || text.includes("糖")) {
    return {
      coreObject: "白兔糖",
      correctObjects: [
        {
          id: "white-rabbit-candy",
          label: "白兔糖",
          icon: "🍬",
          image: imageAssets.objects.whiteRabbitCandy,
          isCorrect: true,
          hint: "爷爷故事里提到了小时候舍不得吃的白兔糖。",
        },
        {
          id: "glass-jar",
          label: "玻璃罐",
          icon: "🏺",
          image: imageAssets.objects.glassJar,
          isCorrect: true,
          hint: "爷爷说糖果装在玻璃罐里。",
        },
        {
          id: "supply-cooperative",
          label: "供销社",
          icon: "🏪",
          image: imageAssets.objects.supplyCooperative,
          isCorrect: true,
          hint: "供销社是爷爷小时候买东西的地方。",
        },
      ],
      distractors: [
        {
          id: "tablet",
          label: "平板电脑",
          icon: "📱",
          image: imageAssets.objects.tablet,
          isCorrect: false,
          hint: "平板电脑是现在的物品，不是爷爷小时候故事里的。",
          isDistractor: true,
        },
        {
          id: "pizza",
          label: "披萨",
          icon: "🍕",
          image: imageAssets.objects.pizza,
          isCorrect: false,
          hint: "披萨不是这段故事里的关键物件。",
          isDistractor: true,
        },
        {
          id: "airplane",
          label: "飞机",
          icon: "✈️",
          image: imageAssets.objects.airplane,
          isCorrect: false,
          hint: "飞机和这段爷爷讲的糖果回忆没有关系。",
          isDistractor: true,
        },
      ],
      classifyItems: [
        { id: "candy", label: "白兔糖", icon: "🍬", correctCategory: "食物" },
        { id: "wrapper", label: "糖纸", icon: "🧾", correctCategory: "老物件" },
        { id: "jar", label: "玻璃罐", icon: "🏺", correctCategory: "老物件" },
        { id: "store", label: "供销社", icon: "🏪", correctCategory: "地点" },
      ],
      sequence: [
        { id: "s1", label: "走进供销社", icon: "1", order: 1 },
        { id: "s2", label: "看见玻璃罐", icon: "2", order: 2 },
        { id: "s3", label: "慢慢剥开糖纸", icon: "3", order: 3 },
        { id: "s4", label: "记住甜甜的味道", icon: "4", order: 4 },
      ],
      assembleZones: [
        { id: "jar", label: "糖罐", hint: "糖果要先放进玻璃罐里。" },
        { id: "wrapper", label: "糖纸", hint: "糖纸包在糖外面。" },
        { id: "counter", label: "柜台", hint: "供销社的玻璃柜台放在下面。" },
        { id: "label", label: "价签", hint: "价签通常贴在柜台前面。" },
      ],
      assembleItems: [
        { id: "part-jar", label: "玻璃糖罐", icon: "🏺", correctZoneId: "jar" },
        { id: "part-wrapper", label: "白色糖纸", icon: "🧾", correctZoneId: "wrapper" },
        { id: "part-counter", label: "木柜台", icon: "🧰", correctZoneId: "counter" },
        { id: "part-label", label: "小价签", icon: "🏷️", correctZoneId: "label" },
      ],
      quizQuestion: "为什么爷爷会把一颗糖记很久？",
      quizOptions: [
        { id: "a", label: "因为那时候糖很少，要慢慢品尝", icon: "A" },
        { id: "b", label: "因为糖能变成玩具", icon: "B" },
        { id: "c", label: "因为糖是在手机里买的", icon: "C" },
      ],
      quizAnswer: "a",
      quizFeedback: "你理解了爷爷为什么觉得这段回忆珍贵：小小的甜味陪伴了童年。",
    };
  }

  if (text.includes("自行车") || text.includes("车铃") || text.includes("巷子")) {
    return {
      coreObject: "自行车",
      correctObjects: [
        { id: "bike", label: "自行车", icon: "🚲" },
        { id: "bell", label: "车铃", icon: "🔔" },
        { id: "lane", label: "巷子", icon: "🏘️" },
      ],
      distractors: [
        { id: "subway", label: "地铁", icon: "🚇", isDistractor: true },
        { id: "camera", label: "相机", icon: "📷", isDistractor: true },
        { id: "cake", label: "蛋糕", icon: "🍰", isDistractor: true },
      ],
      classifyItems: [
        { id: "bike", label: "自行车", icon: "🚲", correctCategory: "老物件" },
        { id: "bell", label: "车铃", icon: "🔔", correctCategory: "老物件" },
        { id: "lane", label: "巷子", icon: "🏘️", correctCategory: "地点" },
        { id: "family", label: "一家人", icon: "👨‍👩‍👧", correctCategory: "人物" },
      ],
      sequence: [
        { id: "s1", label: "推车出门", icon: "1", order: 1 },
        { id: "s2", label: "车铃响起来", icon: "2", order: 2 },
        { id: "s3", label: "穿过老巷子", icon: "3", order: 3 },
        { id: "s4", label: "把东西带回家", icon: "4", order: 4 },
      ],
      assembleZones: [
        { id: "handle", label: "车把", hint: "车把在自行车最前面。" },
        { id: "bell", label: "车铃", hint: "车铃装在车把附近。" },
        { id: "wheel", label: "车轮", hint: "车轮在车架下面。" },
        { id: "seat", label: "车座", hint: "车座在车架上方。" },
      ],
      assembleItems: [
        { id: "part-handle", label: "车把", icon: "➰", correctZoneId: "handle" },
        { id: "part-bell", label: "车铃", icon: "🔔", correctZoneId: "bell" },
        { id: "part-wheel", label: "车轮", icon: "⭕", correctZoneId: "wheel" },
        { id: "part-seat", label: "车座", icon: "💺", correctZoneId: "seat" },
      ],
      quizQuestion: "自行车在故事里代表了什么？",
      quizOptions: [
        { id: "a", label: "一家人日常生活里的陪伴", icon: "A" },
        { id: "b", label: "一台新电视", icon: "B" },
        { id: "c", label: "一份考试卷", icon: "C" },
      ],
      quizAnswer: "a",
      quizFeedback: "你理解了爷爷为什么觉得这段回忆珍贵：它陪着一家人走过日子。",
    };
  }

  return {
    coreObject: "老照片",
    correctObjects: [
      { id: "album", label: "相册", icon: "📒" },
      { id: "frame", label: "相框", icon: "🖼️" },
      { id: "home", label: "老屋", icon: "🏠" },
    ],
    distractors: [
      { id: "robot", label: "机器人", icon: "🤖", isDistractor: true },
      { id: "burger", label: "汉堡", icon: "🍔", isDistractor: true },
      { id: "spaceship", label: "飞船", icon: "🛸", isDistractor: true },
    ],
    classifyItems: [
      { id: "album", label: "相册", icon: "📒", correctCategory: "老物件" },
      { id: "frame", label: "相框", icon: "🖼️", correctCategory: "老物件" },
      { id: "home", label: "老屋", icon: "🏠", correctCategory: "地点" },
      { id: "family", label: "家人", icon: "👨‍👩‍👧", correctCategory: "人物" },
    ],
    sequence: [
      { id: "s1", label: "翻开相册", icon: "1", order: 1 },
      { id: "s2", label: "看见老照片", icon: "2", order: 2 },
      { id: "s3", label: "想起老屋里的笑声", icon: "3", order: 3 },
      { id: "s4", label: "把故事讲给孩子听", icon: "4", order: 4 },
    ],
    assembleZones: [
      { id: "photo", label: "照片", hint: "照片放在相框正中间。" },
      { id: "frame", label: "相框", hint: "相框包在照片外面。" },
      { id: "corner", label: "护角", hint: "护角在相框四周。" },
      { id: "stand", label: "支架", hint: "支架在相框背后。" },
    ],
    assembleItems: [
      { id: "part-photo", label: "老照片", icon: "🖼️", correctZoneId: "photo" },
      { id: "part-frame", label: "木相框", icon: "▣", correctZoneId: "frame" },
      { id: "part-corner", label: "金属护角", icon: "⌜", correctZoneId: "corner" },
      { id: "part-stand", label: "背后支架", icon: "📐", correctZoneId: "stand" },
    ],
    quizQuestion: `为什么《${story.title}》值得被保存下来？`,
    quizOptions: [
      { id: "a", label: "因为它记录了家人的共同回忆", icon: "A" },
      { id: "b", label: "因为它没有任何故事", icon: "B" },
      { id: "c", label: "因为它只是一张空白纸", icon: "C" },
    ],
    quizAnswer: "a",
    quizFeedback: "你理解了爷爷为什么觉得这段回忆珍贵：它把家人和过去连在一起。",
  };
}

export function createTasksForStory(story: MemoryStory): ChildTask[] {
  const kit = getStoryKit(story);
  const storySeed = story.id;
  const familyId = story.familyId ?? DEFAULT_FAMILY_ID;

  const observeItems = [...kit.correctObjects, ...kit.distractors].map(withTaskPhoto);
  const observeCorrect = kit.correctObjects.map((item) => item.id);

  const classifyItems = kit.classifyItems.map((item) => ({
    ...withTaskPhoto(item),
    id: `${storySeed}-classify-${item.id}`,
  }));
  const classifyCorrect = Object.fromEntries(
    classifyItems.map((item) => [item.id, item.correctCategory ?? "老物件"])
  );

  const sequenceItems = kit.sequence.map((item) => ({
    ...item,
    id: `${storySeed}-sequence-${item.id}`,
  }));
  const sequenceCorrect = [...sequenceItems]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((item) => item.id);

  const assembleItems = kit.assembleItems.map((item) => ({
    ...withTaskPhoto(item),
    id: `${storySeed}-assemble-${item.id}`,
  }));
  const assembleCorrect = Object.fromEntries(
    assembleItems.map((item) => [item.id, item.correctZoneId ?? "body"])
  );

  return [
    {
      id: `${story.id}-task-101`,
      familyId,
      memoryStoryId: story.id,
      level: 101,
      title: "找出故事里的关键物件",
      type: "observe",
      instruction: "点选爷爷故事里出现过的 3 个物件。",
      abilityGoal: "观察力训练",
      items: observeItems,
      correctAnswer: observeCorrect,
      status: "active",
      stars: 0,
    },
    {
      id: `${story.id}-task-102`,
      familyId,
      memoryStoryId: story.id,
      level: 102,
      title: "把物件放进正确篮子",
      type: "classify",
      instruction: "把每个物件拖到它所属的类别里。",
      abilityGoal: "分类能力训练",
      items: classifyItems,
      correctAnswer: classifyCorrect,
      status: "locked",
      stars: 0,
    },
    {
      id: `${story.id}-task-103`,
      familyId,
      memoryStoryId: story.id,
      level: 103,
      title: "排出故事发生的顺序",
      type: "sequence",
      instruction: "把故事片段按先后顺序排好。",
      abilityGoal: "顺序推理训练",
      items: sequenceItems,
      correctAnswer: sequenceCorrect,
      status: "locked",
      stars: 0,
    },
    {
      id: `${story.id}-task-104`,
      familyId,
      memoryStoryId: story.id,
      level: 104,
      title: `装配${kit.coreObject}`,
      type: "assemble",
      instruction: "把部件放到正确位置，完成一个小小装配。",
      abilityGoal: "空间关系训练",
      items: assembleItems,
      correctAnswer: assembleCorrect,
      status: "locked",
      stars: 0,
      feedback: JSON.stringify(kit.assembleZones),
    },
    {
      id: `${story.id}-task-105`,
      familyId,
      memoryStoryId: story.id,
      level: 105,
      title: "想一想为什么珍贵",
      type: "quiz",
      instruction: kit.quizQuestion,
      abilityGoal: "理解与因果推理训练",
      items: kit.quizOptions,
      correctAnswer: kit.quizAnswer,
      status: "locked",
      stars: 0,
      feedback: kit.quizFeedback,
    },
    {
      id: `${story.id}-task-106`,
      familyId,
      memoryStoryId: story.id,
      level: 106,
      title: "给爷爷一句温暖回应",
      type: "emotion",
      instruction: "选一句话送给爷爷，也可以再送一朵小红花。",
      abilityGoal: "共情表达训练",
      items: [
        { id: `${storySeed}-emotion-1`, label: "爷爷，我想听你再讲一次。", icon: "💬" },
        { id: `${storySeed}-emotion-2`, label: "这个故事真温暖。", icon: "💬" },
        { id: `${storySeed}-emotion-3`, label: "下次我想和你一起找老照片。", icon: "💬" },
      ],
      correctAnswer: "any",
      status: "locked",
      stars: 0,
    },
  ];
}

export function createMemoryStory(draft: StoryDraft): MemoryStory {
  const now = new Date().toISOString();
  const keywords = extractKeywords(`${draft.title}${draft.fullText}${draft.asrText ?? ""}`);
  return {
    id: createId("story"),
    familyId: draft.familyId ?? DEFAULT_FAMILY_ID,
    title: draft.title.trim(),
    fullText: draft.fullText.trim(),
    summary: summarizeText(draft.fullText),
    yearTag: draft.yearTag,
    source: draft.source,
    imageUrl: draft.imageUrl,
    imageName: draft.imageName,
    imageStorageKey: draft.imageStorageKey,
    audioUrl: draft.audioUrl,
    audioDuration: draft.audioDuration,
    audioStorageKey: draft.audioStorageKey,
    audioBlobId: draft.audioBlobId ?? draft.audioStorageKey,
    asrText: draft.asrText ?? "",
    createdAt: now,
    updatedAt: now,
    likes: 0,
    safetyStatus: "safe",
    childTaskIds: [],
    interactionEventIds: [],
    keywords,
  };
}

export function detectRisk(content: string, riskWords: RiskWord[]): {
  riskLevel: RiskLevel;
  action: SafetyAction;
  matchedWord?: string;
} {
  const matched = riskWords.find((word) => content.includes(word.keyword));
  if (matched) {
    return {
      riskLevel: "high",
      action: "blocked",
      matchedWord: matched.isDefault ? matched.label : matched.keyword,
    };
  }
  if (content.trim().length < 20) {
    return { riskLevel: "medium", action: "pending_review" };
  }
  return { riskLevel: "low", action: "passed" };
}

export function createSafetyLog(params: {
  familyId?: string;
  sourceType: SafetySourceType;
  content: string;
  storyId?: string;
  interactionId?: string;
  riskWords: RiskWord[];
}): SafetyLog {
  const risk = detectRisk(params.content, params.riskWords);
  return {
    id: createId("safety"),
    familyId: params.familyId ?? DEFAULT_FAMILY_ID,
    sourceType: params.sourceType,
    content: params.content,
    storyId: params.storyId,
    interactionId: params.interactionId,
    riskLevel: risk.riskLevel,
    action: risk.action,
    matchedWord: risk.matchedWord,
    createdAt: new Date().toISOString(),
  };
}

export function createInteraction(params: {
  familyId?: string;
  type: InteractionEvent["type"];
  fromRole: InteractionEvent["fromRole"];
  toRole?: InteractionEvent["toRole"];
  storyId?: string;
  parentEventId?: string;
  content: string;
  transcript?: string;
  audioUrl?: string;
  audioStorageKey?: string;
  audioDuration?: number;
  readByElder?: boolean;
  readByChild?: boolean;
}): InteractionEvent {
  return {
    id: createId("event"),
    familyId: params.familyId ?? DEFAULT_FAMILY_ID,
    type: params.type,
    fromRole: params.fromRole,
    toRole: params.toRole,
    storyId: params.storyId,
    parentEventId: params.parentEventId,
    content: params.content,
    transcript: params.transcript,
    audioUrl: params.audioUrl,
    audioStorageKey: params.audioStorageKey,
    audioDuration: params.audioDuration,
    createdAt: new Date().toISOString(),
    isRead: false,
    readByElder: params.readByElder,
    readByChild: params.readByChild,
  };
}

export function getTaskProgress(story: MemoryStory, tasks: ChildTask[]): {
  total: number;
  completed: number;
  stars: number;
} {
  const linked = tasks.filter((task) => story.childTaskIds.includes(task.id));
  return {
    total: linked.length,
    completed: linked.filter((task) => task.status === "completed").length,
    stars: linked.reduce((sum, task) => sum + task.stars, 0),
  };
}

export function taskTypeFeedback(task: ChildTask, userAnswer: ChildTask["userAnswer"]): string {
  if (task.type === "observe" && Array.isArray(userAnswer)) {
    const labels = task.items
      .filter((item) => userAnswer.includes(item.id))
      .map((item) => item.label)
      .join("、");
    return `你找到了爷爷故事里的${labels}。`;
  }
  if (task.type === "classify" && userAnswer && typeof userAnswer === "object" && !Array.isArray(userAnswer)) {
    const pairs = Object.entries(userAnswer)
      .map(([itemId, category]) => {
        const item = task.items.find((entry) => entry.id === itemId);
        return item ? `${item.label}放进了${category}` : "";
      })
      .filter(Boolean)
      .join("，");
    return `你把${pairs}。`;
  }
  if (task.type === "sequence" && Array.isArray(userAnswer)) {
    const labels = userAnswer
      .map((id) => task.items.find((item) => item.id === id)?.label)
      .filter(Boolean)
      .join("，");
    return `你排对了故事顺序：${labels}。`;
  }
  if (task.type === "assemble") {
    const partNames = task.items.map((item) => item.label).join("、");
    return `你把${partNames}放到了正确位置，故事里的物件可以开始工作了。`;
  }
  if (task.type === "quiz") {
    return task.feedback ?? "你理解了爷爷为什么觉得这段回忆珍贵。";
  }
  if (task.type === "emotion") {
    return "你的回应已经送给爷爷，他会在长辈端看到。";
  }
  return "你完成了这一关。";
}

export function sourceText(source: MemoryStory["source"]): string {
  if (source === "voice") return "语音采录";
  if (source === "photo") return "照片上传";
  return "手动输入";
}

export function taskTypeName(type: TaskType): string {
  const map: Record<TaskType, string> = {
    observe: "观察识别",
    classify: "分类匹配",
    sequence: "顺序排列",
    assemble: "场景装配",
    quiz: "问答推理",
    emotion: "情感回应",
  };
  return map[type];
}
