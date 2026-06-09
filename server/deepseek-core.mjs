const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";

export function deepseekConfig(env = process.env) {
  return {
    apiKey: env.DEEPSEEK_API_KEY,
    baseUrl: env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL,
    model: env.DEEPSEEK_MODEL || DEFAULT_MODEL,
  };
}

export function systemPromptForRole(role = "elder", currentStory, currentTask) {
  const storyContext = currentStory
    ? `当前故事：《${currentStory.title || "未命名故事"}》。摘要：${currentStory.summary || "暂无摘要"}。正文：${String(
        currentStory.fullText || ""
      ).slice(0, 600)}`
    : "当前没有选中的故事。";
  const taskContext = currentTask
    ? `当前儿童任务：${currentTask.title || "未命名任务"}。任务说明：${currentTask.instruction || "暂无说明"}。请只给提示，不要直接给孩子答案。`
    : "";

  if (role === "child") {
    return [
      "你是“银童共育”的儿童端故事小伙伴。你正在陪一个中国小朋友理解爷爷奶奶讲的故事。",
      "回答要短、亲切、鼓励式，适合 6-8 岁孩子听懂。",
      "你可以给提示，但不能直接替孩子完成任务。遇到识别物品、排序、分类任务时，用引导和提问帮助孩子思考。",
      "不要讨论不适合儿童的话题，不要索要隐私信息，不要鼓励危险行为。",
      storyContext,
      taskContext,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "你是“银童共育”的长辈端 AI 陪伴小助手。你正在陪一位中国家庭中的爷爷或奶奶聊天。",
    "目标是帮助长辈把生活回忆整理成孩子能听懂的小故事，也可以温和地陪伴聊天。",
    "回答必须简短、温暖、口语化，避免技术术语。",
    "不要询问身份证、银行卡、验证码等隐私。涉及医疗、法律、金钱时提醒联系家属或专业人员。",
    "整理故事时请保留长辈原话的生活味道，不要写得像广告文案。保存或发送前必须建议用户确认。",
    storyContext,
  ].join("\n");
}

export function normalizeMessages(body) {
  if (Array.isArray(body?.messages) && body.messages.length) {
    return body.messages
      .filter((message) => message && typeof message.content === "string" && message.content.trim())
      .map((message) => ({
        role: ["system", "user", "assistant"].includes(message.role) ? message.role : "user",
        content: message.content.trim(),
      }));
  }

  const history = Array.isArray(body?.history) ? body.history : [];
  const messages = history
    .filter((message) => message && typeof message.content === "string" && message.content.trim())
    .map((message) => ({
      role: ["system", "user", "assistant"].includes(message.role) ? message.role : "user",
      content: message.content.trim(),
    }));
  if (typeof body?.userMessage === "string" && body.userMessage.trim()) {
    messages.push({ role: "user", content: body.userMessage.trim() });
  }
  return messages;
}

export function deepseekHealthPayload(env = process.env) {
  const { apiKey, baseUrl, model } = deepseekConfig(env);
  if (!apiKey) {
    return {
      ok: false,
      hasKey: false,
      baseUrl,
      model,
      message: "DEEPSEEK_API_KEY 未配置",
    };
  }
  return {
    ok: true,
    hasKey: true,
    baseUrl,
    model,
  };
}

function logDeepSeekError(label, details) {
  console.error(label, {
    status: details.status,
    error: details.errorMessage,
    baseUrl: details.baseUrl,
    model: details.model,
    hasKey: Boolean(details.hasKey),
  });
}

export async function createDeepSeekChatResponse(body, env = process.env) {
  const { apiKey, baseUrl, model } = deepseekConfig(env);
  if (!apiKey) {
    logDeepSeekError("DeepSeek config missing", {
      status: 503,
      errorMessage: "DEEPSEEK_API_KEY 未配置",
      baseUrl,
      model,
      hasKey: false,
    });
    return {
      status: 503,
      body: {
        ok: false,
        message: "AI 服务未配置，已切换为演示回复。",
        provider: "fallback",
      },
    };
  }

  const role = body?.role === "child" ? "child" : "elder";
  const messages = normalizeMessages(body);
  if (!messages.length) {
    return {
      status: 400,
      body: {
        ok: false,
        message: "请先输入要发送给 AI 的内容。",
        provider: "fallback",
      },
    };
  }

  const prompt = body?.systemPrompt || systemPromptForRole(role, body?.currentStory, body?.currentTask);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: prompt }, ...messages],
        temperature: 0.6,
        stream: false,
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMessage = data?.error?.message || data?.message || "DeepSeek request failed";
      logDeepSeekError("DeepSeek API error", {
        status: response.status,
        errorMessage,
        baseUrl,
        model,
        hasKey: true,
      });
      return {
        status: response.status >= 500 ? 502 : response.status,
        body: {
          ok: false,
          message: "AI 服务连接失败，已切换为演示回复。",
          provider: "fallback",
        },
      };
    }

    const content = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!content) {
      logDeepSeekError("DeepSeek empty response", {
        status: 502,
        errorMessage: "empty content",
        baseUrl,
        model,
        hasKey: true,
      });
      return {
        status: 502,
        body: {
          ok: false,
          message: "AI 暂时没有返回内容，已切换为演示回复。",
          provider: "fallback",
        },
      };
    }

    return {
      status: 200,
      body: {
        ok: true,
        provider: "deepseek",
        model,
        content,
      },
    };
  } catch (error) {
    const isAbort = error?.name === "AbortError";
    logDeepSeekError("DeepSeek proxy error", {
      status: isAbort ? 504 : 502,
      errorMessage: isAbort ? "request timeout" : error?.message || "unknown error",
      baseUrl,
      model,
      hasKey: true,
    });
    return {
      status: isAbort ? 504 : 502,
      body: {
        ok: false,
        message: isAbort ? "AI 响应超时，请稍后再试。" : "AI 服务连接失败，已切换为演示回复。",
        provider: "fallback",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body !== "function") {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    return req.body;
  }

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function sendJson(res, status, payload) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    return res.status(status).json(payload);
  }
  res.statusCode = status;
  res.setHeader?.("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export async function handleDeepSeekChat(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, {
      ok: false,
      message: "只允许 POST 请求。",
      provider: "fallback",
    });
  }
  const body = await readJsonBody(req);
  const result = await createDeepSeekChatResponse(body);
  return sendJson(res, result.status, result.body);
}

export function handleDeepSeekHealth(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, {
      ok: false,
      hasKey: false,
      message: "只允许 GET 请求。",
    });
  }
  return sendJson(res, 200, deepseekHealthPayload());
}

export function handleUnconfiguredTts(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, {
      ok: false,
      message: "只允许 POST 请求。",
    });
  }
  return sendJson(res, 501, {
    ok: false,
    message: "云端语音服务未配置，已使用浏览器朗读。",
    provider: "browser",
  });
}
