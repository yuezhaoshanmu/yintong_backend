import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import "dotenv/config";
import { imageManifest } from "./imageManifest.mjs";

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const ENDPOINT = process.env.OPENAI_IMAGE_ENDPOINT || "https://api.openai.com/v1/images/generations";

async function generateOne(item) {
  if (!API_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const prompt = [
    `Use case: photorealistic-natural`,
    `Asset usage: ${item.usage}`,
    `Primary request: ${item.prompt}`,
    "Style: realistic documentary photography, Chinese family life, natural light, lived-in details.",
    "Avoid: AI illustration look, western faces, commercial poster lighting, over-retouched skin, text, watermark, logo.",
  ].join("\n");

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      size: item.size,
      n: 1,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${message}`);
  }

  const json = await response.json();
  const b64 = json.data?.[0]?.b64_json;
  const url = json.data?.[0]?.url;
  let bytes;
  if (b64) {
    bytes = Buffer.from(b64, "base64");
  } else if (url) {
    const imageResponse = await fetch(url);
    if (!imageResponse.ok) throw new Error(`image download failed: ${imageResponse.status}`);
    bytes = Buffer.from(await imageResponse.arrayBuffer());
  } else {
    throw new Error("No image payload returned");
  }

  await mkdir(dirname(item.filePath), { recursive: true });
  await writeFile(item.filePath, bytes);
  return item.filePath;
}

const results = [];
for (const item of imageManifest) {
  try {
    const filePath = await generateOne(item);
    results.push({ id: item.id, filePath, status: "ok" });
    console.log(`ok ${item.id} -> ${filePath}`);
  } catch (error) {
    results.push({ id: item.id, filePath: item.filePath, status: "failed", error: error.message });
    console.error(`failed ${item.id}: ${error.message}`);
  }
}

console.log("\nImage generation summary:");
console.log(JSON.stringify({ model: MODEL, results }, null, 2));
