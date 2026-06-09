import { handleDeepSeekChat } from "../../server/deepseek-core.mjs";

export default async function handler(req, res) {
  return handleDeepSeekChat(req, res);
}
