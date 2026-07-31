"use client";

import type { CSSProperties } from "react";

/**
 * 주간·월간 공통 — 프레임 절대 좌표 · 폭 고정으로 화살표 위치 고정.
 */
export const CAL_PERIOD_NAV_LAYOUT = {
  left: 269,
  top: 128,
  width: 380,
  height: 34,
  btn: 34,
  /** 화살표 ↔ 날짜 라벨 간격 */
  gap: 10,
  /** 주간 — 라벨이 잘리지 않을 최소 폭 (기본 380보다 좁게) */
  weekWidth: 340,
  /** 월간 화살표 간격 대폭 축소용 폭 (left 고정 · 폭만 축소) */
  monthWidth: 190,
} as const;

type CalendarPeriodNavProps = {
  label: string;
  prevAriaLabel: string;
  nextAriaLabel: string;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
  style?: CSSProperties;
  /** 컴포넌트 폭 (기본 380) — 좁힐수록 `<` `>` 간격이 준다 */
  width?: number;
};

/**
 * 주간·월간 공통 기간 이동.
 * `<` · 라벨(가운데) · `>` — 폭 고정 · 화살표 위치 고정.
 */
export function CalendarPeriodNav({
  label,
  prevAriaLabel,
  nextAriaLabel,
  onPrev,
  onNext,
  className = "",
  style,
  width,
}: CalendarPeriodNavProps) {
  const L = CAL_PERIOD_NAV_LAYOUT;
  return (
    <div
      className={`grid items-center ${className}`}
      style={{
        width: width ?? L.width,
        height: L.height,
        gridTemplateColumns: `${L.btn}px minmax(0, 1fr) ${L.btn}px`,
        columnGap: L.gap,
        ...style,
      }}
    >
      <NavButton label={prevAriaLabel} onClick={onPrev} dir="left" />
      <span className="truncate text-center text-[17px] font-bold leading-none text-[#15171A]">
        {label}
      </span>
      <NavButton label={nextAriaLabel} onClick={onNext} dir="right" />
    </div>
  );
}

function NavButton({
  label,
  onClick,
  dir,
}: {
  label: string;
  onClick: () => void;
  dir: "left" | "right";
}) {
  const size = CAL_PERIOD_NAV_LAYOUT.btn;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex shrink-0 items-center justify-center rounded-full border border-[#E1E2E4] bg-white outline-none hover:bg-[#F3F4F5] focus-visible:ring-2 focus-visible:ring-[#1AA7F2]"
      style={{ width: size, height: size }}
    >
      <svg width="11" height="13" viewBox="0 0 10 12" fill="none" aria-hidden>
        <path
          d={
            dir === "left"
              ? "M7.5 1.5L2.5 6L7.5 10.5"
              : "M2.5 1.5L7.5 6L2.5 10.5"
          }
          stroke="#9A958E"
          strokeWidth="1.76"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
