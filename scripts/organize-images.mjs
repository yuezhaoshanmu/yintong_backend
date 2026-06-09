import { copyFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { extname, dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const SOURCE_DIR = join(ROOT, "images");
const MAP_PATH = join(ROOT, "scripts", "image-map.json");
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
  return files;
}

function inferByFilename(fileName) {
  const name = fileName.toLowerCase();
  const rules = [
    [/grandpa|爷爷|长者|老人|old.*man/, "public/image/avatar/grandpa-01.jpg", "avatar", "爷爷头像"],
    [/grandma|奶奶|old.*woman/, "public/image/avatar/grandma-01.jpg", "avatar", "奶奶头像"],
    [/child|girl|萌萌|儿童|小女孩/, "public/image/avatar/child-girl-01.jpg", "avatar", "萌萌头像"],
    [/father|parent|家属|爸爸|女士/, "public/image/avatar/father-01.jpg", "avatar", "家属头像"],
    [/worker|community|社区|老师/, "public/image/avatar/community-worker-01.jpg", "avatar", "社区守护员头像"],
    [/radio|收音机|广播/, "public/image/story/old-radio-family-dinner.jpg", "story", "老式收音机故事封面"],
    [/album|photo|相册|照片/, "public/image/story/family-album-living-room.jpg", "story", "家庭相册故事封面"],
    [/bicycle|bike|自行车/, "public/image/story/old-bicycle-alley.jpg", "story", "老自行车故事封面"],
    [/sewing|缝纫机/, "public/image/story/sewing-machine-home.jpg", "story", "缝纫机故事封面"],
    [/candy|糖|糖果|罐/, "public/image/story/candy-glass-jar.jpg", "story", "糖果罐故事封面"],
  ];
  const match = rules.find(([pattern]) => pattern.test(name));
  if (!match) return undefined;
  return { target: match[1], category: match[2], usage: match[3] };
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
const imageFiles = await listImages(SOURCE_DIR);
const organized = [];
const needsReview = [];

for (const sourcePath of imageFiles) {
  const sourceName = relative(SOURCE_DIR, sourcePath).replaceAll("\\", "/");
  const entry = map[sourceName] ?? map[sourceName.split("/").pop()] ?? inferByFilename(sourceName);
  if (!entry) {
    const fileInfo = await stat(sourcePath);
    needsReview.push({ source: relative(ROOT, sourcePath).replaceAll("\\", "/"), size: fileInfo.size });
    continue;
  }

  const targets = entry.targets ?? [entry.target];
  for (const target of targets.filter(Boolean)) {
    const targetPath = join(ROOT, target);
    const action = await copyOrConvert(sourcePath, targetPath);
    organized.push({
      source: relative(ROOT, sourcePath).replaceAll("\\", "/"),
      target: relative(ROOT, targetPath).replaceAll("\\", "/"),
      category: entry.category,
      usage: entry.usage,
      action,
    });
  }
}

console.log(`扫描到图片 ${imageFiles.length} 张。`);
console.log("已整理图片：");
for (const item of organized) {
  console.log(`${item.source} -> ${item.target} ｜ ${item.category} ｜ ${item.usage} ｜ ${item.action}`);
}

if (needsReview.length) {
  console.log("\n需要人工确认用途的图片：");
  for (const item of needsReview) {
    console.log(`${item.source} ｜ ${item.size} bytes`);
  }
}
