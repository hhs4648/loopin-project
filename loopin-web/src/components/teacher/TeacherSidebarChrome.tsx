"use client";

import Link from "next/link";
import {
  sidebarCardRowClass,
  sidebarIconClass,
} from "@/components/teacher/SidebarSurface";
import { CLASS_LAYOUT } from "@/lib/class-layout";

type TeacherSidebarChromeProps = {
  height: number;
  calendarActive?: boolean;
  /** 반 화면: 사이드 회색 + 콘텐츠 앞 흰 이격 */
  coverWideBleed?: boolean;
  /**
   * 흰 이격이 끝나는 X (그 오른쪽부터 콘텐츠).
   * 홈: homeBleedLeft · 그 외 탭: contentLeft
   */
  whiteGutterEnd?: number;
};

/**
 * 모든 교사 화면 공통 사이드바 크롬.
 * 반 화면: 회색 사이드 → 흰 갭 → 콘텐츠.
 */
export function TeacherSidebarChrome({
  height,
  calendarActive = false,
  coverWideBleed = false,
  whiteGutterEnd = CLASS_LAYOUT.contentLeft,
}: TeacherSidebarChromeProps) {
  const sideW = CLASS_LAYOUT.sidebarWidth;
  const grayEnd = CLASS_LAYOUT.gutterGrayEnd;
  const whiteEnd = Math.max(whiteGutterEnd, grayEnd);

  return (
    <>
      <div
        className="pointer-events-none absolute z-[8]"
        style={{
          left: 0,
          top: 0,
          width: sideW,
          height,
          backgroundColor: "#F8F8F7",
        }}
        aria-hidden
      />

      {coverWideBleed ? (
        <>
          {/* 사이드 확장 회색 */}
          <div
            className="pointer-events-none absolute z-[8]"
            style={{
              left: sideW,
              top: 0,
              width: grayEnd - sideW,
              height,
              backgroundColor: "#F8F8F7",
            }}
            aria-hidden
          />
          {/* 회색 ↔ 콘텐츠 사이 흰 이격 (전체 높이) */}
          <div
            className="pointer-events-none absolute z-[9]"
            style={{
              left: grayEnd,
              top: 0,
              width: whiteEnd - grayEnd,
              height,
              backgroundColor: "#FFFFFF",
            }}
            aria-hidden
          />
        </>
      ) : null}

      <div
        className="pointer-events-none absolute z-[14]"
        style={{
          left: 0,
          top: 68,
          width: coverWideBleed ? grayEnd : sideW,
          /* 캘린더 카드 하단(~188)까지만 · 문제 관리 카드와 겹치지 않음 */
          height: 120,
          backgroundColor: "#F8F8F7",
        }}
        aria-hidden
      />

      <Link
        href="/teacher"
        aria-label="캘린더"
        className={`absolute z-[15] box-border h-11 overflow-hidden ${sidebarCardRowClass(calendarActive)}`}
        style={{
          left: 16,
          top: 112,
          width: 206,
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <CalendarIcon active={calendarActive} />
        <span>캘린더</span>
      </Link>
    </>
  );
}

function CalendarIcon({ active }: { active?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={`shrink-0 transition-colors ${sidebarIconClass(active)}`}
    >
      <rect
        x="3"
        y="4.5"
        width="14"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M3 8h14" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 2.5v3M13 2.5v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
