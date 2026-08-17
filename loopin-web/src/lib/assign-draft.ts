import type { AssignContentRow } from "@/components/teacher/AssignAssignmentModal";
import type { PartCategory } from "@/lib/problem-set-parts";
import type { CreateProblemSetInput } from "@/lib/problem-sets";

const STORAGE_KEY = "loopin-assign-draft";

export type AssignDraftSource = "problems" | "custom";

/** 과제 부여 화면에서 칩·마감 배치 — 같은 세션에서 부여 화면을 다시 열 때만 유지 */
export type AssignDraftUi = {
  schedules?: Record<
    string,
    {
      lessonDate: string;
      deadlineDays: number;
      deadlineMode: "manual" | "until_next_class";
    }
  >;
  /** 반 id → (칩 키 → YYYY-MM-DD) */
  chipDates?: Record<string, Record<string, string>>;
  activeClassId?: string;
  partSel?: Record<string, number[]>;
  typeSel?: Record<string, string[]>;
  month?: { year: number; month: number };
};

export type AssignDraft = {
  v: 1;
  source: AssignDraftSource;
  returnHref: string;
  classIds: string[];
  contents?: AssignContentRow[];
  /** 문제 제출 플로우 */
  pendingInput?: CreateProblemSetInput;
  unitItemIds?: Record<PartCategory, string[]>;
  partCounts?: Record<PartCategory, number>;
  editingProblemSetId?: string | null;
  /** 사용자 지정 플로우 — 이미 저장된 세트 */
  problemSetId?: string;
  /** 부여 화면 UI (칩 배치·마감). 부여 화면을 떠날 때 초안과 함께 삭제 */
  assignUi?: AssignDraftUi;
};

export function saveAssignDraft(draft: AssignDraft): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function loadAssignDraft(): AssignDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AssignDraft;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.classIds)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** 기존 초안에 필드만 덮어쓴다. 초안이 없으면 무시 */
export function patchAssignDraft(patch: Partial<AssignDraft>): void {
  const current = loadAssignDraft();
  if (!current) return;
  saveAssignDraft({ ...current, ...patch });
}

export function clearAssignDraft(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
