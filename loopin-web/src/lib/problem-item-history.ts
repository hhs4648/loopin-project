import {
  getAssignmentsForClass,
  type ClassAssignment,
} from "@/lib/class-assignments";
import {
  PART_CATEGORY_KEYS,
  type SavedProblemSet,
} from "@/lib/problem-sets";

/**
 * 「이 문항, 이 반에 이미 냈나?」를 **파생으로** 답한다.
 *
 * 별도 저장소를 두지 않는 이유:
 * - `loopin-class-assignments`(반별 부여)와 `SavedProblemSet.items`(문항 id 목록)만 조인하면
 *   이미 답이 나온다. 새 키를 만들면 학생앱 스냅샷과 어긋날 자리가 하나 더 생긴다.
 * - 과거에 부여한 과제도 마이그레이션 없이 그대로 잡힌다.
 *
 * 문항 id는 `word-중3-YBM(송)-5단원-1`처럼 **단원까지 박혀 있어 전역 고유**라
 * 다른 단원 과제와 섞일 걱정이 없다.
 *
 * 개인 과제(오답 복습 등)는 진도가 아니므로 제외한다 — `getAssignmentsForClass`가
 * 기본으로 `targetStudentId`가 있는 부여를 걸러 준다.
 */

/** 문항 id → 이 문항을 이미 받은 반 id (선택한 반 중에서만) */
export type ItemAssignmentHistory = Map<string, string[]>;

export function buildItemAssignmentHistory(params: {
  assignments: ClassAssignment[];
  problemSets: SavedProblemSet[];
  /** 지금 「받는 반」으로 고른 반들. 비어 있으면 표시할 이력도 없다 */
  classIds: string[];
}): ItemAssignmentHistory {
  const { assignments, problemSets, classIds } = params;
  const history: ItemAssignmentHistory = new Map();
  if (classIds.length === 0) return history;

  const setById = new Map(problemSets.map((set) => [set.id, set]));

  for (const classId of classIds) {
    // 이 반이 지금까지 받은 문항 — 같은 문항이 여러 과제에 겹쳐도 반은 한 번만 적는다
    const itemIds = new Set<string>();
    for (const assignment of getAssignmentsForClass(assignments, classId)) {
      const problemSet = setById.get(assignment.problemSetId);
      if (!problemSet) continue;
      for (const category of PART_CATEGORY_KEYS) {
        for (const itemId of problemSet.items[category]) itemIds.add(itemId);
      }
    }
    for (const itemId of itemIds) {
      const bucket = history.get(itemId);
      if (bucket) bucket.push(classId);
      else history.set(itemId, [classId]);
    }
  }

  return history;
}

/**
 * 목록에서 아래로 내릴지 판단하는 기준.
 *
 * **선택한 반이 전부** 이미 받았을 때만 「낸 문항」으로 본다.
 * 3반엔 냈고 4반엔 안 냈다면 4반에게는 새 문항이므로 내리면 안 된다 —
 * 부분적으로 낸 것은 배지로만 알린다.
 */
export function isAssignedToAllClasses(
  history: ItemAssignmentHistory,
  itemId: string,
  classIds: string[],
): boolean {
  if (classIds.length === 0) return false;
  const assigned = history.get(itemId);
  if (!assigned) return false;
  return classIds.every((classId) => assigned.includes(classId));
}

/**
 * 배지 문구 — 이 문항을 이미 받은 반 이름.
 * 이름이 3개를 넘으면 `3반 외 2곳`으로 줄인다.
 */
export function assignedBadgeLabel(
  history: ItemAssignmentHistory,
  itemId: string,
  classNameById: Map<string, string>,
): string | null {
  const assigned = history.get(itemId);
  if (!assigned || assigned.length === 0) return null;
  const names = assigned.map((id) => classNameById.get(id) ?? "다른 반");
  if (names.length <= 2) return `${names.join(" · ")} 부여`;
  return `${names[0]} 외 ${names.length - 1}곳 부여`;
}

/**
 * 「안 낸 것만 담기」가 고를 문항 id.
 * 순서는 넘어온 그대로(문제은행 순서)를 지킨다 — 파트 조각·진도와 어긋나면 안 된다.
 */
export function pickUnassignedIds(
  allIds: string[],
  history: ItemAssignmentHistory,
  classIds: string[],
): string[] {
  return allIds.filter((id) => !isAssignedToAllClasses(history, id, classIds));
}
