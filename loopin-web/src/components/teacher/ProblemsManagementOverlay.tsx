"use client";

import {
  PROBLEMS_PAGE_LAYOUT,
  ProblemsCreateForm,
} from "@/components/teacher/NewProblemSetPanel";
import { SavedProblemSetsPanel } from "@/components/teacher/SavedProblemSetsPanel";
import { CLASS_LAYOUT } from "@/lib/class-layout";
import type { ProblemsView } from "@/lib/problem-routes";

const FRAME_W = 1557;
const FRAME_H = 974;
const BG = "#FFFFFF";

const TITLES: Record<ProblemsView, string> = {
  submit: "문제 관리",
  saved: "사용자 지정 과제 제출",
};

const SUBTITLES: Record<ProblemsView, string> = {
  submit:
    "학년·교과서·단원을 고르고 출제할 문제 유형을 선택하세요.",
  saved:
    "자동화 시스템으로 쉽고 빠르게 직접 문제를 만들 수 있어요.",
};

type ProblemsManagementOverlayProps = {
  view: ProblemsView;
  newProblemSetSvg: string;
};

export function ProblemsManagementOverlay({
  view,
  newProblemSetSvg,
}: ProblemsManagementOverlayProps) {
  const left = PROBLEMS_PAGE_LAYOUT.contentLeft;
  const width = CLASS_LAYOUT.contentRight - left;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div
        className="absolute"
        style={{
          left: CLASS_LAYOUT.sidebarWidth,
          top: 0,
          width: FRAME_W - CLASS_LAYOUT.sidebarWidth,
          height: FRAME_H,
          background: BG,
        }}
        aria-hidden
      />

      <div
        className="pointer-events-auto absolute no-scrollbar overflow-y-auto overflow-x-hidden"
        style={{
          left,
          top: 0,
          width,
          height: FRAME_H,
          paddingTop: 24,
          paddingBottom: 40,
          paddingRight: 16,
        }}
      >
        <header className="mb-6">
          <h1 className="text-[28px] font-bold leading-tight tracking-[0.04em] text-[#15171A]">
            {TITLES[view]}
          </h1>
          <p className="mt-2.5 text-[14px] leading-relaxed tracking-[0.02em] text-[#9CA3AF]">
            {SUBTITLES[view]}
          </p>
        </header>

        {view === "submit" ? (
          <ProblemsCreateForm svg={newProblemSetSvg} />
        ) : (
          <SavedProblemSetsPanel />
        )}
      </div>
    </div>
  );
}
