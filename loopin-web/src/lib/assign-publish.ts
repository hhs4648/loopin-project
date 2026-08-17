import type {
  AssignChip,
  AssignGroup,
  AssignResult,
} from "@/components/teacher/AssignAssignmentModal";
import {
  upsertAssignmentsForProblemSet,
  type CreateClassAssignmentInput,
} from "@/lib/class-assignments";
import {
  PART_CATEGORIES,
  partSlice,
  type PartCategory,
} from "@/lib/problem-set-parts";
import {
  appendProblemSet,
  createProblemSetTitle,
  loadProblemSets,
  persistProblemSets,
  updateProblemSet,
  type CreateProblemSetInput,
  type ProblemSetParts,
  type SavedProblemSet,
} from "@/lib/problem-sets";
import { publishProblemSetAndAssignments } from "@/lib/sync/teacher-sync";

export type AssignBuildContext = {
  unitItemIds: Record<PartCategory, string[]>;
  partCounts: Record<PartCategory, number>;
};

/**
 * 칩(= 캘린더에 놓는 최소 단위)이 실제로 낼 문항 id.
 */
export function buildChipItemIds(
  chips: AssignChip[],
  base: CreateProblemSetInput,
  context: AssignBuildContext,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const category of PART_CATEGORIES) {
    const categoryChips = chips
      .filter((chip) => chip.category === category)
      .sort((a, b) => (a.partIndex ?? 0) - (b.partIndex ?? 0));
    if (categoryChips.length === 0) continue;

    const selected = base.items[category] ?? [];
    const total = context.partCounts[category];
    const covered = new Set<string>();

    for (const chip of categoryChips) {
      if (chip.partIndex === null || total <= 1) {
        result.set(chip.key, [...selected]);
        selected.forEach((id) => covered.add(id));
        continue;
      }
      const slice = new Set(
        partSlice(context.unitItemIds[category], total, chip.partIndex),
      );
      const ids = selected.filter((id) => slice.has(id));
      ids.forEach((id) => covered.add(id));
      result.set(chip.key, ids);
    }

    const orphans = selected.filter((id) => !covered.has(id));
    if (orphans.length > 0) {
      const first = categoryChips[0]!;
      result.set(first.key, [...(result.get(first.key) ?? []), ...orphans]);
    }
  }
  return result;
}

/** 같은 날에 놓인 칩 묶음 하나 → 저장할 문제집 하나 */
export function buildGroupInput(
  base: CreateProblemSetInput,
  group: AssignGroup,
  result: AssignResult,
  context: AssignBuildContext,
  chipItemIds: Map<string, string[]>,
): CreateProblemSetInput {
  const items = { words: [], sentences: [], grammar: [] } as Record<
    PartCategory,
    string[]
  >;
  const problemTypes = { words: [], sentences: [], grammar: [] } as Record<
    PartCategory,
    string[]
  >;
  const part: ProblemSetParts = {};
  let anyPart = false;

  for (const category of PART_CATEGORIES) {
    const categoryChips = group.chips.filter(
      (chip) => chip.category === category,
    );
    if (categoryChips.length === 0) continue;

    items[category] = categoryChips.flatMap(
      (chip) => chipItemIds.get(chip.key) ?? [],
    );
    problemTypes[category] =
      result.types[category] ?? base.problemTypes[category] ?? [];

    const total = context.partCounts[category];
    const indices = categoryChips
      .map((chip) => chip.partIndex)
      .filter((index): index is number => index !== null)
      .sort((a, b) => a - b);
    if (total > 1 && indices.length > 0) {
      part[category] = { index: indices[0]!, indices, total };
      anyPart = true;
    }
  }

  return {
    ...base,
    items,
    problemTypes,
    part: anyPart ? part : undefined,
  };
}

export type PublishAssignResult =
  | { ok: true }
  | { ok: false; message: string };

/** 문제 제출 → 과제 부여 확정 */
export async function publishProblemsAssign(params: {
  pendingInput: CreateProblemSetInput;
  result: AssignResult;
  context: AssignBuildContext;
  editingProblemSet: SavedProblemSet | null;
}): Promise<PublishAssignResult> {
  const { pendingInput, result, context, editingProblemSet } = params;
  const allChips: AssignChip[] = result.groups.flatMap((group) => group.chips);
  const chipItemIds = buildChipItemIds(allChips, pendingInput, context);
  const reuseEditing =
    editingProblemSet !== null && result.groups.length === 1;

  try {
    for (const group of result.groups) {
      const input =
        allChips.length > 0
          ? buildGroupInput(
              pendingInput,
              group,
              result,
              context,
              chipItemIds,
            )
          : pendingInput;

      let problemSetId: string;
      let savedSet: SavedProblemSet | null;
      if (reuseEditing && editingProblemSet) {
        const next = updateProblemSet(loadProblemSets(), editingProblemSet.id, {
          ...input,
          title: createProblemSetTitle(
            input.grade,
            input.textbook,
            input.unit,
            input.part,
          ),
        });
        persistProblemSets(next);
        savedSet =
          next.find((item) => item.id === editingProblemSet.id) ?? null;
        problemSetId = editingProblemSet.id;
      } else {
        const created = appendProblemSet({
          ...input,
          hiddenFromLibrary: true,
        });
        problemSetId = created.id;
        savedSet = created;
      }

      const nextAssignments = upsertAssignmentsForProblemSet(
        problemSetId,
        group.assignments.map((item) => ({
          ...item,
          problemSetId,
        })),
      );
      const problemSet =
        savedSet ??
        loadProblemSets().find((item) => item.id === problemSetId) ??
        null;
      if (problemSet) {
        const publishResult = await publishProblemSetAndAssignments({
          problemSet,
          assignments: nextAssignments.filter(
            (item) => item.problemSetId === problemSetId,
          ),
        });
        if (!publishResult.ok) {
          return {
            ok: false,
            message:
              publishResult.message ||
              "서버에 과제를 올리지 못했어요. 다시 시도해 주세요.",
          };
        }
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "저장하지 못했어요. 다시 시도해 주세요." };
  }
}

/** 사용자 지정 세트 → 과제 부여 확정 (칩 없음, 묶음 1개) */
export async function publishCustomAssign(params: {
  problemSet: SavedProblemSet;
  assignments: CreateClassAssignmentInput[];
}): Promise<PublishAssignResult> {
  const { problemSet, assignments } = params;
  try {
    const problemSetId = problemSet.id;
    const nextAssignments = upsertAssignmentsForProblemSet(
      problemSetId,
      assignments.map((item) => ({
        ...item,
        problemSetId,
      })),
    );
    const assignedClassIds = assignments.map((item) => item.classId);
    const nextSets = updateProblemSet(loadProblemSets(), problemSetId, {
      assignedClassIds,
    });
    persistProblemSets(nextSets);
    const saved =
      nextSets.find((item) => item.id === problemSetId) ?? problemSet;
    const publishResult = await publishProblemSetAndAssignments({
      problemSet: saved,
      assignments: nextAssignments.filter(
        (item) => item.problemSetId === problemSetId,
      ),
    });
    if (!publishResult.ok) {
      return {
        ok: false,
        message:
          publishResult.message ||
          "서버에 과제를 올리지 못했어요. 다시 시도해 주세요.",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "저장하지 못했어요. 다시 시도해 주세요." };
  }
}
