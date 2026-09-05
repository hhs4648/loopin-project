import type { ClassAssignment } from "@/lib/class-assignments";
import { getUnitContent } from "@/lib/problem-bank";
import {
  buildItemAssignmentHistory,
  pickUnassignedIds,
  type ItemAssignmentHistory,
} from "@/lib/problem-item-history";
import {
  PART_CATEGORY_KEYS,
  PART_CATEGORY_LABEL,
  createProblemSetTitle,
  partRangeIndices,
  problemSetUnitKey,
  type ProblemSetPartRange,
  type ProblemSetParts,
  type SavedProblemSet,
} from "@/lib/problem-sets";
import { classIdsEqual } from "@/lib/teacher-classes";
import { isUnitProgressDismissed } from "@/lib/unit-progress-dismiss";

/**
 * 한 단원을 여러 수업에 걸쳐 낼 때 쓰는 「파트」 선택 도구.
 *
 * 과제를 여러 개 만들어 두는 게 아니라, **체크박스를 대신 찍어주는 보조 기능**이다.
 * 교사가 카테고리별로 「나누기 n」 → 「i파트」를 누르면 그 조각만 선택된다.
 *
 * - 단어·문장·문법을 **각각 따로** 나눈다. 카테고리마다 등분 수·파트 번호가 달라도 된다.
 * - 나머지는 앞 파트에 하나씩 더 준다 → 마지막 파트가 항상 가장 작다.
 * - 순서는 문제은행(교과서) 순서를 따라야 진도와 맞는다.
 */

/** 나눌 수 있는 파트 수 상한. 수업 진도 단위라 4를 넘길 일이 없다. */
export const MAX_PARTS = 4;

/**
 * 짝맞추기·음성 짝맞추기가 켜져 있을 때 필요한 최소 단어 수.
 * 학생앱이 4짝 페이지를 만들지 못하면 문항이 비어버린다.
 */
export const MIN_WORD_MATCH_ITEMS = 4;

export type PartCategory = (typeof PART_CATEGORY_KEYS)[number];

export const PART_CATEGORIES = PART_CATEGORY_KEYS;
export const PART_LABEL = PART_CATEGORY_LABEL;

/** 카테고리별 등분 수 — 1이면 나누지 않음 */
export type PartCounts = Record<PartCategory, number>;
/** 카테고리별로 지금 고른 파트 번호 — null이면 파트로 고른 게 아님(수동 선택) */
export type PartSelection = Record<PartCategory, number | null>;
/**
 * 카테고리별로 **이번에 낼 파트 번호들**. 한 번에 여러 파트를 낼 수 있다
 * (예: 단어 1·2파트를 한 과제로). 비어 있으면 파트로 고른 게 아니다.
 */
export type PartChecked = Record<PartCategory, number[]>;

export const DEFAULT_PART_CHECKED: PartChecked = {
  words: [],
  sentences: [],
  grammar: [],
};

export const DEFAULT_PART_COUNTS: PartCounts = {
  words: 1,
  sentences: 1,
  grammar: 1,
};

export const DEFAULT_PART_SELECTION: PartSelection = {
  words: null,
  sentences: null,
  grammar: null,
};

/** 앞에서부터 채우고 나머지는 앞 파트에 하나씩 더 주는 n등분 */
export function splitIntoParts<T>(items: T[], parts: number): T[][] {
  const safeParts = Math.max(1, Math.floor(parts));
  const base = Math.floor(items.length / safeParts);
  const rest = items.length % safeParts;
  const chunks: T[][] = [];
  let cursor = 0;
  for (let i = 0; i < safeParts; i++) {
    const take = base + (i < rest ? 1 : 0);
    chunks.push(items.slice(cursor, cursor + take));
    cursor += take;
  }
  return chunks;
}

/** n등분했을 때 index(1부터)번째 조각 */
export function partSlice<T>(items: T[], parts: number, index: number): T[] {
  if (parts <= 1) return [...items];
  const chunks = splitIntoParts(items, parts);
  return chunks[index - 1] ?? [];
}

/** 파트당 최소 문항 수 — 단어만 짝맞추기 여부에 따라 달라진다 */
export function minItemsPerPart(
  category: PartCategory,
  wordMatchEnabled: boolean,
): number {
  return category === "words" && wordMatchEnabled ? MIN_WORD_MATCH_ITEMS : 1;
}

/** 항목 수로 실제 가능한 최대 등분 수 (상한 MAX_PARTS) */
export function maxPartsFor(totalCount: number, minPerPart: number): number {
  if (totalCount <= 0) return 1;
  return Math.max(1, Math.min(MAX_PARTS, Math.floor(totalCount / minPerPart)));
}

/**
 * 해당 등분 수를 고를 수 없는 이유. 고를 수 있으면 null.
 * 비활성 버튼 툴팁에 그대로 쓴다.
 */
export function partSplitDisabledReason(params: {
  categoryLabel: string;
  totalCount: number;
  minPerPart: number;
  parts: number;
}): string | null {
  const { categoryLabel, totalCount, minPerPart, parts } = params;
  if (parts <= 1) return null;
  if (totalCount <= 0) {
    return `${categoryLabel} 항목이 없어요.`;
  }
  const perPart = Math.floor(totalCount / parts);
  if (perPart >= minPerPart) return null;
  if (minPerPart > 1) {
    return `짝맞추기·음성 짝맞추기는 파트당 ${minPerPart}개 이상 필요해요. (${categoryLabel} ${totalCount}개 → ${parts}등분 시 ${perPart}개)`;
  }
  return `${categoryLabel} ${totalCount}개로는 ${parts}등분할 수 없어요.`;
}

/**
 * 저장할 파트 정보. 나누지 않은(등분 1) 카테고리는 넣지 않는다.
 * 하나도 나누지 않았으면 undefined — 기존 문제집과 똑같이 취급된다.
 */
export function buildProblemSetParts(
  counts: PartCounts,
  checked: PartChecked,
): ProblemSetParts | undefined {
  const parts: ProblemSetParts = {};
  let any = false;
  for (const category of PART_CATEGORIES) {
    const total = counts[category];
    const indices = [...new Set(checked[category])].sort((a, b) => a - b);
    if (total > 1 && indices.length > 0) {
      // `index`는 가장 앞 번호로 계속 채운다 — 이 필드만 읽는 옛 코드가 깨지지 않게
      parts[category] = { index: indices[0], indices, total };
      any = true;
    }
  }
  return any ? parts : undefined;
}

/* ------------------------------------------------------------------ */
/* 반 홈 「진행 중인 단원」                                              */
/* ------------------------------------------------------------------ */

export type UnitCategoryProgress = {
  category: PartCategory;
  label: string;
  total: number;
  /** 이 반에 이미 부여된 파트 번호 (오름차순) */
  doneIndices: number[];
  /** 아직 안 낸 가장 빠른 파트 번호. 다 냈으면 null */
  nextIndex: number | null;
};

export type UnitPartProgress = {
  unitKey: string;
  grade: string;
  textbook: string;
  unit: string;
  /** "중3 · YBM(송) · 5단원" — 파트 접미사 없는 단원 제목 */
  unitTitle: string;
  /** 나눠서 낸 카테고리만 */
  categories: UnitCategoryProgress[];
  /** 정렬용 — 이 단원에서 가장 최근에 부여한 시각 */
  latestAssignedAt: string;
  /** 가장 최근에 부여한 문제집 — 「이어서 내기」가 유형 설정을 복원하는 기준 */
  latestProblemSetId: string;
};

/**
 * 이 반에서 **진행 중인** 단원 목록.
 *
 * 「진행 중」 = 파트로 나눠 낸 적이 있고, 아직 안 낸 파트가 남은 단원.
 * 모든 카테고리를 끝까지 내면 목록에서 사라진다(= 진도 끝).
 */
export function buildUnitPartProgress(
  problemSets: SavedProblemSet[],
  assignments: ClassAssignment[],
  classId: string,
): UnitPartProgress[] {
  const assignedProblemSetIds = new Map<string, string>();
  for (const assignment of assignments) {
    // 개인 과제(오답 복습 등)는 진도가 아니므로 제외
    if (assignment.targetStudentId) continue;
    if (!classIdsEqual(assignment.classId, classId)) continue;
    const previous = assignedProblemSetIds.get(assignment.problemSetId);
    if (previous && previous >= assignment.assignedAt) continue;
    assignedProblemSetIds.set(assignment.problemSetId, assignment.assignedAt);
  }

  const groups = new Map<string, SavedProblemSet[]>();
  for (const problemSet of problemSets) {
    if (!problemSet.part) continue;
    if (!assignedProblemSetIds.has(problemSet.id)) continue;
    const key = problemSetUnitKey(problemSet);
    const bucket = groups.get(key);
    if (bucket) bucket.push(problemSet);
    else groups.set(key, [problemSet]);
  }

  const result: UnitPartProgress[] = [];
  for (const [unitKey, sets] of groups) {
    const categories: UnitCategoryProgress[] = [];
    for (const category of PART_CATEGORIES) {
      const ranges = sets
        .map((item) => item.part?.[category])
        .filter((range): range is ProblemSetPartRange => Boolean(range));
      if (ranges.length === 0) continue;
      // 등분 수를 도중에 바꿨다면 가장 잘게 나눈 값을 기준으로 본다
      const total = ranges.reduce((max, range) => Math.max(max, range.total), 1);
      if (total <= 1) continue;
      const doneIndices = [
        ...new Set(
          ranges
            .filter((range) => range.total === total)
            // 한 과제에 파트를 여러 개 담았을 수 있으므로 번호를 전부 펼친다
            .flatMap((range) => partRangeIndices(range)),
        ),
      ].sort((a, b) => a - b);
      const nextIndex =
        Array.from({ length: total }, (_, i) => i + 1).find(
          (index) => !doneIndices.includes(index),
        ) ?? null;
      categories.push({
        category,
        label: PART_LABEL[category],
        total,
        doneIndices,
        nextIndex,
      });
    }

    // 나눠 낸 적이 없거나 전부 낸 단원은 보여주지 않는다
    if (categories.length === 0) continue;
    if (categories.every((item) => item.nextIndex === null)) continue;

    const first = sets[0];
    const latest = sets.reduce(
      (best, item) => {
        const assignedAt = assignedProblemSetIds.get(item.id) ?? "";
        return assignedAt > best.assignedAt
          ? { assignedAt, problemSetId: item.id }
          : best;
      },
      { assignedAt: "", problemSetId: first.id },
    );
    result.push({
      unitKey,
      grade: first.grade,
      textbook: first.textbook,
      unit: first.unit,
      unitTitle: createProblemSetTitle(first.grade, first.textbook, first.unit),
      categories,
      latestAssignedAt: latest.assignedAt,
      latestProblemSetId: latest.problemSetId,
    });
  }

  return result.sort((a, b) =>
    b.latestAssignedAt.localeCompare(a.latestAssignedAt),
  );
}

/**
 * 나눠 낸 카테고리의 **문항을 전부 이미 냈으면** 이어서 내기를 끝낸다.
 * 파트 번호를 건너뛰고 「안 낸 n개 담기」로 나머지를 넣은 경우에도 카드를 지운다.
 */
export function areSplitCategoriesFullyAssigned(
  unit: UnitPartProgress,
  history: ItemAssignmentHistory,
  classId: string,
): boolean {
  const content = getUnitContent({
    grade: unit.grade,
    textbook: unit.textbook,
    unit: unit.unit,
  });
  const ids: Record<PartCategory, string[]> = {
    words: content.words.map((item) => item.id),
    sentences: content.sentences.map((item) => item.id),
    grammar: content.grammar.map((item) => item.id),
  };
  return unit.categories.every((category) => {
    const list = ids[category.category];
    if (list.length === 0) return true;
    return pickUnassignedIds(list, history, [classId]).length === 0;
  });
}

/**
 * 반 홈·문제 제출에 띄울 「이어서 내기」 목록.
 * 삭제한 카드, 문항을 다 넣은 단원은 빼 둔다.
 */
export function visibleUnitPartProgress(
  problemSets: SavedProblemSet[],
  assignments: ClassAssignment[],
  classId: string,
): UnitPartProgress[] {
  const raw = buildUnitPartProgress(problemSets, assignments, classId);
  if (raw.length === 0) return raw;
  const history = buildItemAssignmentHistory({
    assignments,
    problemSets,
    classIds: [classId],
  });
  return raw.filter((unit) => {
    if (isUnitProgressDismissed(classId, unit.unitKey, unit.latestAssignedAt)) {
      return false;
    }
    return !areSplitCategoriesFullyAssigned(unit, history, classId);
  });
}

/**
 * 「이어서 내기」 링크 — 출제 화면을 **단원 + 등분 수 + 다음 파트 + 이미 부여한 파트**가
 * 찍힌 상태로 연다. 다 낸 카테고리는 등분만 넘기고 파트는 비워 둔다(교사가 직접 고르게).
 */
export function continueUnitHref(
  unit: UnitPartProgress,
  classId: string,
): string {
  const params = new URLSearchParams({
    grade: unit.grade,
    textbook: unit.textbook,
    unit: unit.unit,
    // 받는 반과 문제 유형을 지난번 그대로 복원하기 위한 참조
    classId,
    ref: unit.latestProblemSetId,
  });
  for (const category of unit.categories) {
    params.set(`${category.category}Parts`, String(category.total));
    if (category.nextIndex !== null) {
      params.set(`${category.category}Part`, String(category.nextIndex));
    }
    if (category.doneIndices.length > 0) {
      params.set(
        `${category.category}Done`,
        category.doneIndices.join(","),
      );
    }
  }
  return `/teacher/problems?${params.toString()}`;
}

/** 카테고리별로 이미 부여한 파트 번호 */
export type PartDoneIndices = Record<PartCategory, number[]>;
/** 카테고리별 등분 수 잠금 — 「이어서 내기」로 들어오면 true */
export type PartLocks = Record<PartCategory, boolean>;

export const DEFAULT_PART_DONE: PartDoneIndices = {
  words: [],
  sentences: [],
  grammar: [],
};

export const DEFAULT_PART_LOCKS: PartLocks = {
  words: false,
  sentences: false,
  grammar: false,
};

/** 출제 화면이 URL에서 읽어오는 프리셋 */
export type PartPreset = {
  grade: string;
  textbook: string;
  unit: string;
  counts: PartCounts;
  selection: PartSelection;
  done: PartDoneIndices;
  /** 등분 수를 넘겨받은 카테고리는 잠근다 — 바꾸면 기존 진도와 조각이 어긋난다 */
  locks: PartLocks;
  /** 「이어서 내기」를 누른 반 — 받는 반으로 미리 선택한다 */
  classId: string | null;
  /** 지난번에 낸 문제집 — 문제 유형 체크를 그대로 복원하는 기준 */
  refProblemSetId: string | null;
};

/** `continueUnitHref`가 만든 쿼리를 되읽는다. 단원 정보가 없으면 null. */
export function readPartPreset(search: string): PartPreset | null {
  const params = new URLSearchParams(search);
  const grade = params.get("grade");
  const textbook = params.get("textbook");
  const unit = params.get("unit");
  if (!grade || !textbook || !unit) return null;

  const counts = { ...DEFAULT_PART_COUNTS };
  const selection = { ...DEFAULT_PART_SELECTION };
  const done: PartDoneIndices = { words: [], sentences: [], grammar: [] };
  const locks = { ...DEFAULT_PART_LOCKS };
  for (const category of PART_CATEGORIES) {
    const total = Number(params.get(`${category}Parts`));
    if (!Number.isInteger(total) || total < 1 || total > MAX_PARTS) continue;
    counts[category] = total;
    locks[category] = total > 1;
    const index = Number(params.get(`${category}Part`));
    if (Number.isInteger(index) && index >= 1 && index <= total) {
      selection[category] = index;
    }
    done[category] = (params.get(`${category}Done`) ?? "")
      .split(",")
      .map(Number)
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= total)
      .sort((a, b) => a - b);
  }
  return {
    grade,
    textbook,
    unit,
    counts,
    selection,
    done,
    locks,
    classId: params.get("classId"),
    refProblemSetId: params.get("ref"),
  };
}
