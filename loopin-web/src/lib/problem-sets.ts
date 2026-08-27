"use client";

import { classIdsEqual } from "@/lib/teacher-classes";
import type {
  CustomProblemTypeId,
  SentenceAnalysis,
  WordAnalysis,
} from "@/lib/ai/sentence-problem-types";

const STORAGE_KEY = "haksup-problem-sets";

export type ProblemSetItems = {
  words: string[];
  sentences: string[];
  grammar: string[];
};

export type ProblemSetTypes = {
  words: string[];
  sentences: string[];
  grammar: string[];
};

/** 문장 기반 사용자 지정 과제 — 다시 열 때 복원용 */
export type CustomAssignmentDraft = {
  draft: string;
  draftKo: string;
  passage: string;
  passageMeanings: string[];
  selectedIds: string[];
  analyses: Record<string, WordAnalysis>;
  typeOn: Record<CustomProblemTypeId, boolean>;
  sentenceDrafts: Record<string, SentenceAnalysis>;
};

/** 한 카테고리를 n등분했을 때 이 문제집이 담은 조각 */
export type ProblemSetPartRange = {
  /**
   * 담은 파트 중 **가장 앞 번호**. 1부터 시작.
   * 파트를 여러 개 담을 수 있게 된 뒤에도 남겨 둔다 — 이 필드만 읽는 옛 데이터·코드 호환용.
   */
  index: number;
  /**
   * 담은 파트 번호 전부 (오름차순). 하나만 담았으면 생략될 수 있다.
   * **읽을 때는 항상 `partRangeIndices`를 쓴다** — `index`만 보면 2개 이상 담은 문제집에서
   * 뒤쪽 파트를 놓친다.
   */
  indices?: number[];
  /** 몇 등분했는지. 1이면 나누지 않은 것 */
  total: number;
};

/** 이 조각이 담은 파트 번호 — 옛 데이터(`index`만 있음)도 함께 처리한다 */
export function partRangeIndices(range: ProblemSetPartRange): number[] {
  if (range.indices && range.indices.length > 0) {
    return [...range.indices].sort((a, b) => a - b);
  }
  return [range.index];
}

/**
 * 한 단원을 여러 수업에 나눠 낼 때의 파트 정보.
 * **단어·문장·문법을 각각 따로** 나누므로 카테고리마다 등분 수와 파트 번호가 다를 수 있다.
 */
export type ProblemSetParts = {
  words?: ProblemSetPartRange;
  sentences?: ProblemSetPartRange;
  grammar?: ProblemSetPartRange;
};

export const PART_CATEGORY_KEYS = ["words", "sentences", "grammar"] as const;

export const PART_CATEGORY_LABEL: Record<
  (typeof PART_CATEGORY_KEYS)[number],
  string
> = {
  words: "단어",
  sentences: "문장",
  grammar: "문법",
};

export type SavedProblemSet = {
  id: string;
  title: string;
  grade: string;
  textbook: string;
  unit: string;
  /** 카테고리를 나눠 낸 문제집이면 카테고리별로 몇 번째 조각인지 */
  part?: ProblemSetParts;
  assignedClassIds: string[];
  items: ProblemSetItems;
  problemTypes: ProblemSetTypes;
  favorite: boolean;
  /**
   * true면 「사용자 지정 과제 제출」목록에서만 숨김.
   * 반에 부여한 과제·로컬 조인용 데이터는 유지한다.
   */
  hiddenFromLibrary?: boolean;
  /** 문장 기반 자동 생성 세트의 편집 초안 */
  customDraft?: CustomAssignmentDraft;
  createdAt: string;
  updatedAt: string;
};

export type CreateProblemSetInput = Omit<
  SavedProblemSet,
  "id" | "title" | "favorite" | "createdAt" | "updatedAt"
>;

/**
 * 목록·제목에 붙는 짧은 파트 라벨.
 * 나눈 카테고리가 없으면 null, 파트 번호가 모두 같으면 `2파트`,
 * 카테고리마다 다르면 `단어 2파트 · 문법 1파트`.
 */
export function problemSetPartLabel(part?: ProblemSetParts): string | null {
  if (!part) return null;
  const split = PART_CATEGORY_KEYS.map(
    (key) => [key, part[key]] as const,
  ).filter(
    (entry): entry is [(typeof PART_CATEGORY_KEYS)[number], ProblemSetPartRange] =>
      Boolean(entry[1]) && (entry[1] as ProblemSetPartRange).total > 1,
  );
  if (split.length === 0) return null;
  const labels = split.map(
    ([, range]) => `${partRangeIndices(range).join("·")}파트`,
  );
  // 카테고리마다 같은 파트를 냈으면 한 번만 — `· 1·2파트`
  if (new Set(labels).size === 1) return labels[0];
  return split
    .map(([key], i) => `${PART_CATEGORY_LABEL[key]} ${labels[i]}`)
    .join(" · ");
}

export function createProblemSetTitle(
  grade: string,
  textbook: string,
  unit: string,
  part?: ProblemSetParts,
): string {
  const base = `${grade} · ${textbook} · ${unit}`;
  const label = problemSetPartLabel(part);
  return label ? `${base} · ${label}` : base;
}

/** 같은 단원의 파트끼리 묶는 키 (학년·교과서·단원이 모두 같아야 한 단원) */
export function problemSetUnitKey(problemSet: {
  grade: string;
  textbook: string;
  unit: string;
}): string {
  return `${problemSet.grade}|${problemSet.textbook}|${problemSet.unit}`;
}

export function createProblemSet(input: CreateProblemSetInput): SavedProblemSet {
  const now = new Date().toISOString();
  return {
    ...input,
    id: `problem-set-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 7)}`,
    title: createProblemSetTitle(
      input.grade,
      input.textbook,
      input.unit,
      input.part,
    ),
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function loadProblemSets(): SavedProblemSet[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) || "[]",
    ) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedProblemSet);
  } catch {
    return [];
  }
}

export function saveProblemSets(problemSets: SavedProblemSet[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(problemSets));
}

export function appendProblemSet(input: CreateProblemSetInput): SavedProblemSet {
  const created = createProblemSet(input);
  saveProblemSets([...loadProblemSets(), created]);
  window.dispatchEvent(new Event("haksup-problem-sets-changed"));
  return created;
}

export function updateProblemSet(
  problemSets: SavedProblemSet[],
  problemSetId: string,
  updates: Partial<
    Pick<
      SavedProblemSet,
      | "title"
      | "grade"
      | "textbook"
      | "unit"
      | "part"
      | "assignedClassIds"
      | "items"
      | "problemTypes"
      | "customDraft"
      | "hiddenFromLibrary"
    >
  >,
): SavedProblemSet[] {
  const updatedAt = new Date().toISOString();
  return problemSets.map((problemSet) =>
    problemSet.id === problemSetId
      ? { ...problemSet, ...updates, updatedAt }
      : problemSet,
  );
}

export function deleteProblemSet(
  problemSets: SavedProblemSet[],
  problemSetId: string,
): SavedProblemSet[] {
  return problemSets.filter((problemSet) => problemSet.id !== problemSetId);
}

/**
 * 사용자 지정 과제 목록에서만 제거(숨김).
 * 부여된 과제 조인을 위해 데이터는 로컬에 남긴다.
 */
export function hideProblemSetFromLibrary(
  problemSets: SavedProblemSet[],
  problemSetId: string,
): SavedProblemSet[] {
  const updatedAt = new Date().toISOString();
  return problemSets.map((problemSet) =>
    problemSet.id === problemSetId
      ? {
          ...problemSet,
          hiddenFromLibrary: true,
          favorite: false,
          updatedAt,
        }
      : problemSet,
  );
}

/** 「문장 과제」로 만든 사용자 지정 세트인지 */
export function isCustomSentenceProblemSet(problemSet: SavedProblemSet): boolean {
  return (
    problemSet.textbook === "문장 과제" || Boolean(problemSet.customDraft)
  );
}

/** 사용자 지정 과제 제출 UI에 보일 항목만 */
export function listLibraryProblemSets(
  problemSets: SavedProblemSet[],
): SavedProblemSet[] {
  return problemSets.filter((item) => !item.hiddenFromLibrary);
}

export function persistProblemSets(problemSets: SavedProblemSet[]): void {
  saveProblemSets(problemSets);
  window.dispatchEvent(new Event("haksup-problem-sets-changed"));
}

export function getProblemSetsForClass(
  problemSets: SavedProblemSet[],
  classId: string,
): SavedProblemSet[] {
  return problemSets.filter((problemSet) =>
    problemSet.assignedClassIds.some((id) => classIdsEqual(id, classId)),
  );
}

export function setProblemSetFavorite(
  problemSets: SavedProblemSet[],
  problemSetId: string,
  favorite: boolean,
): SavedProblemSet[] {
  const updatedAt = new Date().toISOString();
  return problemSets.map((problemSet) =>
    problemSet.id === problemSetId
      ? { ...problemSet, favorite, updatedAt }
      : problemSet,
  );
}

/** 예: "단어 12 · 문장 10 · 문법 14 · 총 36문제" */
export function problemSetItemSummary(problemSet: SavedProblemSet): string {
  return `단어 ${problemSet.items.words.length} · 문장 ${problemSet.items.sentences.length} · 문법 ${problemSet.items.grammar.length} · 총 ${problemSetItemCount(problemSet)}문제`;
}

export function problemSetItemCount(problemSet: SavedProblemSet): number {
  return (
    problemSet.items.words.length +
    problemSet.items.sentences.length +
    problemSet.items.grammar.length
  );
}

function isSavedProblemSet(value: unknown): value is SavedProblemSet {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedProblemSet>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.grade === "string" &&
    typeof item.textbook === "string" &&
    typeof item.unit === "string" &&
    Array.isArray(item.assignedClassIds) &&
    Boolean(item.items) &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string"
  );
}
