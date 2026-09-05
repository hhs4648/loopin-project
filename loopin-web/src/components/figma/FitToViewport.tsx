"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";

/**
 * 고정 크기 설계 캔버스를 **어떤 화면에서도 잘리지 않게** 넣는다.
 *
 * ## 왜 필요한가
 *
 * 교사 웹은 Figma에서 뽑은 1557×973 SVG 위에 요소를 좌표로 얹는다. 이 크기는
 * 웬만한 노트북 뷰포트보다 크다 — 맥북 에어(브라우저 크롬 빼면 약 1470×840),
 * 1366×768 노트북, 심지어 1080p 데스크탑(약 1920×940)도 세로가 모자란다.
 * 그대로 두면 화면 밖으로 나간 부분이 잘리고, 모달이 반쯤 걸쳐 보인다.
 *
 * ## 어떻게
 *
 * `min(1, 가로비, 세로비)`로 배율을 잡아 캔버스 전체를 화면 안에 넣는다.
 * 키우지는 않는다(≤1) — 큰 모니터에서는 지금 보이던 크기 그대로다.
 *
 * **`zoom`이 아니라 `transform: scale()`을 쓴다.** `zoom`은 레이아웃을 다시
 * 계산해서 HTML 요소가 배경 SVG와 1px씩 어긋난다. 좌표로 얹는 구조에서는
 * 어긋남이 바로 보이므로, SVG와 요소를 **똑같은 비율로** 함께 줄이는 쪽을 택했다.
 *
 * ## 축소하면 달라지는 것
 *
 * `transform`은 자손 `position: fixed`의 기준을 뷰포트에서 이 캔버스로 바꾼다.
 * 캔버스 안 모달은 캔버스를 덮으면 되므로 오히려 일관돼진다(예전엔 `absolute
 * inset-0` 모달과 `fixed inset-0` 모달이 서로 다른 곳을 기준으로 삼았다).
 * 다만 `getBoundingClientRect()`로 좌표를 재서 `fixed`에 넣는 코드는 변환이
 * 필요하다 — `@/lib/frame-scale`의 `clientToFrame()`을 쓴다.
 *
 * 가이드 코치마크(`GuideCoachMark`)는 캔버스 **바깥**(레이아웃)에 있어서
 * 화면 좌표를 그대로 쓰면 된다. 축소돼도 `getBoundingClientRect()`가 줄어든
 * 실제 위치를 주므로 스포트라이트는 저절로 따라간다.
 */

/**
 * 이보다 더 줄이지는 않는다. 글자가 읽히지 않으면 다 보여도 소용없다
 * (uiux.md §1.2 「흐림 금지」). 여기까지 줄여도 안 들어가는 화면에서는
 * 스크롤로 나머지를 본다 — 그래서 바깥은 `overflow-auto`, 가운데 정렬은
 * `justify-center`가 아니라 `margin: auto`다(`justify-center`는 넘친 쪽
 * 왼쪽·위가 스크롤로 닿지 않는다).
 */
const MIN_SCALE = 0.6;

/** 브라우저 창 크기가 미세하게 흔들려도 다시 그리지 않게 */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function FitToViewport({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: ReactNode;
}) {
  /*
    서버에서는 화면 크기를 모른다. 1로 그려 두고 하이드레이션 직후
    페인트 전에(`useLayoutEffect`) 맞춘다 — 깜빡임 없이 바뀐다.
  */
  const [scale, setScale] = useState(1);

  useIsomorphicLayoutEffect(() => {
    const compute = () => {
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh =
        window.visualViewport?.height ||
        document.documentElement.clientHeight ||
        window.innerHeight;
      if (!vw || !vh) return;
      const fit = Math.min(1, vw / width, vh / height);
      setScale(round(Math.max(MIN_SCALE, fit)));
    };

    compute();
    window.addEventListener("resize", compute);
    // 핀치 줌(모바일·트랙패드)은 visualViewport로만 알 수 있다
    window.visualViewport?.addEventListener("resize", compute);
    /*
      브라우저 확대/축소(Ctrl +/-)는 resize를 쏘기도, 안 쏘기도 한다.
      레이아웃 뷰포트 자체를 지켜보면 어느 쪽이든 잡힌다.
    */
    const ro = new ResizeObserver(compute);
    ro.observe(document.documentElement);

    return () => {
      window.removeEventListener("resize", compute);
      window.visualViewport?.removeEventListener("resize", compute);
      ro.disconnect();
    };
  }, [width, height]);

  return (
    <div
      className="relative m-auto shrink-0"
      style={{ width: width * scale, height: height * scale }}
    >
      <div
        data-frame-root
        className="absolute left-0 top-0"
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
