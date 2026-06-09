import { imageAssets } from "./data/imageAssets";
import { DEFAULT_FAMILY_ID, FamilyMember, MemoryStory, RiskWord } from "./types";

export const BRAND_IMAGES = {
  cooperativeStore: imageAssets.stories.candyJar,
  radio: imageAssets.stories.oldRadio,
  bicycle: imageAssets.stories.oldBicycle,
  familyAlbum: imageAssets.stories.familyAlbum,
  livingRoom: imageAssets.stories.familyAlbum,
  dinnerTable: imageAssets.stories.oldRadio,
  voiceRecording: imageAssets.stories.familyAlbum,
  grandfatherAvatar: imageAssets.avatars.grandpa,
  grandmotherAvatar: imageAssets.avatars.grandma,
  daughterAvatar: imageAssets.avatars.father,
  childAvatar: imageAssets.avatars.childGirl,
  communityWorkerAvatar: imageAssets.avatars.communityWorker,
  avatarPlaceholder: imageAssets.placeholders.avatar,
  flower: imageAssets.child.sendingFlower,
  placeholder: imageAssets.placeholders.story,
};

export const PHOTO_TEMPLATES = [
  {
    id: "tpl-radio",
    title: "老式收音机",
    yearTag: "1978 年前后",
    imageUrl: imageAssets.stories.oldRadio,
    prompt: "那时候家里有一台老式收音机。晚饭后，大家围在桌边听广播，风扇慢慢转着，屋里很安静。",
  },
  {
    id: "tpl-candy",
    title: "玻璃罐里的糖",
    yearTag: "1975 年前后",
    imageUrl: imageAssets.stories.candyJar,
    prompt: "小时候路过供销社，最惦记玻璃罐里的糖。大人买东西时，我就站在旁边多看几眼。",
  },
  {
    id: "tpl-bike",
    title: "巷子里的自行车",
    yearTag: "1985 年前后",
    imageUrl: imageAssets.stories.oldBicycle,
    prompt: "那辆旧自行车陪着一家人穿过巷口。车铃一响，邻居就知道有人回来了。",
  },
  {
    id: "tpl-photo",
    title: "相册里的老照片",
    yearTag: "1990 年前后",
    imageUrl: imageAssets.stories.familyAlbum,
    prompt: "相册里夹着几张泛黄的照片，一翻开，就想起老屋里的笑声和饭桌旁的人。",
  },
];

const createdAtA = new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString();
const createdAtB = new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString();

export const DEFAULT_STORIES: MemoryStory[] = [
  {
    id: "story-radio-1978",
    familyId: DEFAULT_FAMILY_ID,
    title: "晚饭后的老式收音机",
    fullText:
      "那时候家里有一台老式收音机，外壳是深棕色的，天线拉起来会发出轻轻的响声。晚上吃完饭，大家围在桌边听广播，风扇慢慢转着，窗外有虫鸣声。广播里一放音乐，屋子里就安静下来，可心里又觉得特别热闹。我到现在还记得那种一家人坐在一起的踏实感。",
    asrText: "",
    summary: "晚饭后，一家人围着老式收音机听广播，安静又热闹。",
    yearTag: "1978 年前后",
    source: "manual",
    imageUrl: imageAssets.stories.oldRadio,
    imageName: "爷爷讲到的老收音机",
    createdAt: createdAtA,
    updatedAt: createdAtA,
    likes: 4,
    safetyStatus: "safe",
    childTaskIds: [],
    interactionEventIds: [],
    keywords: ["收音机", "天线", "风扇"],
  },
  {
    id: "story-candy-1975",
    familyId: DEFAULT_FAMILY_ID,
    title: "玻璃柜里的白兔糖",
    fullText:
      "小时候去供销社，最喜欢看玻璃柜台里的白兔糖。糖纸白白的，包得很紧，打开以后有一股奶香味。那时候一小颗糖要慢慢含着，舍不得一下子吃完。大人们买东西时，我就站在旁边盯着玻璃罐，觉得那是童年里最亮、最甜的一角。",
    asrText: "",
    summary: "玻璃柜里的白兔糖，是童年里最甜的一角。",
    yearTag: "1975 年前后",
    source: "manual",
    imageUrl: imageAssets.stories.candyJar,
    imageName: "供销社糖罐照片",
    createdAt: createdAtB,
    updatedAt: createdAtB,
    likes: 3,
    safetyStatus: "safe",
    childTaskIds: [],
    interactionEventIds: [],
    keywords: ["白兔糖", "供销社", "玻璃罐"],
  },
];

export const DEFAULT_FAMILY_MEMBERS: FamilyMember[] = [
  {
    id: "family-elder",
    familyId: DEFAULT_FAMILY_ID,
    name: "王爷爷",
    role: "elder",
    avatar: imageAssets.avatars.grandpa,
    bindStatus: "已绑定",
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  {
    id: "family-child",
    familyId: DEFAULT_FAMILY_ID,
    name: "萌萌",
    role: "child",
    avatar: imageAssets.avatars.childGirl,
    bindStatus: "已绑定",
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
  },
  {
    id: "family-guardian",
    familyId: DEFAULT_FAMILY_ID,
    name: "王女士",
    role: "guardian",
    avatar: imageAssets.avatars.father,
    bindStatus: "已绑定",
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: "family-grandma",
    familyId: DEFAULT_FAMILY_ID,
    name: "李奶奶",
    role: "grandparent",
    avatar: imageAssets.avatars.grandma,
    bindStatus: "已绑定",
    lastActiveAt: new Date(Date.now() - 1000 * 60 * 80).toISOString(),
  },
];

export const DEFAULT_RISK_WORDS: RiskWord[] = [
  {
    id: "risk-default-a",
    keyword: "高风险词A",
    label: "不适合儿童直接接触的危险表达",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    isDefault: true,
  },
  {
    id: "risk-default-b",
    keyword: "高风险词B",
    label: "需要家属确认的医疗相关表达",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    isDefault: true,
  },
];
