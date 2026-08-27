"use client";

import type { StartGuideStepId } from "@/lib/teacher-onboarding";

/**
 * **세부 안내(투어)** — 큰 단계 하나를 화면 위의 여러 지점으로 쪼갠 것.
 *
 * 「이 버튼을 누르세요」에서 끝내지 않고 창이 열린 뒤 「여기에 반 이름을 적으세요」까지
 * 이어서 짚는다. 대신 눌러 주지 않는 이유와 같다 — 한 번 따라 해 봐야 다음에 혼자 한다.
 *
 * ## 어느 지점을 짚을지 어떻게 정하나
 *
 * 순서대로 넘기는 상태 기계를 두지 않는다. 그러면 사용자가 중간에 창을 닫거나 뒤로
 * 가면 안내가 엉뚱한 곳을 가리킨 채 남는다. 대신 **매번 화면을 보고 다시 고른다**:
 *
 *   1. 각 지점의 `anchor`가 지금 화면에 있는지 본다(`data-guide` 표식).
 *   2. **뒤쪽 지점의 anchor가 보이면 앞쪽은 이미 지난 것**으로 친다.
 *      (창이 열렸으면 「창을 여는 버튼」은 지난 단계다)
 *   3. 남은 것 중 **아직 안 끝난 첫 지점**을 짚는다.
 *
 * 그래서 사용자가 창을 닫으면 자동으로 앞 단계로 돌아가고, 입력을 채우면 다음으로
 * 넘어간다. 코드가 사용자를 따라가지, 사용자를 끌고 가지 않는다.
 */
export type GuideStop = {
  id: string;
  /** 짚을 요소의 `data-guide` */
  anchor: string;
  title: string;
  body: string;
  /**
   * 이 지점이 끝났는지 판단하는 법.
   * - `filled`: 입력 칸에 값이 들어감
   * - `chosen`: 선택 칸에서 값을 고름(빈 값 아님)
   * - `press`: 눌러야 넘어감 — 뒤쪽 anchor가 나타나야 지난 것으로 친다
   */
  advance: "filled" | "chosen" | "press";
};

export type GuideTour = {
  step: StartGuideStepId;
  /** 이 단계를 시작하려면 있어야 하는 화면. 없으면 이동 버튼을 준다 */
  entry: { note: string; cta: string; href: (classId: string) => string };
  stops: readonly GuideStop[];
};

export const GUIDE_TOURS: Record<StartGuideStepId, GuideTour> = {
  "create-class": {
    step: "create-class",
    entry: {
      note: "반은 캘린더 화면에서 만들어요.",
      cta: "캘린더로 가기",
      href: () => "/teacher",
    },
    stops: [
      {
        id: "open",
        anchor: "create-class",
        title: "① 새 반 추가를 눌러 주세요",
        body: "왼쪽 사이드바 아래에 있어요. 누르면 반을 만드는 창이 열립니다.",
        advance: "press",
      },
      {
        id: "name",
        anchor: "class-name",
        title: "② 반 이름을 적어 주세요",
        body: "선생님이 알아볼 이름이면 됩니다. 「중3 3반」처럼요. 학생에게도 이 이름으로 보여요.",
        advance: "filled",
      },
      {
        id: "grade",
        anchor: "class-grade",
        title: "③ 학년을 골라 주세요",
        body: "문제를 낼 때 이 학년의 교과서 단원이 먼저 뜹니다.",
        advance: "chosen",
      },
      {
        id: "save",
        anchor: "class-save",
        title: "④ 만들기를 눌러 주세요",
        body: "저장하면 반이 생기고, 학생을 부를 초대 코드가 함께 만들어집니다.",
        advance: "press",
      },
    ],
  },

  "invite-students": {
    step: "invite-students",
    entry: {
      note: "초대 코드는 반 홈에 있어요.",
      cta: "반 홈으로 가기",
      href: (classId) => `/teacher/classes/${classId}`,
    },
    stops: [
      {
        id: "code",
        anchor: "invite-code",
        title: "이 코드를 학생에게 알려주세요",
        body: "학생이 앱에서 이 여섯 자리를 넣으면 반에 들어옵니다. 옆의 「복사」를 누르면 클립보드에 담겨요. 한 명만 들어와도 다음 단계로 넘어갑니다.",
        advance: "press",
      },
    ],
  },

  assign: {
    step: "assign",
    entry: {
      note: "과제는 문제를 고르는 것부터 시작해요.",
      cta: "문제 출제로 가기",
      href: () => "/teacher/problems",
    },
    stops: [
      {
        id: "menu",
        anchor: "problems-submit",
        title: "① 문제 출제를 눌러 주세요",
        body: "왼쪽 「문제 관리」 안에 있어요.",
        advance: "press",
      },
      {
        id: "unit",
        anchor: "problem-unit",
        title: "② 학년·교과서·단원을 고르세요",
        body: "고른 단원의 단어·문장·문법이 아래에 나옵니다.",
        advance: "press",
      },
      {
        id: "submit",
        anchor: "problem-submit",
        title: "③ 제출하기를 눌러 주세요",
        body: "낼 문항을 고른 뒤 누르면, 어느 반에 언제까지 낼지 정하는 화면으로 넘어갑니다.",
        advance: "press",
      },
    ],
  },

  review: {
    step: "review",
    entry: {
      note: "현황은 반 화면의 「과제」 탭에서 봐요.",
      cta: "반으로 가기",
      href: (classId) => `/teacher/classes/${classId}`,
    },
    stops: [
      {
        id: "tab",
        anchor: "assignments-tab",
        title: "「과제」 탭을 눌러 주세요",
        body: "낸 과제마다 누가 풀었고 몇 점인지, 아직 안 낸 학생은 누구인지 한눈에 보입니다.",
        advance: "press",
      },
    ],
  },
};

/** 지금 화면에 그 요소가 있나 */
function anchorEl(anchor: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-guide="${anchor}"]`);
}

function isDone(stop: GuideStop, el: HTMLElement | null): boolean {
  if (!el) return false;
  if (stop.advance === "filled") {
    return Boolean((el as HTMLInputElement).value?.trim());
  }
  if (stop.advance === "chosen") {
    return Boolean((el as HTMLSelectElement).value);
  }
  return false; // press는 뒤쪽 anchor가 나타나야 지난 것으로 본다
}

export type ResolvedStop =
  | { kind: "stop"; stop: GuideStop; index: number; total: number }
  | { kind: "entry" };

/**
 * 지금 짚어야 할 지점을 **화면을 보고** 고른다. 자세한 규칙은 파일 위 주석 참고.
 */
export function resolveActiveStop(tour: GuideTour): ResolvedStop {
  const els = tour.stops.map((s) => anchorEl(s.anchor));
  const presentIdx = els
    .map((el, i) => (el ? i : -1))
    .filter((i) => i >= 0);

  if (presentIdx.length === 0) return { kind: "entry" };

  // 뒤쪽 지점이 보이면 앞쪽은 이미 지났다
  const frontier = presentIdx[presentIdx.length - 1]!;

  for (const i of presentIdx) {
    if (i < frontier) continue;
    if (isDone(tour.stops[i]!, els[i]!)) continue;
    return {
      kind: "stop",
      stop: tour.stops[i]!,
      index: i,
      total: tour.stops.length,
    };
  }

  // frontier까지 다 끝났으면 마지막 지점을 계속 짚는다(누를 차례)
  return {
    kind: "stop",
    stop: tour.stops[frontier]!,
    index: frontier,
    total: tour.stops.length,
  };
}
