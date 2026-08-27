"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * 내용이 상자를 넘치면 **글씨를 줄여 다 보이게** 한다.
 *
 * 미리보기의 지문 상자는 시안 좌표로 크기가 고정돼 있어서, 예전에는 `line-clamp-2`로
 * 두 줄만 남기고 잘랐다. 선생님이 미리보기를 여는 이유가 「학생에게 이렇게 나간다」를
 * 확인하는 것인데, 정작 본문이 잘려 보이면 확인이 안 된다.
 *
 * 상자를 늘리는 방법도 있지만 아래 요소들과 겹치므로 **글씨를 줄이는 쪽**으로 간다.
 * 학생 앱의 `use-shrink-to-fit.ts`와 같은 규칙이다 — 한쪽만 고치면 미리보기와 실제
 * 화면이 달라 보이므로, 저쪽을 바꾸면 여기도 같이 봐야 한다.
 *
 * 학생 앱과 다른 점은 하한선뿐이다. 미리보기는 확대해서 들여다보는 화면이라
 * 더 작아져도 읽을 수 있어서 `minScale`을 낮게 잡는다.
 */
export function useShrinkToFit(
  boxRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  deps: unknown[],
  options: { minScale?: number } = {},
): void {
  const { minScale = 0.4 } = options;
  const minScaleRef = useRef(minScale);
  minScaleRef.current = minScale;

  useLayoutEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content) return;

    const fit = () => {
      // 기준 크기로 되돌리고 시작한다 — 안 그러면 이전 회차의 축소가 누적된다
      content.style.fontSize = "";
      const base = Number.parseFloat(getComputedStyle(content).fontSize);
      if (!Number.isFinite(base) || base <= 0) return;

      /*
        글씨를 줄이면 줄바꿈이 달라져서 한 번에 안 맞는다. 넘친 비율만큼 줄이고
        다시 재기를 몇 번 반복하면 수렴한다. 6번이면 충분하다.
      */
      let scale = 1;
      for (let i = 0; i < 6; i += 1) {
        const avail = box.clientHeight;
        const need = content.scrollHeight;
        if (need <= avail + 0.5) break;
        const next = Math.max(minScaleRef.current, scale * (avail / need));
        if (Math.abs(next - scale) < 0.005) {
          scale = next;
          break;
        }
        scale = next;
        content.style.fontSize = `${base * scale}px`;
      }
    };

    fit();

    if (typeof ResizeObserver === "undefined") return;
    // 미리보기 모달은 크기가 변한다(창 크기·좌우 스크롤) — 그때 다시 맞춘다
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
