"use client";

import { useEffect, useRef, useState } from "react";
import {
  GUIDE_TOURS,
  hasNextButton,
  isStopReady,
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
  /** 마지막 지점까지 다 보고 안내를 마쳤다 */
  onFinish?: () => void;
};

type Rect = { top: number; left: number; width: number; height: number };


/** 여백을 두른 구멍을 화면 안으로 눌러 담는다 */
function clampToViewport(rect: Rect, pad: number): Rect {
  const margin = 6;
  const top = Math.max(margin, rect.top - pad);
  const left = Math.max(margin, rect.left - pad);
  const bottom = Math.min(window.innerHeight - margin, rect.top + rect.height + pad);
  const right = Math.min(window.innerWidth - margin, rect.left + rect.width + pad);
  return {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/**
 * 말풍선을 **짚은 자리를 가리지 않는 쪽**에 놓는다.
 *
 * 예전에는 「오른쪽에 자리가 있으면 오른쪽, 아니면 아래」 두 갈래였다. 그래서
 * 화면 오른쪽 아래에 있는 것(초대 코드처럼)을 짚으면 아래로 갈 자리도 없어
 * 화면 안으로 당겨지다가 **짚은 자리를 그대로 덮어 버렸다.**
 *
 * 오른쪽 → 왼쪽 → 아래 → 위 순으로 **온전히 들어가는 첫 자리**를 고르고, 어디에도
 * 안 들어가면 더 넓은 쪽 구석에 붙인다.
 */
const TIP_W = 290;
const TIP_H = 250;
const GAP = 20;
const EDGE = 12;

type TipSide = "right" | "left" | "below" | "above";

function placeTip(rect: Rect): { top: number; left: number; side: TipSide } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.max(EDGE, Math.min(x, vw - TIP_W - EDGE));
  const clampY = (y: number) => Math.max(EDGE, Math.min(y, vh - TIP_H - EDGE));

  const candidates: { side: TipSide; top: number; left: number; fits: boolean }[] = [
    {
      side: "right",
      left: rect.left + rect.width + GAP,
      top: clampY(rect.top - 16),
      fits: rect.left + rect.width + GAP + TIP_W <= vw - EDGE,
    },
    {
      side: "left",
      left: rect.left - GAP - TIP_W,
      top: clampY(rect.top - 16),
      fits: rect.left - GAP - TIP_W >= EDGE,
    },
    {
      side: "below",
      left: clampX(rect.left),
      top: rect.top + rect.height + GAP,
      fits: rect.top + rect.height + GAP + TIP_H <= vh - EDGE,
    },
    {
      side: "above",
      left: clampX(rect.left),
      top: rect.top - GAP - TIP_H,
      fits: rect.top - GAP - TIP_H >= EDGE,
    },
  ];

  const hit = candidates.find((c) => c.fits);
  if (hit) return { top: hit.top, left: hit.left, side: hit.side };

  const roomRight = vw - (rect.left + rect.width);
  return roomRight >= rect.left
    ? { top: clampY(rect.top), left: vw - TIP_W - EDGE, side: "right" }
    : { top: clampY(rect.top), left: EDGE, side: "left" };
}

const ARROW_GLYPH: Record<TipSide, string> = {
  right: "👉",
  left: "👈",
  below: "👇",
  above: "👆",
};

const ARROW_POS: Record<TipSide, (r: Rect) => { top: number; left: number }> = {
  right: (r) => ({ top: r.top + r.height / 2 - 13, left: r.left + r.width + 4 }),
  left: (r) => ({ top: r.top + r.height / 2 - 13, left: r.left - 30 }),
  below: (r) => ({ top: r.top + r.height + 4, left: r.left + r.width / 2 - 8 }),
  above: (r) => ({ top: r.top - 30, left: r.left + r.width / 2 - 8 }),
};

/**
 * 지점마다 무엇을 해야 하는지 한 줄.
 *
 * 「다음」 버튼이 있는 지점(`confirm`·`optional`)에는 없다 — 버튼이 바로 아래 있고
 * 설명에도 적혀 있어서, 한 줄 더 붙이면 같은 말을 세 번 하는 꼴이 된다.
 * 버튼이 없는 `press`만 무엇을 눌러야 하는지 짚어 준다.
 */
const ASK: Record<string, string | undefined> = {
  press: "표시된 곳을 눌러 주세요",
};

/**
 * 짚을 자리의 크기.
 *
 * 칸 하나가 아니라 **지금 그 칸에서 펼쳐져 있는 것까지** 잰다. 시간 피커나 날짜
 * 피커는 칸 아래로 떨어져 나오는데, 칸만 재면 펼쳐진 목록이 구멍 밖에 남아
 * 혼자 어둡게 깔린다(고르라고 해 놓고 안 보이게 덮는 꼴).
 *
 * `position: absolute|fixed`인 자손만 더한다. 그냥 넘치는 자손까지 더하면
 * 스크롤되는 목록(`overflow-y-auto`) 안쪽 내용의 높이까지 딸려 들어와 구멍이
 * 엉뚱하게 커진다.
 */
function measure(anchor: string): Rect | null {
  const el = document.querySelector<HTMLElement>(`[data-guide="${anchor}"]`);
  if (!el) return null;
  const base = el.getBoundingClientRect();
  if (base.width === 0 && base.height === 0) return null;

  let { top, left, bottom, right } = base;
  for (const child of el.querySelectorAll<HTMLElement>("*")) {
    const pos = getComputedStyle(child).position;
    if (pos !== "absolute" && pos !== "fixed") continue;
    const r = child.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    top = Math.min(top, r.top);
    left = Math.min(left, r.left);
    bottom = Math.max(bottom, r.bottom);
    right = Math.max(right, r.right);
  }

  return { top, left, width: right - left, height: bottom - top };
}

export function GuideCoachMark({
  step,
  classId,
  onClose,
  onSkipAll,
  onGo,
  onProgressMayChange,
  onFinish,
}: GuideCoachMarkProps) {
  const tour = GUIDE_TOURS[step];
  const [active, setActive] = useState<ResolvedStop>({ kind: "entry" });
  const [rect, setRect] = useState<Rect | null>(null);
  /*
    색상·시간처럼 **안 만져도 되는** 지점은 화면만 봐서는 「끝났다」를 알 수 없다.
    말풍선의 「이대로 좋아요」로 넘긴 것만 여기 담는다. 창이 닫히면 비운다 —
    다시 열었을 때 안내가 중간부터 시작하면 안 된다.
  */
  const [passed, setPassed] = useState<ReadonlySet<string>>(new Set());
  /** 지금 지점에서 「다음」을 눌러도 되는지 (이름을 적었는지 등) */
  const [ready, setReady] = useState(false);
  /** 막힌 곳을 눌렀을 때 짚은 자리를 한 번 흔들어 준다 */
  const [nudge, setNudge] = useState(0);
  /** 짚은 곳이 창 안에서 스크롤에 가려 있으면 한 번 끌어와 준다 */
  const scrolledTo = useRef<string | null>(null);

  /*
    화면은 계속 변한다 — 창이 열리고, 입력이 채워지고, 배율이 바뀐다.
    한 번 재고 끝낼 수 없어서 변화를 넓게 지켜본다.
  */
  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = resolveActiveStop(tour, passed);
        setActive(next);
        setRect(next.kind === "stop" ? measure(next.stop.anchor) : null);
        setReady(
          next.kind === "stop"
            ? isStopReady(
                next.stop,
                document.querySelector<HTMLElement>(
                  `[data-guide="${next.stop.anchor}"]`,
                ),
              )
            : false,
        );
        /*
          「이대로 좋아요」로 넘긴 기록은 **그 자리가 화면에 있는 동안만** 유효하다.
          창을 닫았다 다시 열면 색상·시간을 다시 물어봐야 한다 — 안 그러면 두 번째로
          만드는 반은 안내가 중간부터 시작한다.
        */
        setPassed((prev) => {
          if (!prev.size) return prev;
          const alive = new Set(
            [...prev].filter((id) => {
              const stop = tour.stops.find((s) => s.id === id);
              return stop
                ? Boolean(
                    document.querySelector(`[data-guide="${stop.anchor}"]`),
                  )
                : false;
            }),
          );
          return alive.size === prev.size ? prev : alive;
        });

        if (next.kind !== "stop") {
          scrolledTo.current = null;
          return;
        }
        /*
          모달 본문은 스크롤된다. 색상·요일·시간은 아래쪽이라 그냥 두면
          짚어 놓고 정작 그 자리가 화면 밖인 일이 생긴다. 지점이 바뀔 때 한 번만
          끌어온다(매번 하면 사용자가 스크롤할 때마다 도로 튕긴다).
        */
        const key = `${next.stop.id}`;
        if (scrolledTo.current !== key) {
          scrolledTo.current = key;
          const el = document.querySelector(
            `[data-guide="${next.stop.anchor}"]`,
          );
          /*
            화면보다 큰 자리(문제 구성처럼 목록이 딸린 섹션)를 가운데 맞추면
            시작 부분이 위로 밀려 올라간다. 그런 자리는 **위에서부터** 보게 한다.
          */
          const tall = (el?.getBoundingClientRect().height ?? 0) > window.innerHeight;
          el?.scrollIntoView({
            block: tall ? "start" : "center",
            behavior: "smooth",
          });
        }
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
  }, [tour, passed]);

  /* 마지막 지점까지 다 넘겼으면 알리고 안내를 내린다 */
  useEffect(() => {
    if (active.kind !== "done") return;
    onFinish?.();
    onClose();
  }, [active, onClose, onFinish]);

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

  /*
    **안내가 떠 있는 동안에는 짚은 곳 말고는 눌리지 않는다.**

    길을 열어 두면 안내를 반쯤 따라가다 딴 데를 눌러 흐름이 끊기고, 그때부터
    안내가 무슨 소리를 하는지 알 수 없게 된다. 나가고 싶으면 말풍선 아래
    「이 안내 닫기」나 「가이드 건너뛰기」로 나간다 — 길은 거기 하나뿐이다.

    덮개(div)를 깔지 않고 **캡처 단계에서 클릭만 집어삼킨다.** 덮개를 깔면 그 위에서
    휠이 막혀 모달 본문을 스크롤할 수 없다 — 정작 짚은 칸이 아래에 있을 때 곤란하다.

    지나가도 되는 것: 짚은 요소 **안쪽**(펼쳐지는 목록·날짜 피커가 그 안에 있다),
    말풍선 자신, 그리고 오른쪽 아래 시작 가이드 카드.
  */
  useEffect(() => {
    const allowed = (target: EventTarget | null): boolean => {
      const el = target instanceof Element ? target : null;
      if (!el) return false;
      if (el.closest("[data-guide-ui]")) return true;
      if (el.closest("[data-guide-panel]")) return true;
      if (active.kind !== "stop") return false;
      const anchor = document.querySelector(
        `[data-guide="${active.stop.anchor}"]`,
      );
      return Boolean(anchor?.contains(el));
    };

    const block = (e: Event) => {
      /*
        **Esc·Tab은 짚은 칸 안에서도 막는다.**

        창이 열리면 브라우저가 이름 칸에 포커스를 준다. 그 칸이 지금 짚은 곳이라
        「안쪽은 통과」 규칙에 걸려 Esc가 그대로 나갔고, 모달이 닫혀 버렸다
        (모달의 Esc 처리는 `window`에 붙어 있다). Tab도 같은 이유로 막는다 —
        짚지 않은 칸으로 옮겨 가면 안내와 화면이 어긋난다.
      */
      const key = (e as KeyboardEvent).key;
      const escapesGuide = key === "Escape" || key === "Tab";
      if (!escapesGuide && allowed(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      // 「왜 안 눌리지」로 끝나지 않게, 짚은 곳을 한 번 흔들어 알려 준다
      if (e.type === "click" || e.type === "keydown") setNudge((n) => n + 1);
    };

    /*
      **하나라도 빠지면 그리로 샌다.** 캘린더 빈칸은 `onPointerUp`으로 수업을 만드는데
      `pointerup`을 안 막아서 안내 중에도 수업이 만들어졌다. 리포에서 실제로 쓰는
      상호작용(`onPointerDown/Up/Move`·`onMouseDown`·`onKeyDown`·`onDragStart`·`onDrop`·
      `onContextMenu`·`onDoubleClick`)을 전부 덮는다.

      `wheel`은 일부러 뺐다 — 스크롤까지 막으면 짚은 칸이 화면 밖일 때 못 내려간다.
      `keydown`도 막는다: 탭으로 옮겨 다니거나 Esc로 창을 닫아 버리면 마찬가지다
      (짚은 칸 안에서 치는 글자는 통과하므로 이름은 그대로 적을 수 있다).
    */
    const types = [
      "pointerdown",
      "pointerup",
      "pointercancel",
      "mousedown",
      "mouseup",
      "click",
      "dblclick",
      "auxclick",
      "contextmenu",
      "touchstart",
      "touchend",
      "keydown",
      "keyup",
      "dragstart",
      "dragover",
      "drop",
    ];
    for (const t of types) document.addEventListener(t, block, true);
    return () => {
      for (const t of types) document.removeEventListener(t, block, true);
    };
  }, [active]);

  /*
    적던 칸에서 **엔터**를 치면 다음으로. 「다음」 버튼까지 마우스를 옮기게 하면
    적다 말고 손을 떼야 한다.

    `preventDefault`가 중요하다 — 이 칸들은 `<form>` 안이라 엔터가 그대로 제출로
    이어진다. 요일도 안 고른 채 「만들기」가 눌려 빨간 오류만 보게 된다.
  */
  useEffect(() => {
    if (active.kind !== "stop") return;
    const stop = active.stop;
    if (stop.advance !== "confirm") return;
    const el = document.querySelector<HTMLElement>(
      `[data-guide="${stop.anchor}"]`,
    );
    if (!el) return;
    const onKey = (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key !== "Enter" || ke.isComposing) return;
      if (!isStopReady(stop, el)) return;
      ke.preventDefault();
      ke.stopPropagation();
      setPassed((prev) => new Set(prev).add(stop.id));
      onProgressMayChange();
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
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

  if (active.kind === "done") return null;

  // ── 이 화면에 대상이 없을 때: 어디로 가야 하는지 알려준다 ──────────────────
  if (active.kind === "entry" || !rect) {
    return (
      <>
        {/* 여기서도 다른 곳은 눌리지 않는다 — 막혀 있다는 게 보여야 한다 */}
        <div
          aria-hidden
          className="fixed inset-0 z-[64] bg-[rgba(15,23,42,0.5)]"
        />
      <div
        data-guide-ui
        className="fixed bottom-5 right-5 z-[70] w-[300px] rounded-[16px] border border-[#E1E2E4] bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,0.14)]"
      >
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
      </>
    );
  }

  const { stop, index, total } = active;
  const PAD = 8;
  /*
    **구멍을 화면 안으로 눌러 담는다.**

    짚는 자리가 화면보다 크면(문제 구성처럼 목록이 딸린 섹션은 1500px가 넘는다)
    구멍이 화면을 통째로 덮어 **테두리도 딤도 하나도 안 보인다** — 안내가 사라진 것과
    같다. 보이는 만큼만 테두리를 둘러 「여기서 하시면 돼요」를 남긴다.
    막는 범위는 그대로 실제 요소 기준이라 스크롤해서 아래쪽을 만져도 된다.
  */
  const hole = clampToViewport(rect, PAD);
  const place = placeTip(hole);
  const tipStyle = { top: place.top, left: place.left };

  return (
    <>
      {/*
        구멍 뚫린 딤 — `box-shadow`를 화면만큼 퍼뜨려 짚은 곳만 남긴다.
        **`pointer-events: none`**: 딤이 클릭을 먹으면 정작 그 버튼을 못 누른다.
        「반강제」라도 길은 막지 않는다.
      */}
      <div
        aria-hidden
        key={nudge}
        className="pointer-events-none fixed z-[65] rounded-[12px] transition-all duration-200"
        style={{
          top: hole.top,
          left: hole.left,
          width: hole.width,
          height: hole.height,
          boxShadow: "0 0 0 9999px rgba(15,23,42,0.5)",
          outline: "3px solid #1AA7F2",
          animation: nudge ? "guide-nudge 0.5s ease-in-out" : undefined,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed z-[70] animate-pulse text-[24px] leading-none"
        style={ARROW_POS[place.side](hole)}
      >
        {ARROW_GLYPH[place.side]}
      </div>

      <div
        data-guide-ui
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
        {ASK[stop.advance] ? (
          <p className="mt-2 text-[11.5px] font-bold text-[#1AA7F2]">
            {ASK[stop.advance]}
          </p>
        ) : null}
        {/*
          누르는 지점(`press`)만 빼고 **모두 「다음」으로 넘어간다.** 값이 채워지자마자
          자동으로 넘기지 않는다 — 잘못 골랐을 때 되돌릴 틈이 없다.
        */}
        {hasNextButton(stop) ? (
          <button
            type="button"
            disabled={!ready}
            className="mt-2.5 w-full rounded-[9px] border border-[#D6E9F7] bg-[#F2FAFF] py-2 text-[12px] font-bold text-[#1274A9] hover:border-[#1AA7F2] hover:bg-[#EAF6FE] disabled:border-[#E8E9EB] disabled:bg-[#F5F6F7] disabled:text-[#9CA3AF]"
            onClick={() => {
              setPassed((prev) => new Set(prev).add(stop.id));
              onProgressMayChange();
            }}
          >
            {ready ? "다음" : (stop.notReadyLabel ?? "먼저 위 칸을 채워 주세요")}
          </button>
        ) : null}
        {skipRow}
      </div>
    </>
  );
}
