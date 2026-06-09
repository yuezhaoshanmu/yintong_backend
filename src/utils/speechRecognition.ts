export type SpeechRecognitionState =
  | "idle"
  | "unsupported"
  | "permission_requesting"
  | "permission_denied"
  | "listening"
  | "recognizing"
  | "recognized"
  | "no_result"
  | "network_error"
  | "error";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultLike[];
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
  message?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognizerOptions = {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onStart?: () => void;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (errorType: string, message: string) => void;
  onEnd?: () => void;
};

type SpeechRecognizer = {
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition;
}

function speechErrorMessage(errorType: string): string {
  if (errorType === "not-allowed" || errorType === "service-not-allowed") {
    return "麦克风权限被拒绝，请在浏览器地址栏允许麦克风。";
  }
  if (errorType === "audio-capture") {
    return "没有找到可用麦克风，请检查设备后改用文字输入。";
  }
  if (errorType === "no-speech") {
    return "没有听清楚，您可以再说一遍。";
  }
  if (errorType === "network") {
    return "浏览器语音识别网络暂时不可用，请改用文字输入。";
  }
  if (errorType === "aborted") {
    return "语音识别已取消。";
  }
  return "语音识别暂时不可用，请改用文字输入。";
}

export function isSpeechRecognitionSupported(): boolean {
  return Boolean(getSpeechRecognitionCtor());
}

export function createSpeechRecognizer(options: SpeechRecognizerOptions): SpeechRecognizer {
  const RecognitionCtor = getSpeechRecognitionCtor();
  if (!RecognitionCtor) {
    return {
      start: () => {
        options.onError?.("unsupported", "当前浏览器不支持语音识别，请改用文字输入。");
        options.onEnd?.();
      },
      stop: () => undefined,
      abort: () => undefined,
    };
  }

  const recognition = new RecognitionCtor();
  recognition.lang = options.lang ?? "zh-CN";
  recognition.continuous = options.continuous ?? false;
  recognition.interimResults = options.interimResults ?? true;
  recognition.onstart = () => options.onStart?.();
  recognition.onresult = (event) => {
    let interimText = "";
    let finalText = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result?.[0]?.transcript?.trim() ?? "";
      if (!transcript) continue;
      if (result.isFinal) {
        finalText += transcript;
      } else {
        interimText += transcript;
      }
    }
    if (interimText) options.onInterim?.(interimText);
    if (finalText) options.onFinal?.(finalText);
  };
  recognition.onerror = (event) => {
    const errorType = event.error || "error";
    options.onError?.(errorType, speechErrorMessage(errorType));
  };
  recognition.onend = () => options.onEnd?.();

  return {
    start: () => {
      try {
        recognition.start();
      } catch {
        options.onError?.("error", "语音输入启动失败，请改用文字输入。");
        options.onEnd?.();
      }
    },
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // Browsers throw if recognition has already ended.
      }
    },
    abort: () => {
      try {
        recognition.abort();
      } catch {
        // Browsers throw if recognition has already ended.
      }
    },
  };
}
