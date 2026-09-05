/**
 * 교사 웹은 **고정 크기 설계 캔버스**(1557×973) 위에 요소를 좌표로 얹는 구조다.
 * 화면이 그보다 작으면 캔버스를 통째로 축소해서 넣는다(`FitToViewport`).
 *
 * 축소는 `transform: scale()`로 한다. 그래서 캔버스 안에서는
 *
 * - `position: fixed`가 **뷰포트가 아니라 캔버스** 기준이 되고,
 * - `getBoundingClientRect()`는 여전히 **화면 좌표**(축소된 값)를 돌려준다.
 *
 * 둘을 섞어 쓰면 메뉴·팝오버가 엉뚱한 자리에 뜬다. 화면 좌표를 캔버스 좌표로
 * 바꿔야 할 때 이 헬퍼를 쓴다.
 */

export type FrameBox = {
  /** 화면에서 캔버스 왼쪽 위 */
  left: number;
  top: number;
  /** 설계 픽셀 기준 캔버스 크기 */
  width: number;
  height: number;
  /** 지금 적용된 축소 배율 */
  scale: number;
};

/** 지금 화면의 캔버스를 잰다. 캔버스 밖(로그인 등)이면 `null` */
export function readFrameBox(): FrameBox | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>("[data-frame-root]");
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  if (!width || !height) return null;
  return {
    left: rect.left,
    top: rect.top,
    width,
    height,
    scale: rect.width / width,
  };
}

/**
 * 화면 좌표 → 캔버스 좌표.
 * 캔버스가 없으면 그대로 돌려준다 — 축소 이전과 같게 동작한다.
 */
export function clientToFrame(
  x: number,
  y: number,
): { x: number; y: number; box: FrameBox | null } {
  const box = readFrameBox();
  if (!box || !box.scale) return { x, y, box: null };
  return {
    x: (x - box.left) / box.scale,
    y: (y - box.top) / box.scale,
    box,
  };
}

/**
 * 오버레이(모달·토스트)를 붙일 자리.
 *
 * `document.body`에 붙이면 캔버스 **밖**이라 축소가 안 걸린다. 앱은 0.65배로
 * 줄어 있는데 모달만 원래 크기로 뜨면 따로 논다. 캔버스 안에 붙여야 배율이 맞고,
 * `inset-0`도 캔버스를 덮는다. 캔버스가 없는 화면(로그인)에서는 `body`로 떨어진다.
 */
export function overlayRoot(): HTMLElement {
  if (typeof document === "undefined") {
    throw new Error("overlayRoot()는 브라우저에서만 쓴다");
  }
  return (
    document.querySelector<HTMLElement>("[data-frame-root]") ?? document.body
  );
}
