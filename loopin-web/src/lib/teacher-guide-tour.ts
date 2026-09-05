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
 * 가면 안내가 엉뚱한 곳을 가리킨 채 남는다. 대신 **매번 화면을 보고 앞에서부터
 * 훑어, 아직 안 끝난 첫 지점**을 짚는다.
 *
 *   1. 각 지점의 `anchor`가 지금 화면에 있는지 본다(`data-guide` 표식).
 *   2. anchor가 없는데 **뒤쪽 지점의 anchor가 보이면** 그 지점은 지난 것으로 친다.
 *   3. 남은 것 중 **아직 안 끝난 첫 지점**을 짚는다.
 *
 * 예전에는 「보이는 것 중 가장 뒤쪽」을 기준으로 삼았는데, 모달이 열리면 이름·학년·
 * 색상·요일·시간·만들기 anchor가 **한꺼번에** 나타나므로 곧장 마지막 「만들기」를
 * 짚고 중간 안내를 통째로 건너뛰었다. 앞에서부터 훑어야 한 칸씩 따라간다.
 *
 * ## 「끝났다」를 무엇으로 보나 (`advance`)
 *
 * | 값 | 판정 |
 * |---|---|
 * | `confirm` | 채운 뒤 **「다음」을 눌러야** 넘어간다. 입력 칸이면 엔터도 된다 |
 * | `optional` | `confirm`과 같되 **기본값이 이미 있어**(색상·시간) 안 만져도 「다음」이 켜져 있다 |
 * | `press` | 눌러야 넘어감 — **뒤쪽 anchor가 나타나야** 지난 것으로 친다 |
 *
 * **고르자마자 넘어가지 않는다.** 예전에는 학년을 고르거나 색을 누르면 그 자리에서
 * 다음으로 튀었는데, 잘못 골랐을 때 되돌릴 틈이 없고 화면이 제멋대로 움직이는 것처럼
 * 보인다. 넘어가는 시점은 언제나 사용자가 정한다.
 */
export type GuideStop = {
  id: string;
  /** 짚을 요소의 `data-guide` */
  anchor: string;
  title: string;
  body: string;
  /** 이 지점이 끝났는지 판단하는 법 — 파일 위 표 참고 */
  advance: "confirm" | "optional" | "press";
  /** 아직 넘어갈 수 없을 때 「다음」 자리에 뜨는 글씨 */
  notReadyLabel?: string;
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
    /*
      반은 창 하나로 안 끝난다. 「만들기」를 누르면 **수업 기간 설정**이 이어서
      뜨고, 거기서 확인을 눌러야 실제로 만들어진다. 그래서 투어도 거기까지 간다.
    */
    stops: [
      {
        id: "open",
        anchor: "create-class",
        title: "새 반 추가를 눌러 주세요",
        body: "왼쪽 사이드바 아래에 있어요. 누르면 반을 만드는 창이 열립니다.",
        advance: "press",
      },
      {
        id: "name",
        anchor: "class-name",
        title: "반 이름을 적어 주세요",
        body: "선생님이 알아볼 이름이면 됩니다. 「중3 3반」처럼요. 학생에게도 이 이름으로 보여요. 다 적었으면 엔터를 치거나 아래를 눌러 주세요.",
        advance: "confirm",
      },
      {
        id: "grade",
        anchor: "class-grade",
        title: "학년을 골라 주세요",
        body: "문제를 낼 때 이 학년의 교과서 단원이 먼저 뜹니다.",
        advance: "confirm",
        notReadyLabel: "먼저 학년을 골라 주세요",
      },
      {
        id: "color",
        anchor: "class-color",
        title: "반 색을 골라 주세요",
        body: "캘린더에서 이 색으로 표시돼요. 반이 여러 개면 색으로 구분합니다.",
        advance: "optional",
      },
      {
        id: "days",
        anchor: "class-days",
        title: "수업 요일을 골라 주세요",
        body: "여러 개 고를 수 있어요. 고른 요일이 캘린더에 매주 반복해서 들어갑니다. 다 골랐으면 아래를 눌러 주세요.",
        advance: "confirm",
        notReadyLabel: "요일을 하나 이상 골라 주세요",
      },
      {
        id: "time",
        anchor: "class-time",
        title: "수업 시간을 정해 주세요",
        body: "요일마다 시간이 다르면 「요일마다 따로」를 누르세요. 기본값(09:00–09:50) 그대로 두셔도 됩니다.",
        advance: "optional",
      },
      {
        id: "save",
        anchor: "class-save",
        title: "만들기를 눌러 주세요",
        body: "누르면 수업 기간을 정하는 창이 이어서 뜹니다.",
        advance: "press",
      },
      {
        id: "period-name",
        anchor: "period-name",
        title: "기간 이름을 적어 주세요",
        body: "「1학기」처럼 이 수업이 이어지는 기간의 이름이에요. 나중에 학기가 바뀌면 기간을 새로 추가합니다.",
        advance: "confirm",
      },
      {
        id: "period-start",
        anchor: "period-start",
        title: "개강일을 골라 주세요",
        body: "이 날짜부터 캘린더에 수업이 표시돼요.",
        advance: "confirm",
        notReadyLabel: "먼저 날짜를 골라 주세요",
      },
      {
        id: "period-end",
        anchor: "period-end",
        title: "종강일도 골라 주세요",
        body: "학기가 끝나는 날이에요. 비워 두면 개강일 다음 해 2월 말까지 수업이 캘린더에 계속 만들어집니다. 끝나는 날을 알면 지금 정해 두는 편이 좋아요.",
        advance: "optional",
      },
      {
        id: "period-save",
        anchor: "period-save",
        title: "확인을 눌러 주세요",
        body: "이제 반이 만들어지고, 학생을 부를 초대 코드가 함께 생깁니다.",
        advance: "press",
      },
    ],
  },

  "invite-students": {
    step: "invite-students",
    entry: {
      note: "초대 코드는 반 홈에 있어요.",
      cta: "캘린더로 가기",
      href: () => "/teacher",
    },
    stops: [
      {
        id: "open-class",
        anchor: "class-list",
        title: "반을 눌러 주세요",
        body: "왼쪽 「담당 반」에서 방금 만든 반을 누르면 반 홈이 열려요. 학년 묶음이 접혀 있으면 먼저 펴 주세요.",
        advance: "press",
      },
      {
        id: "code",
        anchor: "invite-code",
        title: "학생 초대 코드가 여기 있어요",
        body: "이 여섯 자리를 학생에게 알려주세요. 학생이 앱에 넣으면 반에 들어옵니다. 옆의 「복사」로 클립보드에 담을 수 있고, 반 홈에 늘 있으니 나중에 다시 와도 됩니다.",
        advance: "optional",
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
    /*
      **제출하기로 곧장 데려가지 않는다.** 그 버튼은 교과서 범위·받는 반이 정해져야
      눌리고, 유형을 안 고르면 낼 문항이 없다. 세 칸을 차례로 채우게 한 뒤 마지막에 낸다.
    */
    stops: [
      {
        id: "menu",
        anchor: "problems-submit",
        title: "문제 제출을 눌러 주세요",
        body: "왼쪽 「문제 관리」 안에 있어요.",
        advance: "press",
      },
      {
        id: "range",
        anchor: "problem-range",
        title: "교과서 범위를 정해 주세요",
        body: "학년·교과서·단원을 차례로 고르면 그 단원의 단어·문장·문법이 아래에 뜹니다. 단원까지 골라야 다음으로 넘어가요.",
        advance: "confirm",
        notReadyLabel: "단원까지 골라 주세요",
      },
      {
        id: "classes",
        anchor: "problem-classes",
        title: "받는 반을 골라 주세요",
        body: "이 문제를 낼 반이에요. 여러 반에 한꺼번에 낼 수도 있습니다.",
        advance: "confirm",
        notReadyLabel: "반을 하나 이상 골라 주세요",
      },
      {
        id: "types",
        anchor: "problem-types",
        title: "어떤 유형으로 낼지 보세요",
        body: "유형은 처음부터 전부 켜져 있어요. 빼고 싶은 것만 끄면 됩니다. 그 아래에서 낼 문항을 고르세요 — 고른 유형만 학생 앱에 나갑니다.",
        advance: "confirm",
        notReadyLabel: "유형을 하나 이상 골라 주세요",
      },
      {
        id: "split",
        anchor: "problem-split",
        title: "한 단원을 나눠 낼 수도 있어요",
        body: "「분할하기」를 누르면 2·3·4 등분이 나옵니다. 나누면 목록 위에 파트 줄이 생기고 그중 하나만 이번에 나가요. 나눈 동안에는 문항 체크가 파트에 맞춰 고정됩니다. 나머진 반 홈 「이어서 내기」로 다음 파트를 고를 수 있어요. 한 번에 다 내려면 그냥 두시면 돼요.",
        advance: "optional",
      },
      {
        id: "submit",
        anchor: "problem-submit",
        title: "이제 내주면 됩니다",
        body: "「제출하기」는 어느 날짜에 낼지 정하는 화면으로 넘어가고, 「빠른 제출하기」는 지금 바로 내고 마감을 다음 수업 전까지로 잡아 줍니다. 둘 중 하나를 눌러 주세요.",
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
  const el = document.querySelector<HTMLElement>(`[data-guide="${anchor}"]`);
  if (!el) return null;
  // 숨겨진 채로 DOM에 남아 있는 것은 없는 것으로 본다
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0 ? el : null;
}

/**
 * 이 지점에서 「다음」을 눌러도 되는 상태인가 — 말풍선 버튼을 켤지 끌지.
 *
 * 입력 칸이면 값이 있어야 하고, 그 밖(요일 묶음 같은 것)은 화면이 달아 준
 * `data-guide-done`을 본다. `optional`은 언제든 넘어갈 수 있다.
 */
export function isStopReady(stop: GuideStop, el: HTMLElement | null): boolean {
  if (stop.advance === "optional") return true;
  if (!el) return false;
  const value = (el as HTMLInputElement).value;
  if (typeof value === "string") return Boolean(value.trim());
  return el.dataset.guideDone === "true";
}

/** 이 지점에 「다음」 버튼이 있나 */
export function hasNextButton(stop: GuideStop): boolean {
  return stop.advance !== "press";
}

/**
 * `press`가 아니면 **오직 사용자가 넘긴 것만** 지난 것으로 본다.
 *
 * 값이 채워졌다고 자동으로 넘기지 않는다 — 한 글자만 쳐도, 색을 한 번 눌러 보기만
 * 해도 다음으로 튀던 문제. `press`는 뒤쪽 anchor가 나타나야 지난 것으로 본다.
 */
function isDone(stop: GuideStop, passed: ReadonlySet<string>): boolean {
  return stop.advance !== "press" && passed.has(stop.id);
}

export type ResolvedStop =
  | { kind: "stop"; stop: GuideStop; index: number; total: number }
  | { kind: "entry" }
  /** 마지막 지점까지 다 넘겼다 — 안내를 내린다 */
  | { kind: "done" };

/**
 * 지금 짚어야 할 지점을 **화면을 보고** 고른다. 자세한 규칙은 파일 위 주석 참고.
 *
 * @param passed 말풍선에서 사용자가 직접 넘긴 지점들(`optional`)
 */
export function resolveActiveStop(
  tour: GuideTour,
  passed: ReadonlySet<string> = new Set(),
): ResolvedStop {
  const els = tour.stops.map((s) => anchorEl(s.anchor));
  if (els.every((el) => !el)) return { kind: "entry" };

  const laterExists = (i: number) => els.slice(i + 1).some(Boolean);
  const at = (i: number): ResolvedStop => ({
    kind: "stop",
    stop: tour.stops[i]!,
    index: i,
    total: tour.stops.length,
  });

  for (let i = 0; i < tour.stops.length; i += 1) {
    const stop = tour.stops[i]!;
    const el = els[i];

    if (!el) {
      // 화면에 없다: 뒤쪽이 보이면 이미 지난 것, 아니면 아직 못 온 것
      if (laterExists(i)) continue;
      return { kind: "entry" };
    }
    if (stop.advance === "press") {
      if (laterExists(i)) continue; // 눌러서 다음이 열렸다
      return at(i);
    }
    if (isDone(stop, passed)) continue;
    return at(i);
  }

  /*
    여기까지 왔다는 건 마지막 지점까지 전부 넘겼다는 뜻이다.
    (`press`로 끝나는 투어는 여기 오지 않는다 — 누를 것이 남아 있으면 그 자리에서 멈춘다)
  */
  return { kind: "done" };
}
