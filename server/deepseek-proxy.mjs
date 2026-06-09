import dotenv from "dotenv";
import express from "express";
import {
  deepseekConfig,
  handleDeepSeekChat,
  handleDeepSeekHealth,
  handleUnconfiguredTts,
  sendJson,
} from "./deepseek-core.mjs";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(express.json({ limit: "1mb" }));

app.get("/api/deepseek/health", handleDeepSeekHealth);
app.post("/api/deepseek/chat", handleDeepSeekChat);
app.all("/api/deepseek/health", handleDeepSeekHealth);
app.all("/api/deepseek/chat", handleDeepSeekChat);

app.post("/api/tts", handleUnconfiguredTts);
app.all("/api/tts", handleUnconfiguredTts);

app.post("/api/voice/session", (req, res) => handleUnconfiguredTts(req, res));
app.post("/api/voice/asr", (_req, res) =>
  sendJson(res, 501, { ok: false, message: "实时语音识别服务未配置。", provider: "browser" })
);
app.post("/api/voice/tts", handleUnconfiguredTts);

app.listen(port, () => {
  const { apiKey, model } = deepseekConfig();
  console.log(`DeepSeek proxy running on http://localhost:${port}`);
  console.log(`hasKey: ${Boolean(apiKey)}`);
  console.log(`model: ${model}`);
});
