"use client";

import { classIdsEqual } from "@/lib/teacher-classes";
import type {
  CustomProblemTypeId,
  SentenceAnalysis,
  WordAnalysis,
} from "@/lib/ai/sentence-problem-types";

const STORAGE_KEY = "loopin-problem-sets";

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

export type SavedProblemSet = {
  id: string;
  title: string;
  grade: string;
  textbook: string;
  unit: string;
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

export function createProblemSetTitle(
  grade: string,
  textbook: string,
  unit: string,
): string {
  return `${grade} · ${textbook} · ${unit}`;
}

export function createProblemSet(input: CreateProblemSetInput): SavedProblemSet {
  const now = new Date().toISOString();
  return {
    ...input,
    id: `problem-set-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 7)}`,
    title: createProblemSetTitle(input.grade, input.textbook, input.unit),
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
  window.dispatchEvent(new Event("loopin-problem-sets-changed"));
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
  window.dispatchEvent(new Event("loopin-problem-sets-changed"));
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
