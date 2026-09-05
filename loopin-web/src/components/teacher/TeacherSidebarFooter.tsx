"use client";

import Link from "next/link";
import { useState } from "react";
import { ModalCloseButton } from "@/components/teacher/ModalCloseButton";
import {
  SIDEBAR_GROUP_CARD_CLASS,
  sidebarCardRowClass,
  sidebarIconClass,
  sidebarNavItemClass,
} from "@/components/teacher/SidebarSurface";

type TeacherSidebarFooterProps = {
  /** 내 설정 화면 활성 */
  mySettingsActive?: boolean;
  /** 단어장 만들기 화면 활성 */
  vocabActive?: boolean;
};

/** 사이드바 하단 블록 (부가기능 + 설정) */
const FOOTER_BLOCK = {
  left: 16,
  width: 206.93,
  top: 808,
} as const;

const SETTINGS_ROW = {
  top: 914,
  height: 44,
} as const;

/**
 * 교사 사이드바 하단 — 부가기능 · 내 설정.
 * 전 교사 화면 공통 (`TeacherFigmaFrame`).
 */
export function TeacherSidebarFooter({
  mySettingsActive = false,
  vocabActive = false,
}: TeacherSidebarFooterProps) {
  const [comingSoonOpen, setComingSoonOpen] = useState(false);

  return (
    <>
      {/* SVG 데모 하단 행 가림 */}
      <div
        className="pointer-events-none absolute z-[11] bg-[#F8F8F7]"
        style={{
          left: 0,
          top: FOOTER_BLOCK.top - 8,
          width: 238.93,
          height: 973 - (FOOTER_BLOCK.top - 8),
        }}
        aria-hidden
      />

      <div
        className="absolute z-[12] flex flex-col"
        style={{
          left: FOOTER_BLOCK.left,
          top: FOOTER_BLOCK.top,
          width: FOOTER_BLOCK.width,
        }}
      >
        <p className="mb-1.5 px-2 text-[11px] font-bold tracking-[0.08em] text-[#15171A]">
          부가기능
        </p>
        <div className={`${SIDEBAR_GROUP_CARD_CLASS} flex flex-col gap-0.5`}>
          <button
            type="button"
            aria-label="단어장 만들기"
            className={`box-border h-10 w-full overflow-hidden text-left ${sidebarNavItemClass(vocabActive)}`}
            style={{ WebkitTapHighlightColor: "transparent" }}
            onClick={() => setComingSoonOpen(true)}
          >
            <BookIcon active={vocabActive} />
            단어장 만들기
          </button>
        </div>
      </div>

      <Link
        href="/teacher/settings"
        aria-label="설정"
        aria-current={mySettingsActive ? "page" : undefined}
        className={`absolute z-[12] box-border h-11 overflow-hidden ${sidebarCardRowClass(mySettingsActive)}`}
        style={{
          left: FOOTER_BLOCK.left,
          top: SETTINGS_ROW.top,
          width: FOOTER_BLOCK.width,
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

      {comingSoonOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-6"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="vocab-coming-soon-title"
            className="relative w-[360px] rounded-2xl bg-white px-8 py-6 shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <p
                id="vocab-coming-soon-title"
                className="text-[16px] font-semibold text-[#15171A]"
              >
                추후에 추가될 예정입니다.
              </p>
              <ModalCloseButton onClick={() => setComingSoonOpen(false)} />
            </div>
            <button
              type="button"
              className="mt-5 w-full rounded-xl bg-[#15171A] px-4 py-2.5 text-[14px] font-semibold text-white outline-none hover:bg-[#2A2C30] focus-visible:ring-2 focus-visible:ring-[#1AA7F2]"
              onClick={() => setComingSoonOpen(false)}
            >
              확인
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function BookIcon({ active }: { active?: boolean }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={`shrink-0 transition-colors ${sidebarIconClass(active)}`}
    >
      <path
        d="M4.25 3.75h8.5A1.75 1.75 0 0 1 14.5 5.5v10.25H5.5A1.75 1.75 0 0 1 3.75 14V5A1.25 1.25 0 0 1 5 3.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 5.5h1.25A.75.75 0 0 1 16.5 6.25v8.25a1.5 1.5 0 0 1-1.5 1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 7.25h4.5M7 10h4.5M7 12.75h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
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
