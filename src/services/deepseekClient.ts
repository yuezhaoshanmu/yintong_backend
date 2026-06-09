import { ChildTask, MemoryStory } from "../types";
import type { AssistantRole } from "./aiAssistantService";

export type AiAssistantMode = "demo" | "deepseek";
export type DeepSeekRole = "system" | "user" | "assistant";

export type DeepSeekMessage = {
  role: DeepSeekRole;
  content: string;
};

export type DeepSeekChatRequest = {
  role: AssistantRole;
  messages: DeepSeekMessage[];
  currentStory?: Pick<MemoryStory, "title" | "summary" | "fullText">;
  currentTask?: Pick<ChildTask, "title" | "instruction">;
};

export type DeepSeekChatResult = {
  content: string;
  provider: "deepseek" | "fallback";
  usedFallback: boolean;
  model?: string;
  errorMessage?: string;
  proxyMissing?: boolean;
};

export type DeepSeekHealthResult = {
  ok: boolean;
  hasKey: boolean;
  baseUrl?: string;
  model?: string;
  message?: string;
  proxyMissing?: boolean;
};

const AI_MODE = (import.meta.env.VITE_AI_ASSISTANT_MODE ?? "demo") as AiAssistantMode;
const PROXY_URL = import.meta.env.VITE_DEEPSEEK_PROXY_URL ?? "/api/deepseek/chat";
const HEALTH_URL = PROXY_URL.replace(/\/chat(?:\?.*)?$/, "/health");

function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function normalizeMode(mode: string | undefined): AiAssistantMode {
  return mode === "deepseek" ? "deepseek" : "demo";
}

export function getAiAssistantMode(): AiAssistantMode {
  return normalizeMode(AI_MODE);
}

function userFacingError(error: unknown): Pick<DeepSeekChatResult, "errorMessage" | "proxyMissing"> {
  if (error instanceof DOMException && error.name === "AbortError") {
    return { errorMessage: "AI 响应超时，请稍后再试。" };
  }
  if (error instanceof TypeError) {
    return {
      errorMessage: "AI 代理服务未启动，可使用 vercel dev 或 npm run dev:all。",
      proxyMissing: true,
    };
  }
  return { errorMessage: "AI 服务连接失败，已切换为演示回复。" };
}

export async function checkDeepSeekHealth(): Promise<DeepSeekHealthResult> {
  if (getAiAssistantMode() !== "deepseek") {
    return {
      ok: false,
      hasKey: false,
      message: "演示回复中",
    };
  }

  try {
    const response = await fetch(HEALTH_URL, {
      method: "GET",
      signal: timeoutSignal(5000),
    });
    const data = (await response.json().catch(() => ({}))) as DeepSeekHealthResult;
    return {
      ok: Boolean(data.ok && response.ok),
      hasKey: Boolean(data.hasKey),
      baseUrl: data.baseUrl,
      model: data.model,
      message: data.message,
    };
  } catch (error) {
    const proxyMissing = error instanceof TypeError;
    return {
      ok: false,
      hasKey: false,
      proxyMissing,
      message: proxyMissing ? "AI 代理服务未启动，可使用 vercel dev 或 npm run dev:all。" : "AI 服务连接失败。",
    };
  }
}

export async function requestDeepSeekChat(request: DeepSeekChatRequest): Promise<DeepSeekChatResult> {
  if (getAiAssistantMode() !== "deepseek") {
    return {
      content: "",
      provider: "fallback",
      usedFallback: true,
      errorMessage: "演示回复中",
    };
  }

  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: timeoutSignal(22000),
    });
    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      content?: string;
      message?: string;
      provider?: "deepseek" | "fallback";
      model?: string;
    };
    if (!response.ok || !data.ok || data.provider !== "deepseek") {
      return {
        content: "",
        provider: "fallback",
        usedFallback: true,
        errorMessage: data.message || "AI 服务连接失败，已切换为演示回复。",
      };
    }
    return {
      content: data.content ?? "",
      provider: "deepseek",
      usedFallback: false,
      model: data.model,
    };
  } catch (error) {
    const fallback = userFacingError(error);
    return {
      content: "",
      provider: "fallback",
      usedFallback: true,
      ...fallback,
    };
  }
}
