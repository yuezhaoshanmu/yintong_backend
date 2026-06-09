import { AppUser } from "../auth";
import { AiProvider, ChildTask, MemoryStory } from "../types";
import { DeepSeekMessage, getAiAssistantMode, requestDeepSeekChat } from "./deepseekClient";

export type AssistantRole = "elder" | "child";

export type AssistantReply = {
  content: string;
  provider: AiProvider;
  usedFallback: boolean;
  notice?: string;
};

const elderSystemPrompt =
  "你是“银童共育”的长辈端 AI 陪伴小助手。你正在陪一位中国家庭中的爷爷或奶奶聊天。目标是帮助长辈把生活回忆整理成孩子能听懂的小故事，也可以温和地陪伴聊天。回答必须简短、温暖、口语化，避免技术术语。不要询问身份证、银行卡、验证码等隐私。涉及医疗、法律、金钱时提醒联系家属或专业人员。整理故事时保留长辈原话的生活味道，不要写得像广告文案。保存或发送前必须建议用户确认。";

const childSystemPrompt =
  "你是“银童共育”的儿童端故事小伙伴。你正在陪一个中国小朋友理解爷爷奶奶讲的故事。回答要短、亲切、鼓励式，适合 6-8 岁孩子听懂。你可以给提示，但不能直接替孩子完成任务。遇到识别物品、排序、分类任务时，用“再想想”“爷爷刚才提到了什么”这类方式引导。不要讨论不适合儿童的话题，不要索要隐私信息，不要鼓励危险行为。";

export function systemPromptForRole(role: AssistantRole): string {
  return role === "elder" ? elderSystemPrompt : childSystemPrompt;
}

function demoReply(role: AssistantRole, userMessage: string): string {
  const text = userMessage.trim();
  if (role === "elder") {
    if (text.includes("标题")) {
      return "可以叫《那颗舍不得吃的糖》。这个标题简单，也有小时候的味道。";
    }
    if (text.includes("回复") || text.includes("孩子")) {
      return "可以这样回孩子：爷爷收到啦，听见你喜欢这个故事，我心里很暖。下次再给你讲一段。";
    }
    if (text.includes("整理") || text.includes("回忆")) {
      return "我先帮您记下来。您可以再多说一点，比如那时候在哪里、和谁在一起、最难忘的是什么。保存前我们再一起确认。";
    }
    return "我在呢。您慢慢说，我会帮您把这些话整理成孩子听得懂的小故事。";
  }

  if (text.includes("提示") || text.includes("为什么")) {
    return "我们先一起想想：爷爷刚才故事里提到的东西，是不是和这张照片有关系？";
  }
  if (text.includes("再讲") || text.includes("故事")) {
    return "爷爷讲的是小时候的小甜味。你可以先找找故事里出现过的东西，再看看哪些是现在才有的东西。";
  }
  if (text.includes("说句话")) {
    return "可以说：爷爷，我喜欢听你的故事，下次还想听你讲小时候的事情。";
  }
  return "我陪你一起想。先看看爷爷刚才提到了什么，再点你觉得像故事里的物品。";
}

export async function askAiAssistant(params: {
  role: AssistantRole;
  currentUser: AppUser;
  userMessage: string;
  history: DeepSeekMessage[];
  currentStory?: MemoryStory;
  currentTask?: ChildTask;
}): Promise<AssistantReply> {
  const result = await requestDeepSeekChat({
    role: params.role,
    messages: [
      ...params.history.filter((message) => message.role === "user" || message.role === "assistant"),
      { role: "user", content: params.userMessage },
    ],
    currentStory: params.currentStory
      ? {
          title: params.currentStory.title,
          summary: params.currentStory.summary,
          fullText: params.currentStory.fullText,
        }
      : undefined,
    currentTask: params.currentTask
      ? {
          title: params.currentTask.title,
          instruction: params.currentTask.instruction,
        }
      : undefined,
  });

  if (!result.usedFallback && result.content.trim()) {
    return {
      content: result.content.trim(),
      provider: "deepseek",
      usedFallback: false,
    };
  }

  const mode = getAiAssistantMode();
  return {
    content: demoReply(params.role, params.userMessage),
    provider: "fallback",
    usedFallback: true,
    notice: mode === "deepseek" ? result.errorMessage || "AI 服务连接失败，已切换为演示回复。" : undefined,
  };
}
