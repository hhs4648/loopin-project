"use client";

import { useEffect, useState } from "react";
import {
  GUIDE_TOURS,
  resolveActiveStop,
  type ResolvedStop,
} from "@/lib/teacher-guide-tour";
import type { StartGuideStepId } from "@/lib/teacher-onboarding";

/**
 * 화면의 **실제 요소를 짚어 주는** 안내.
 *
 * 왜 좌표를 안 박았나: 교사 웹은 Figma SVG 프레임 위에 요소를 얹는 구조라 화면이
 * 뷰포트에 맞춰 배율이 바뀐다. 좌표를 적어 두면 창 크기만 바꿔도 어긋나고, 프레임을
 * 새로 export하면 통째로 틀어진다. 그래서 **`data-guide` 표식을 단 실제 요소를 찾아
 * `getBoundingClientRect()`로 그때그때 잰다.** 요소가 움직이면 표시도 따라 움직인다.
 *
 * 대신 눌러 주지 않는다 — 선생님이 직접 누르고 직접 입력하게 한다. 대신 해 주면
 * 다음에 혼자 할 때 어디였는지 모른다.
 *
 * 어느 지점을 짚을지는 `teacher-guide-tour.ts`가 **화면을 보고** 매번 다시 고른다.
 */

export type GuideCoachMarkProps = {
  step: StartGuideStepId;
  classId: string;
  onClose: () => void;
  onSkipAll: () => void;
  onGo: (href: string) => void;
  /** 화면이 바뀌었을 수 있으니 진행도를 다시 계산해 달라 */
  onProgressMayChange: () => void;
};

type Rect = { top: number; left: number; width: number; height: number };

function measure(anchor: string): Rect | null {
  const el = document.querySelector<HTMLElement>(`[data-guide="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function GuideCoachMark({
  step,
  classId,
  onClose,
  onSkipAll,
  onGo,
  onProgressMayChange,
}: GuideCoachMarkProps) {
  const tour = GUIDE_TOURS[step];
  const [active, setActive] = useState<ResolvedStop>({ kind: "entry" });
  const [rect, setRect] = useState<Rect | null>(null);

  /*
    화면은 계속 변한다 — 창이 열리고, 입력이 채워지고, 배율이 바뀐다.
    한 번 재고 끝낼 수 없어서 변화를 넓게 지켜본다.
  */
  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = resolveActiveStop(tour);
        setActive(next);
        setRect(next.kind === "stop" ? measure(next.stop.anchor) : null);
      });
    };
    update();

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    // 입력·선택이 채워지면 다음 지점으로 넘어가야 한다
    document.addEventListener("input", update, true);
    document.addEventListener("change", update, true);
    document.addEventListener("click", update, true);

    const mo = new MutationObserver(update);
    mo.observe(document.body, { childList: true, subtree: true });
    const ro = new ResizeObserver(update);
    ro.observe(document.body);

    const timer = window.setInterval(update, 700); // 놓친 변화 대비

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      document.removeEventListener("input", update, true);
      document.removeEventListener("change", update, true);
      document.removeEventListener("click", update, true);
      mo.disconnect();
      ro.disconnect();
      window.clearInterval(timer);
    };
  }, [tour]);

  /** 짚은 곳을 누르면 진행도를 다시 본다 */
  useEffect(() => {
    if (active.kind !== "stop") return;
    const el = document.querySelector<HTMLElement>(
      `[data-guide="${active.stop.anchor}"]`,
    );
    if (!el) return;
    const handler = () => onProgressMayChange();
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [active, onProgressMayChange]);

  const skipRow = (
    <div className="mt-3 flex items-center justify-between border-t border-[#F1F2F4] pt-2.5">
      <button
        type="button"
        className="text-[11.5px] font-semibold text-[#9CA3AF] hover:text-[#3D4148]"
        onClick={onClose}
      >
        이 안내 닫기
      </button>
      <button
        type="button"
        className="text-[11.5px] font-semibold text-[#9CA3AF] underline underline-offset-2 hover:text-[#EF4444]"
        onClick={onSkipAll}
      >
        가이드 건너뛰기
      </button>
    </div>
  );

  // ── 이 화면에 대상이 없을 때: 어디로 가야 하는지 알려준다 ──────────────────
  if (active.kind === "entry" || !rect) {
    return (
      <div className="fixed bottom-5 right-5 z-[70] w-[300px] rounded-[16px] border border-[#E1E2E4] bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,0.14)]">
        <h4 className="text-[14px] font-bold text-[#15171A]">
          {active.kind === "stop" ? active.stop.title : "안내를 이어갈게요"}
        </h4>
        <p className="mt-1.5 text-[12px] font-medium leading-[1.55] text-[#6B7280]">
          {tour.entry.note}
        </p>
        <button
          type="button"
          className="mt-3 rounded-[9px] bg-[#1AA7F2] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[#1596DB]"
          onClick={() => onGo(tour.entry.href(classId))}
        >
          {tour.entry.cta}
        </button>
        {skipRow}
      </div>
    );
  }

  const { stop, index, total } = active;
  const PAD = 8;
  const roomRight = window.innerWidth - (rect.left + rect.width) > 330;
  const tipStyle = roomRight
    ? { top: Math.max(12, rect.top - 16), left: rect.left + rect.width + 24 }
    : {
        top: Math.min(window.innerHeight - 220, rect.top + rect.height + 24),
        left: Math.max(12, Math.min(rect.left - 20, window.innerWidth - 310)),
      };

  return (
    <>
      {/*
        구멍 뚫린 딤 — `box-shadow`를 화면만큼 퍼뜨려 짚은 곳만 남긴다.
        **`pointer-events: none`**: 딤이 클릭을 먹으면 정작 그 버튼을 못 누른다.
        「반강제」라도 길은 막지 않는다.
      */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-[65] rounded-[12px] transition-all duration-200"
        style={{
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          boxShadow: "0 0 0 9999px rgba(15,23,42,0.5)",
          outline: "3px solid #1AA7F2",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed z-[70] animate-pulse text-[24px] leading-none"
        style={
          roomRight
            ? {
                top: rect.top + rect.height / 2 - 13,
                left: rect.left + rect.width + 4,
              }
            : {
                top: rect.top + rect.height + 4,
                left: rect.left + rect.width / 2 - 8,
              }
        }
      >
        {roomRight ? "👉" : "👇"}
      </div>

      <div
        className="fixed z-[70] w-[290px] rounded-[14px] bg-white p-4 shadow-[0_10px_32px_rgba(0,0,0,0.24)]"
        style={tipStyle}
      >
        {total > 1 ? (
          <span className="text-[11px] font-bold tracking-wide text-[#1AA7F2]">
            {index + 1} / {total}
          </span>
        ) : null}
        <h4 className="mt-0.5 text-[14px] font-bold leading-snug text-[#15171A]">
          {stop.title}
        </h4>
        <p className="mt-1.5 text-[12.5px] font-medium leading-[1.55] text-[#5A6472]">
          {stop.body}
        </p>
        <p className="mt-2 text-[11.5px] font-bold text-[#1AA7F2]">
          {stop.advance === "press"
            ? "표시된 곳을 눌러 주세요"
            : "표시된 칸을 채워 주세요"}
        </p>
        {skipRow}
      </div>
    </>
  );
}
