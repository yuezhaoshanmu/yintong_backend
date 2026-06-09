import { useEffect, useState } from "react";

type SafeImageProps = {
  src?: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  fit?: "cover" | "contain";
  objectFit?: "cover" | "contain";
};

export default function SafeImage({
  src,
  fallbackSrc,
  alt,
  className = "",
  imgClassName = "",
  fit,
  objectFit,
}: SafeImageProps) {
  const resolvedFallback = fallbackSrc || "/image/placeholder/story-placeholder.jpg";
  const resolvedFit = fit ?? objectFit ?? "cover";
  const [currentSrc, setCurrentSrc] = useState(src || resolvedFallback);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrentSrc(src || resolvedFallback);
    setFailed(false);
  }, [src, resolvedFallback]);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center bg-[#F4E7D3] text-center text-sm font-bold text-[#7A5A3A] ${className}`}
        role="img"
        aria-label={alt}
      >
        <span className="px-3 leading-6">照片正在准备中</span>
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={`${resolvedFit === "cover" ? "object-cover" : "object-contain"} ${className} ${imgClassName}`}
      onError={() => {
        if (currentSrc !== resolvedFallback) {
          setCurrentSrc(resolvedFallback);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}
