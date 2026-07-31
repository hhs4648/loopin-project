"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { CLASS_LAYOUT } from "@/lib/class-layout";

/** 사이드바 오른쪽 본문 영역 */
const AREA_LEFT = CLASS_LAYOUT.sidebarWidth;
const AREA_RIGHT = 1557;
const AREA_HEIGHT = 973;
const AREA_CENTER = (AREA_LEFT + AREA_RIGHT) / 2;

const PANEL = {
  contentLeft: CLASS_LAYOUT.contentLeft,
  contentRight: CLASS_LAYOUT.contentRight,
} as const;

/** 내 정보·계정 카드 = 영역 가운데 정렬 */
const CARD_WIDTH = 560;
const CARD_LEFT = AREA_CENTER - CARD_WIDTH / 2;

/** assets/praise-calendar-example.svg 원본 크기 */
const PHONE_W = 393;
const PHONE_H = 852;
/** ? 호버 시 예시 화면 표시 폭 — 기존 200px의 2배 */
const PHONE_PREVIEW_W = 400;
const PHONE_PREVIEW_H = (PHONE_PREVIEW_W / PHONE_W) * PHONE_H;

type MySettingsPanelProps = {
  /** 편집 중인 이름 (저장 전) */
  draftName: string;
  onDraftNameChange: (name: string) => void;
  /** 편집 중인 칭찬 캘린더 통과 기준 점수 (저장 전, 0~100) */
  draftPraisePassThreshold: number;
  onDraftPraisePassThresholdChange: (value: number) => void;
  dirty: boolean;
  onRevert: () => void;
  onSave: () => void;
  /** assets/praise-calendar-example.svg 원문 (수정 없이 표시) */
  praiseCalendarExampleSvg: string;
};

/**
 * 내 설정 — 헤더(설정)는 좌측 원위치 · 카드만 **가운데**.
 * 학교 설정·반 설정과 같은 카드/입력/버튼 톤.
 */
export function MySettingsPanel({
  draftName,
  onDraftNameChange,
  draftPraisePassThreshold,
  onDraftPraisePassThresholdChange,
  dirty,
  onRevert,
  onSave,
  praiseCalendarExampleSvg,
}: MySettingsPanelProps) {
  const router = useRouter();
  const [exampleOpen, setExampleOpen] = useState(false);
  const exampleId = useId();

  return (
    <div className="pointer-events-none absolute inset-0 z-[22]" aria-label="내 설정">
      {/* 베이스 SVG 본문 가림 */}
      <div
        className="pointer-events-none absolute"
        style={{
          left: AREA_LEFT,
          top: 0,
          width: AREA_RIGHT - AREA_LEFT,
          height: AREA_HEIGHT,
          background: "#F3F4F5",
        }}
        aria-hidden
      />

      {/* 헤더 + 되돌리기·저장 */}
      <div
        className="absolute flex items-start justify-between"
        style={{
          left: PANEL.contentLeft,
          top: 24,
          width: PANEL.contentRight - PANEL.contentLeft,
        }}
      >
        <div className="pointer-events-none">
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[#15171A]">
            설정
          </h1>
          <p className="mt-2 text-[14px] font-medium text-[#8B8F96]">
            내 계정 정보를 확인하고 로그아웃할 수 있어요.
          </p>
        </div>
        <div
          className="pointer-events-auto flex items-center gap-2.5"
          style={{ height: 40, marginTop: 4 }}
        >
          <button
            type="button"
            aria-label="되돌리기"
            disabled={!dirty}
            onClick={onRevert}
            className="flex h-10 items-center justify-center rounded-[12px] border border-[#15171A] bg-white px-5 text-[14px] font-bold text-[#15171A] outline-none transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            되돌리기
          </button>
          <button
            type="button"
            aria-label="저장"
            disabled={!dirty}
            onClick={onSave}
            className="flex h-10 items-center justify-center rounded-[12px] px-6 text-[14px] font-bold text-white outline-none transition-colors disabled:cursor-not-allowed disabled:bg-[#D1D5DB] disabled:text-[#6B7280]"
            style={{ backgroundColor: dirty ? "#1AA7F2" : undefined }}
          >
            저장
          </button>
        </div>
      </div>

      {/* 설정 카드 스택 (가운데) */}
      <div
        className="pointer-events-auto absolute flex flex-col gap-4"
        style={{
          left: CARD_LEFT,
          top: 120,
          width: CARD_WIDTH,
        }}
      >
        {/* 내 정보 */}
        <section className="rounded-[16px] bg-white px-7 py-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div>
            <h2 className="text-[18px] font-bold leading-none text-[#15171A]">
              내 정보
            </h2>
            <p className="mt-1.5 text-[13px] font-medium text-[#9CA3AF]">
              사이드바에 보이는 선생님 이름이에요.
            </p>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <label className="flex min-w-0 flex-1 items-center gap-4">
              <span className="w-[88px] shrink-0 text-[15px] font-semibold text-[#3D4148]">
                선생님 이름
              </span>
              <input
                id="teacher-name"
                value={draftName}
                onChange={(e) => onDraftNameChange(e.target.value)}
                maxLength={20}
                placeholder="예: 김선생"
                className="h-12 min-w-0 flex-1 rounded-[12px] border border-[#E1E2E4] bg-white px-4 text-[16px] font-semibold text-[#15171A] outline-none transition-colors placeholder:font-medium placeholder:text-[#B0B4BB] focus:border-[#1AA7F2]"
              />
            </label>
          </div>
        </section>

        {/* 칭찬 캘린더 */}
        <section className="relative rounded-[16px] bg-white px-7 py-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-bold leading-none text-[#15171A]">
                칭찬 캘린더
              </h2>
              <p className="mt-1.5 text-[13px] font-medium text-[#9CA3AF]">
                이 점수 이상이면 통과, 미만이면 아쉬움으로 표시돼요.
              </p>
            </div>

            {praiseCalendarExampleSvg ? (
              <div
                className="relative shrink-0"
                onMouseEnter={() => setExampleOpen(true)}
                onMouseLeave={() => setExampleOpen(false)}
              >
                <button
                  type="button"
                  aria-label="학생 화면 예시 보기"
                  aria-describedby={exampleOpen ? exampleId : undefined}
                  aria-expanded={exampleOpen}
                  onFocus={() => setExampleOpen(true)}
                  onBlur={() => setExampleOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E8E8EA] bg-[#FAFAFA] text-[13px] font-bold text-[#8B8F96] outline-none transition-colors hover:border-[#1AA7F2] hover:bg-[#E7F5FE] hover:text-[#1274A9] focus-visible:ring-2 focus-visible:ring-[#1AA7F2]"
                >
                  ?
                </button>
                {exampleOpen ? (
                  <div
                    id={exampleId}
                    role="tooltip"
                    className="absolute right-0 z-30"
                    style={{ top: -225 }}
                  >
                    <div
                      className="overflow-hidden rounded-[24px] border border-[#E8E8EA] bg-white shadow-[0_8px_28px_rgba(15,23,42,0.18)]"
                      style={{
                        width: PHONE_PREVIEW_W,
                        height: PHONE_PREVIEW_H,
                      }}
                    >
                      <div
                        className="pointer-events-none origin-top-left [&>svg]:block [&>svg]:max-w-none"
                        style={{
                          width: PHONE_W,
                          height: PHONE_H,
                          transform: `scale(${PHONE_PREVIEW_W / PHONE_W})`,
                        }}
                        dangerouslySetInnerHTML={{
                          __html: praiseCalendarExampleSvg,
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex items-center gap-4 rounded-[14px] border border-[#E8F5E0] bg-[#F7FCF2] px-5 py-4">
            <label
              htmlFor="praise-pass-threshold"
              className="min-w-0 flex-1 text-[14px] font-semibold leading-5 text-[#3D4148]"
            >
              칭찬 캘린더 통과 기준 점수
            </label>
            <div className="flex items-center gap-2">
              <input
                id="praise-pass-threshold"
                type="number"
                min={0}
                max={100}
                step={1}
                inputMode="numeric"
                value={draftPraisePassThreshold}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  if (Number.isNaN(raw)) return;
                  onDraftPraisePassThresholdChange(
                    Math.min(100, Math.max(0, Math.round(raw))),
                  );
                }}
                className="h-11 w-[84px] rounded-[12px] border border-[#E1E2E4] bg-white px-3 text-center text-[16px] font-bold tabular-nums text-[#15171A] outline-none transition-colors focus:border-[#A4D24C]"
              />
              <span className="text-[15px] font-semibold text-[#3D4148]">점</span>
            </div>
          </div>
        </section>

        {/* 계정 */}
        <section className="rounded-[16px] bg-white px-7 py-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div>
            <h2 className="text-[18px] font-bold leading-none text-[#15171A]">
              계정
            </h2>
            <p className="mt-1.5 text-[13px] font-medium text-[#9CA3AF]">
              이 기기에서 로그아웃할 수 있어요.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/login")}
            className="mt-6 flex h-11 items-center justify-center rounded-[12px] border border-[#E1E2E4] bg-white px-5 text-[14px] font-bold text-[#3D4148] transition-colors hover:border-[#F16163] hover:bg-[#FEE7E7] hover:text-[#C52B2B]"
          >
            로그아웃
          </button>
        </section>
      </div>
    </div>
  );
}
