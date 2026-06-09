export type VoiceInputState =
  | "idle"
  | "permission_requesting"
  | "listening"
  | "recognizing"
  | "recognized"
  | "thinking"
  | "speaking"
  | "error";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultLike[];
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type StartSpeechRecognitionOptions = {
  lang?: string;
  continuous?: boolean;
  onStart?: () => void;
  onResult?: (text: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
};

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition;
}

function speechErrorMessage(error?: string): string {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "无法使用麦克风，请在浏览器权限中允许麦克风，或改用文字输入。";
  }
  if (error === "audio-capture") {
    return "没有找到可用麦克风，请检查设备后重试。";
  }
  if (error === "no-speech") {
    return "没有听清楚，可以再说一遍。";
  }
  if (error === "network") {
    return "语音识别网络暂时不可用，请稍后重试或改用文字输入。";
  }
  return "语音识别暂时不可用，请改用文字输入。";
}

export function isSpeechRecognitionSupported(): boolean {
  return Boolean(getSpeechRecognitionCtor());
}

export function startSpeechRecognition(options: StartSpeechRecognitionOptions): { stop: () => void } {
  const RecognitionCtor = getSpeechRecognitionCtor();
  if (!RecognitionCtor) {
    options.onError?.("当前浏览器不支持语音识别，请改用文字输入。");
    options.onEnd?.();
    return { stop: () => undefined };
  }

  const recognition = new RecognitionCtor();
  recognition.lang = options.lang ?? "zh-CN";
  recognition.interimResults = true;
  recognition.continuous = options.continuous ?? false;
  recognition.onstart = () => options.onStart?.();
  recognition.onresult = (event) => {
    let text = "";
    let isFinal = false;
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      text += result?.[0]?.transcript ?? "";
      if (result?.isFinal) isFinal = true;
    }
    options.onResult?.(text.trim(), isFinal);
  };
  recognition.onerror = (event) => options.onError?.(speechErrorMessage(event.error));
  recognition.onend = () => options.onEnd?.();

  try {
    recognition.start();
  } catch {
    options.onError?.("语音输入启动失败，请改用文字输入。");
    options.onEnd?.();
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // Some browsers throw when recognition is already stopped.
      }
    },
  };
}
