import type { ReactNode } from "react";
import { figmaRectStyle } from "./figma-rect";

type PreviewFrameProps = {
  src: string;
  alt: string;
  children?: ReactNode;
};

/** 미리보기 폰 프레임 높이 — 모달·unavailable placeholder와 동일하게 유지 */
export const PREVIEW_PHONE_HEIGHT_CLASS =
  "h-[min(620px,calc(97vh-120px))]";

/**
 * 상태바 + 뒤로가기 통일 크롬.
 * 에셋마다 ‹ 위치·시계 정렬이 달라서, 모든 장면에 같은 레이아웃을 덮어쓴다.
 * - 상단: 왼쪽 18:00 · 오른쪽 신호/와이파이/배터리
 * - 그 바로 아래 왼쪽: ‹ 뒤로가기
 */
function PreviewPhoneChrome() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden>
      {/* 에셋 상태바·기존 ‹ 를 가린다 (제목·프로그레스는 오른쪽·아래에 남겨 둠) */}
      <div
        className="absolute bg-white"
        style={figmaRectStyle({ x: 0, y: 0, w: 393, h: 50 })}
      />
      <div
        className="absolute bg-white"
        style={figmaRectStyle({ x: 8, y: 50, w: 46, h: 56 })}
      />

      {/* 시간 — 왼쪽 */}
      <div
        className="absolute flex items-center justify-start"
        style={figmaRectStyle({ x: 22, y: 14, w: 72, h: 28 })}
      >
        <span
          className="text-[15px] font-semibold leading-none tracking-[-0.02em] text-[#111827]"
          style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
        >
          18:00
        </span>
      </div>

      {/* 시스템 아이콘 — 오른쪽 */}
      <div
        className="absolute flex items-center justify-end gap-[5px]"
        style={figmaRectStyle({ x: 270, y: 16, w: 100, h: 24 })}
      >
        <SignalIcon />
        <WifiIcon />
        <BatteryIcon />
      </div>

      {/* 뒤로가기 — 시간 바로 아래 왼쪽 */}
      <div
        className="absolute flex items-center justify-center"
        style={figmaRectStyle({ x: 10, y: 52, w: 36, h: 36 })}
      >
        <svg width="12" height="20" viewBox="0 0 12 20" fill="none">
          <path
            d="M10 2L2 10L10 18"
            stroke="#A0AEB9"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

function SignalIcon() {
  return (
    <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
      <rect x="0" y="8" width="3" height="4" rx="0.6" fill="#111827" />
      <rect x="4.5" y="5.5" width="3" height="6.5" rx="0.6" fill="#111827" />
      <rect x="9" y="3" width="3" height="9" rx="0.6" fill="#111827" />
      <rect x="13.5" y="0.5" width="3" height="11.5" rx="0.6" fill="#111827" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
      <path
        d="M8 10.6a1.15 1.15 0 1 0 0-2.3 1.15 1.15 0 0 0 0 2.3Z"
        fill="#111827"
      />
      <path
        d="M4.4 7.2a5.1 5.1 0 0 1 7.2 0"
        stroke="#111827"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M2.2 4.8a8.2 8.2 0 0 1 11.6 0"
        stroke="#111827"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
      <rect
        x="0.75"
        y="1.25"
        width="20.5"
        height="9.5"
        rx="2"
        stroke="#111827"
        strokeWidth="1.5"
      />
      <rect x="3" y="3.25" width="14" height="5.5" rx="1" fill="#111827" />
      <path
        d="M22.5 4.2v3.6c.9-.35.9-3.25 0-3.6Z"
        fill="#111827"
      />
    </svg>
  );
}

/**
 * Trimmed port of loopin-webapp's `FigmaAssetFrame` — same 393×852 Figma export
 * frame. 높이에 맞춰 비율 유지 · 가로로 여러 유형을 둘 때는 모달에서 좌우 스크롤.
 * 상단 시계·아이콘·‹ 는 `PreviewPhoneChrome`으로 모든 장면 동일.
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
      <PreviewPhoneChrome />
      {children}
    </div>
  );
}
