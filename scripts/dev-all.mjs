import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(name, args) {
  const child = spawn(npmCommand, args, {
    stdio: "inherit",
    shell: false,
  });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}`);
    }
  });
  return child;
}

const ai = run("ai", ["run", "ai"]);
const dev = run("dev", ["run", "dev"]);

function stopAll() {
  ai.kill();
  dev.kill();
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});
