/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_ASSISTANT_MODE?: "demo" | "deepseek";
  readonly VITE_AI_VOICE_MODE?: "browser" | "realtime";
  readonly VITE_DEEPSEEK_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
