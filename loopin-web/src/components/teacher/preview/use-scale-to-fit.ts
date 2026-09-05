"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * 상자보다 큰 내용을 **통째로 scale** 해서 한눈에 넣는다.
 *
 * `useShrinkToFit`은 글씨만 줄인다. 본문 미리보기의 조각 버튼은 패딩·테두리까지
 * 자리를 먹어서, 글씨만 줄여서는 문제 전체가 안 보인다. 미리보기는 느낌만
 * 주는 화면이라 픽셀이 작아져도 된다.
 */
export function useScaleToFit(
  boxRef: RefObject<Element | null>,
  contentRef: RefObject<HTMLElement | null>,
  deps: unknown[],
  options: { minScale?: number } = {},
): void {
  const { minScale = 0.28 } = options;
  const minScaleRef = useRef(minScale);
  minScaleRef.current = minScale;

  useLayoutEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content) return;

    const fit = () => {
      content.style.transform = "none";
      const scaleW =
        content.scrollWidth > 0 ? box.clientWidth / content.scrollWidth : 1;
      const scaleH =
        content.scrollHeight > 0 ? box.clientHeight / content.scrollHeight : 1;
      const scale = Math.min(1, scaleW, scaleH);
      const clamped = Math.max(minScaleRef.current, scale);
      content.style.transformOrigin = "top center";
      content.style.transform = clamped < 0.999 ? `scale(${clamped})` : "none";
    };

    fit();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    observer.observe(content);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
