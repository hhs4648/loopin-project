"use client";

import { fetchClassEnrollments } from "@/lib/sync/teacher-sync";
import { loadClassAssignments } from "@/lib/class-assignments";
import { loadTeacherClasses, type TeacherClass } from "@/lib/teacher-classes";

/**
 * 처음 들어온 선생님을 위한 **시작 가이드**의 상태.
 *
 * 설계 두 가지가 핵심이다.
 *
 * 1. **완료 여부를 저장하지 않는다.** 실제 데이터로 그때그때 판정한다.
 *    「봤음」 플래그를 저장하면 기기를 바꾸거나 저장소를 비웠을 때 이미 끝낸 일을
 *    처음부터 다시 시킨다(학생 앱에서 실제로 겪은 문제다 — HANDOFF §11).
 *    반이 있으면 반 만들기는 끝난 것이다. 그걸 기억할 이유가 없다.
 *
 * 2. **Figma 좌표에 묶지 않는다.** 교사 웹은 SVG 프레임 위에 좌표로 요소를 얹는
 *    구조라, 화면을 짚어 주는 스포트라이트는 프레임을 새로 export할 때마다 어긋난다.
 *    가이드는 프레임 위에 뜨는 일반 DOM으로 둔다.
 */

const STORAGE_KEY = "haksup-teacher-onboarding";

export type StartGuideStepId =
  | "create-class"
  | "invite-students"
  | "assign"
  | "review";

export type StartGuideStep = {
  id: StartGuideStepId;
  title: string;
  /** 왜 해야 하는지 한 줄 — 무엇을 누르라고만 하면 다음에 또 못 찾는다 */
  hint: string;
  /** 눌렀을 때 갈 곳. 없으면 가이드 안에서 처리한다(반 만들기 모달·초대코드 복사) */
  href?: string;
  cta: string;
};

export const START_GUIDE_STEPS: readonly StartGuideStep[] = [
  {
    id: "create-class",
    title: "반 만들기",
    hint: "반을 만들면 초대 코드가 함께 생겨요.",
    cta: "반 만들기",
  },
  {
    id: "invite-students",
    title: "학생 초대하기",
    hint: "학생이 앱에서 이 코드를 넣으면 반에 들어와요.",
    cta: "초대 코드 복사",
  },
  {
    id: "assign",
    title: "과제 내주기",
    hint: "문제를 고르고 반과 날짜를 정하면 학생 앱에 나타나요.",
    // 과제 부여 화면(`/teacher/problems/assign`)은 초안이 없으면 되튕긴다.
    // 문제 출제부터 시작해야 실제로 이어진다.
    href: "/teacher/problems",
    cta: "문제 고르러 가기",
  },
  {
    id: "review",
    title: "과제 현황 보기",
    hint: "누가 풀었고 몇 점인지 반의 「과제」 탭에서 봅니다.",
    cta: "과제 탭 열기",
  },
] as const;

/** 저장하는 것은 **접힘 여부와 ④ 방문 기록뿐**이다 */
type StoredState = {
  /** 인사 카드를 이미 봤는지 */
  greeted?: boolean;
  /** 「나중에」로 접어 뒀는지 */
  collapsed?: boolean;
  /** 과제 현황(반 → 과제 탭)을 연 적이 있는지 — 이것만은 데이터로 알 수 없다 */
  reviewedAt?: string;
  /** 다 끝내고 닫았는지 */
  dismissed?: boolean;
};

function read(): StoredState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredState) : {};
  } catch {
    return {};
  }
}

function write(next: StoredState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 저장소를 못 쓰는 환경 — 가이드가 매번 떠도 동작에는 지장 없다 */
  }
}

export function patchGuideState(patch: StoredState): StoredState {
  const next = { ...read(), ...patch };
  write(next);
  return next;
}

export function readGuideState(): StoredState {
  return read();
}

/** 반 → 과제 탭을 열었다 — 화면 쪽에서 부른다 */
export function markAssignmentsReviewed(): void {
  if (read().reviewedAt) return;
  patchGuideState({ reviewedAt: new Date().toISOString() });
}

export type StartGuideProgress = {
  done: Record<StartGuideStepId, boolean>;
  doneCount: number;
  /** 다음에 할 한 단계. 전부 끝났으면 null */
  next: StartGuideStep | null;
  /** 초대 코드를 보여 줄 반 — 가장 먼저 만든 반 */
  primaryClass: TeacherClass | null;
  allDone: boolean;
};

/**
 * **실제 상태를 읽어** 어디까지 왔는지 계산한다.
 *
 * 학생 등록만 서버를 봐야 한다(반·과제는 로컬에 있다). 서버가 없거나 실패하면
 * 「아직 안 됨」으로 둔다 — 틀리게 완료 표시하는 것보다 낫다.
 */
export async function resolveStartGuideProgress(): Promise<StartGuideProgress> {
  const stored = read();
  const classes = loadTeacherClasses();
  const primaryClass = classes[0] ?? null;

  const createdClass = classes.length > 0;

  let invited = false;
  if (primaryClass) {
    try {
      const enrollments = await fetchClassEnrollments(primaryClass.id);
      invited = enrollments.length > 0;
    } catch {
      invited = false;
    }
  }

  const assigned = loadClassAssignments().length > 0;
  const reviewed = Boolean(stored.reviewedAt);

  const done: Record<StartGuideStepId, boolean> = {
    "create-class": createdClass,
    "invite-students": invited,
    assign: assigned,
    review: reviewed,
  };

  const next = START_GUIDE_STEPS.find((step) => !done[step.id]) ?? null;
  const doneCount = START_GUIDE_STEPS.filter((s) => done[s.id]).length;

  return {
    done,
    doneCount,
    next,
    primaryClass,
    allDone: doneCount === START_GUIDE_STEPS.length,
  };
}

/**
 * 반 만들기 모달을 연다.
 *
 * 모달 상태는 `TeacherFigmaFrame` 안에 있어서 레이아웃에 얹힌 가이드가 직접 못 연다.
 * 이 리포가 이미 쓰는 방식(`haksup-problem-sets-changed` 등 window 이벤트)을 따른다.
 */
export const OPEN_CREATE_CLASS_EVENT = "haksup-open-create-class";

export function requestOpenCreateClass(): void {
  window.dispatchEvent(new Event(OPEN_CREATE_CLASS_EVENT));
}
