import { copyFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const SOURCE_DIR = join(ROOT, "image2");
const MAP_PATH = join(ROOT, "scripts", "image2-map.json");
const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

async function listImages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listImages(fullPath)));
    } else if (SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function fileNameOf(filePath) {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function inferByFilename(key, entry, imageFiles) {
  const keywords = [key, ...(entry.keywords ?? [])]
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);

  return imageFiles.find((filePath) => {
    const name = fileNameOf(filePath).toLowerCase();
    return keywords.some((keyword) => name.includes(keyword) || name.includes(keyword.replace(/\s+/g, "-")));
  });
}

function quotePowerShellPath(value) {
  return value.replace(/'/g, "''");
}

function convertToJpegWithPowerShell(sourcePath, targetPath) {
  const script = [
    "Add-Type -AssemblyName System.Drawing",
    `$src='${quotePowerShellPath(sourcePath)}'`,
    `$dst='${quotePowerShellPath(targetPath)}'`,
    "$img=[System.Drawing.Image]::FromFile($src)",
    "try { $img.Save($dst,[System.Drawing.Imaging.ImageFormat]::Jpeg) } finally { $img.Dispose() }",
  ].join("; ");

  const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "PowerShell image conversion failed").trim());
  }
}

async function copyOrConvert(sourcePath, targetPath) {
  await mkdir(dirname(targetPath), { recursive: true });
  const sourceExt = extname(sourcePath).toLowerCase();
  const targetExt = extname(targetPath).toLowerCase();
  if ((targetExt === ".jpg" || targetExt === ".jpeg") && sourceExt !== ".jpg" && sourceExt !== ".jpeg") {
    convertToJpegWithPowerShell(sourcePath, targetPath);
    return "converted";
  }
  await copyFile(sourcePath, targetPath);
  return "copied";
}

const map = JSON.parse(await readFile(MAP_PATH, "utf8"));
const mapEntries = Object.entries(map);
const imageFiles = await listImages(SOURCE_DIR);
const imageByName = new Map(imageFiles.map((file) => [fileNameOf(file), file]));
const usedSources = new Set();
const organized = [];
const needsReview = [];

for (const [key, entry] of mapEntries) {
  let sourcePath = entry.source ? imageByName.get(entry.source) : undefined;
  if (!sourcePath) {
    sourcePath = inferByFilename(key, entry, imageFiles);
  }

  if (!sourcePath) {
    needsReview.push({ usage: entry.usage ?? key, reason: "需要人工确认：未找到对应源图片" });
    continue;
  }

  const targetPath = join(ROOT, entry.target);
  const action = await copyOrConvert(sourcePath, targetPath);
  usedSources.add(sourcePath);
  organized.push({
    source: relative(ROOT, sourcePath).replaceAll("\\", "/"),
    target: relative(ROOT, targetPath).replaceAll("\\", "/"),
    usage: entry.usage ?? key,
    action,
  });
}

for (const sourcePath of imageFiles) {
  if (usedSources.has(sourcePath)) continue;
  const fileInfo = await stat(sourcePath);
  needsReview.push({
    source: relative(ROOT, sourcePath).replaceAll("\\", "/"),
    size: fileInfo.size,
    reason: "需要人工确认：未在 image2-map.json 中使用",
  });
}

console.log(`扫描 image2 图片 ${imageFiles.length} 张。`);
console.log("已整理图片：");
for (const item of organized) {
  console.log(`${item.source} -> ${item.target} ｜ ${item.usage} ｜ ${item.action}`);
}

if (needsReview.length) {
  console.log("\n需要人工确认的图片或用途：");
  for (const item of needsReview) {
    if (item.source) {
      console.log(`${item.source} ｜ ${item.size} bytes ｜ ${item.reason}`);
    } else {
      console.log(`${item.usage} ｜ ${item.reason}`);
    }
  }
}
