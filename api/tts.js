import { handleUnconfiguredTts } from "../server/deepseek-core.mjs";

export default function handler(req, res) {
  return handleUnconfiguredTts(req, res);
}
