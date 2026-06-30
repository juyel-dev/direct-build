import { useState, useCallback } from "react";

type OptimizedImageProps = {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
};

export function OptimizedImage({ src, alt, className, width, height }: OptimizedImageProps) {
  const [loaded, setLoaded] = useState(false);

  const onLoad = useCallback(() => setLoaded(true), []);

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`} style={{ aspectRatio: width && height ? `${width}/${height}` : undefined }}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        width={width}
        height={height}
        onLoad={onLoad}
        className={`transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      {!loaded && (
        <div className="absolute inset-0 shimmer-bg" />
      )}
    </div>
  );
}
