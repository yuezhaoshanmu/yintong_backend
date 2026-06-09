import { handleDeepSeekHealth } from "../../server/deepseek-core.mjs";

export default function handler(req, res) {
  return handleDeepSeekHealth(req, res);
}
