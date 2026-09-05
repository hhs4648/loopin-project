import type { AssignContentRow } from "@/components/teacher/AssignAssignmentModal";
import {
  PART_CATEGORY_KEYS,
  PART_CATEGORY_LABEL,
  type SavedProblemSet,
} from "@/lib/problem-sets";

/**
 * 사용자 지정 세트를 과제 부여 화면의 **안 나눔 칩**으로 바꾼다.
 * 단어·문장(·문법) 유형이 켜진 카테고리만 칩이 생긴다.
 */
export function contentsFromCustomProblemSet(
  set: Pick<SavedProblemSet, "items" | "problemTypes">,
): AssignContentRow[] {
  const rows: AssignContentRow[] = [];
  for (const key of PART_CATEGORY_KEYS) {
    const count = set.items[key]?.length ?? 0;
    const types = set.problemTypes[key] ?? [];
    if (count <= 0 || types.length === 0) continue;
    rows.push({
      key,
      label: PART_CATEGORY_LABEL[key],
      count,
      types: [...types],
      checkedTypes: [...types],
    });
  }
  return rows;
}
