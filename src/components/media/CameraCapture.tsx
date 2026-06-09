import React, { useEffect, useRef, useState } from "react";
import { Camera, Loader2, RefreshCw, Upload, VideoOff, X } from "lucide-react";

type CameraState = "idle" | "requesting" | "preview" | "captured" | "error";

export type CameraCaptureProps = {
  onCapture: (file: File, previewUrl: string) => void;
  onCancel?: () => void;
};

function isLocalhost(): boolean {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "无法打开摄像头，请在浏览器权限中允许摄像头，或改用本地上传。";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "摄像头正在被其他应用使用，请关闭后重试。";
  }
  return "无法打开摄像头，请稍后重试，或改用本地上传。";
}

export default function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [error, setError] = useState("");
  const [capturedUrl, setCapturedUrl] = useState("");
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [accepted, setAccepted] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (!videoRef.current || !streamRef.current || cameraState !== "preview") return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => undefined);
  }, [cameraState]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function openCamera() {
    setAccepted(false);
    setError("");
    setCapturedUrl("");
    setCapturedFile(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("当前浏览器不支持拍照上传，请改用本地上传。");
      setCameraState("error");
      return;
    }

    if (!window.isSecureContext && !isLocalhost()) {
      setError("摄像头需要在 HTTPS 环境或本地 localhost 下使用。");
      setCameraState("error");
      return;
    }

    setCameraState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      stopCamera();
      streamRef.current = stream;
      setCameraState("preview");
    } catch (firstError) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        stopCamera();
        streamRef.current = stream;
        setCameraState("preview");
      } catch (fallbackError) {
        stopCamera();
        setError(cameraErrorMessage(fallbackError || firstError));
        setCameraState("error");
      }
    }
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video) return;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("拍照失败，请重新打开摄像头再试。");
      setCameraState("error");
      return;
    }
    context.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) {
      setError("拍照失败，请重新打开摄像头再试。");
      setCameraState("error");
      return;
    }
    const file = new File([blob], `camera-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
    setCapturedUrl(dataUrl);
    setCapturedFile(file);
    stopCamera();
    setCameraState("captured");
  }

  function useCapturedPhoto() {
    if (!capturedFile || !capturedUrl) return;
    setAccepted(true);
    onCapture(capturedFile, capturedUrl);
  }

  function closeCamera() {
    stopCamera();
    setCameraState("idle");
  }

  if (cameraState === "requesting") {
    return (
      <div className="rounded-2xl border-2 border-dashed border-[#D1D5DB] bg-[#FAF8F2] p-8 text-center">
        <Loader2 className="mx-auto h-12 w-12 animate-spin text-[#0E9F6E]" />
        <p className="mt-4 text-xl font-black text-[#111827]">正在打开摄像头……</p>
      </div>
    );
  }

  if (cameraState === "preview") {
    return (
      <div className="rounded-2xl border border-[#D1D5DB] bg-[#111827] p-4 text-white">
        <video ref={videoRef} className="h-[320px] w-full rounded-xl object-cover" playsInline muted autoPlay />
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-black">请把照片放在画面中间</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={captureFrame}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#0E9F6E] px-5 font-black text-white hover:bg-[#0C8F62]"
            >
              <Camera className="h-5 w-5" />
              拍照
            </button>
            <button
              type="button"
              onClick={closeCamera}
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/50 px-5 font-black text-white hover:bg-white/10"
            >
              <VideoOff className="h-5 w-5" />
              关闭摄像头
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (cameraState === "captured") {
    return (
      <div className="rounded-2xl border border-[#D1D5DB] bg-[#FAF8F2] p-5">
        <img src={capturedUrl} alt="拍摄的照片预览" className="h-[320px] w-full rounded-xl object-cover" />
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-black text-[#0E6F52]">
            {accepted ? "这张照片已放入故事表单" : "照片拍好了，可以使用这张。"}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void openCamera()}
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#0E9F6E] px-5 font-black text-[#0E6F52] hover:bg-[#EAF5F0]"
            >
              <RefreshCw className="h-5 w-5" />
              重新拍摄
            </button>
            <button
              type="button"
              onClick={useCapturedPhoto}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#0E9F6E] px-5 font-black text-white hover:bg-[#0C8F62]"
            >
              <Upload className="h-5 w-5" />
              使用这张照片
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (cameraState === "error") {
    return (
      <div className="rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] p-6 text-center">
        <VideoOff className="mx-auto h-12 w-12 text-[#B42318]" />
        <p className="mt-4 text-lg font-black text-[#B42318]">{error}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => void openCamera()}
            className="h-12 rounded-xl border border-[#B42318] px-5 font-black text-[#B42318] hover:bg-[#FEE2E2]"
          >
            重试
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-12 rounded-xl bg-[#0E9F6E] px-5 font-black text-white hover:bg-[#0C8F62]"
          >
            改用本地上传
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-dashed border-[#D1D5DB] bg-[#FAF8F2] p-8 text-center">
      <Camera className="mx-auto h-14 w-14 text-[#0E9F6E]" />
      <p className="mt-4 text-xl font-black text-[#111827]">打开摄像头拍照</p>
      <p className="mx-auto mt-2 max-w-xl text-sm font-bold leading-6 text-[#4B5563]">
        适合直接拍一张老物件、老照片或生活场景。
      </p>
      <button
        type="button"
        onClick={() => void openCamera()}
        className="mt-5 inline-flex h-14 items-center gap-2 rounded-xl bg-[#0E9F6E] px-6 text-lg font-black text-white hover:bg-[#0C8F62]"
      >
        <Camera className="h-5 w-5" />
        打开摄像头
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl px-4 font-black text-[#0E6F52] hover:bg-[#EAF5F0]"
        >
          <X className="h-4 w-4" />
          改用本地上传
        </button>
      )}
    </div>
  );
}
