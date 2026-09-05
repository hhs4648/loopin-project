import Link from "next/link";
import { FitToViewport } from "@/components/figma/FitToViewport";
import { readAssetFile } from "@/lib/assets";
import type { FigmaHotspot } from "./types";

interface FigmaScreenProps {
  /** assets/ 폴더 안 파일명 (예: class-home.svg) */
  file: string;
  alt: string;
  width: number;
  height: number;
  hotspots?: FigmaHotspot[];
}

/**
 * assets/ 의 SVG를 수정 없이 그대로 표시합니다.
 * figma.md: 디자인 임의 생성·수정 금지. public/ 등 다른 곳에 복사하지 않음.
 */
export function FigmaScreen({
  file,
  alt,
  width,
  height,
  hotspots = [],
}: FigmaScreenProps) {
  const svg = readAssetFile(file);

  return (
    <main className="flex min-h-screen overflow-auto bg-white">
      <FitToViewport width={width} height={height}>
      <div
        className="relative shrink-0"
        style={{ width, minWidth: width, height, minHeight: height }}
      >
        <div
          role="img"
          aria-label={alt}
          className="[&>svg]:block [&>svg]:max-w-none"
          style={{ width, height }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {hotspots.map((hotspot) => (
          <Link
            key={hotspot.id}
            href={hotspot.href}
            aria-label={hotspot.label}
            className="absolute cursor-pointer opacity-0 outline-none focus:outline-none focus-visible:outline-none"
            style={{
              left: hotspot.x,
              top: hotspot.y,
              width: hotspot.width,
              height: hotspot.height,
              WebkitTapHighlightColor: "transparent",
            }}
          />
        ))}
      </div>
      </FitToViewport>
    </main>
  );
}
