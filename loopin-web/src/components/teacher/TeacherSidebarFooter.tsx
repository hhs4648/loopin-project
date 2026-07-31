"use client";

import Link from "next/link";
import {
  sidebarCardRowClass,
  sidebarIconClass,
} from "@/components/teacher/SidebarSurface";

type TeacherSidebarFooterProps = {
  /** 내 설정 화면 활성 */
  mySettingsActive?: boolean;
};

/** SVG 사이드바 하단 「설정」 행 좌표 (class-home.svg) */
const SETTINGS_ROW = {
  top: 914,
  left: 16,
  width: 206.93,
  height: 44,
} as const;

/**
 * 교사 사이드바 하단 — 내 설정.
 * 전 교사 화면 공통 (`TeacherFigmaFrame`).
 */
export function TeacherSidebarFooter({
  mySettingsActive = false,
}: TeacherSidebarFooterProps) {
  return (
    <>
      {/* SVG 데모 설정 행 가림 */}
      <div
        className="pointer-events-none absolute z-[11] bg-[#F8F8F7]"
        style={{
          left: 0,
          top: SETTINGS_ROW.top - 4,
          width: 238.93,
          height: SETTINGS_ROW.height + 8,
        }}
        aria-hidden
      />

      <Link
        href="/teacher/settings"
        aria-label="설정"
        aria-current={mySettingsActive ? "page" : undefined}
        className={`absolute z-[12] box-border h-11 overflow-hidden ${sidebarCardRowClass(mySettingsActive)}`}
        style={{
          left: SETTINGS_ROW.left,
          top: SETTINGS_ROW.top,
          width: SETTINGS_ROW.width,
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <span
          className={`flex shrink-0 items-center justify-center transition-colors ${sidebarIconClass(mySettingsActive)}`}
          style={{ width: 18, height: 18 }}
          aria-hidden
        >
          <SettingsIcon />
        </span>
        설정
      </Link>
    </>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M9 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M14.1 10.35c.06-.45.09-.9.09-1.35s-.03-.9-.09-1.35l1.44-1.12a.45.45 0 0 0 .11-.57l-1.36-2.36a.45.45 0 0 0-.54-.2l-1.7.68a7.2 7.2 0 0 0-1.17-.68l-.26-1.8A.45.45 0 0 0 10.05 1.5H7.95a.45.45 0 0 0-.45.38l-.26 1.8c-.42.16-.81.39-1.17.68l-1.7-.68a.45.45 0 0 0-.54.2L2.46 5.84a.45.45 0 0 0 .11.57l1.44 1.12c-.06.45-.09.9-.09 1.35s.03.9.09 1.35L2.57 11.35a.45.45 0 0 0-.11.57l1.36 2.36c.12.21.37.3.58.2l1.7-.68c.36.29.75.52 1.17.68l.26 1.8c.05.33.33.57.66.57h2.1c.33 0 .61-.24.66-.57l.26-1.8c.42-.16.81-.39 1.17-.68l1.7.68c.21.1.46.01.58-.2l1.36-2.36a.45.45 0 0 0-.11-.57l-1.44-1.12Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
