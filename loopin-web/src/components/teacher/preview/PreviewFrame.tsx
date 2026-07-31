import type { ReactNode } from "react";

type PreviewFrameProps = {
  src: string;
  alt: string;
  children?: ReactNode;
};

/** 미리보기 폰 프레임 높이 — 모달·unavailable placeholder와 동일하게 유지 */
export const PREVIEW_PHONE_HEIGHT_CLASS =
  "h-[min(760px,calc(97vh-104px))]";

/**
 * Trimmed port of loopin-webapp's `FigmaAssetFrame` — same 393×852 Figma export
 * frame. 높이에 맞춰 비율 유지 · 가로로 여러 유형을 둘 때는 모달에서 좌우 스크롤.
 */
export function PreviewFrame({ src, alt, children }: PreviewFrameProps) {
  return (
    <div
      className={`relative mx-auto aspect-[393/852] ${PREVIEW_PHONE_HEIGHT_CLASS} w-auto shrink-0 overflow-hidden rounded-[24px] bg-white shadow-[0_4px_20px_rgba(15,23,42,0.12)]`}
    >
      <img
        src={src}
        alt={alt}
        className="pointer-events-none absolute inset-0 h-full w-full select-none"
        draggable={false}
      />
      {children}
    </div>
  );
}
