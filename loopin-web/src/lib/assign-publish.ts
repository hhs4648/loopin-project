import type {
  AssignChip,
  AssignGroup,
  AssignResult,
} from "@/components/teacher/AssignAssignmentModal";
import { upsertAssignmentsForProblemSet } from "@/lib/class-assignments";
import {
  PART_CATEGORIES,
  partSlice,
  type PartCategory,
} from "@/lib/problem-set-parts";
import { CUSTOM_PROBLEM_TYPE_OPTIONS } from "@/lib/ai/sentence-problem-types";
import {
  appendProblemSet,
  createProblemSetTitle,
  loadProblemSets,
  persistProblemSets,
  updateProblemSet,
  type CreateProblemSetInput,
  type CustomAssignmentDraft,
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

/**
 * 사용자 지정 세트 → 과제 부여 확정.
 *
 * 칩이 없거나 **한 묶음**이면 목록의 원본 세트를 그대로 부여한다.
 * 단어·문장을 **다른 날**에 올리면 묶음마다 hidden 복제본을 만들어 따로 부여하고,
 * 목록 카드(원본)는 그대로 둔다.
 */
export async function publishCustomAssign(params: {
  problemSet: SavedProblemSet;
  result: AssignResult;
}): Promise<PublishAssignResult> {
  const { problemSet, result } = params;
  const groups = result.groups;
  try {
    const classIds = [
      ...new Set(groups.flatMap((group) => group.assignments.map((item) => item.classId))),
    ];
    if (groups.length <= 1) {
      const assignments = groups[0]?.assignments ?? [];
      const problemSetId = problemSet.id;
      const nextAssignments = upsertAssignmentsForProblemSet(
        problemSetId,
        assignments.map((item) => ({
          ...item,
          problemSetId,
        })),
      );
      const nextSets = updateProblemSet(loadProblemSets(), problemSetId, {
        assignedClassIds: classIds.length > 0 ? classIds : problemSet.assignedClassIds,
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
    }

    for (const group of groups) {
      const slice = sliceCustomSetForGroup(problemSet, group, result);
      const created = appendProblemSet({
        ...slice,
        hiddenFromLibrary: true,
      });
      const nextAssignments = upsertAssignmentsForProblemSet(
        created.id,
        group.assignments.map((item) => ({
          ...item,
          problemSetId: created.id,
        })),
      );
      const publishResult = await publishProblemSetAndAssignments({
        problemSet: created,
        assignments: nextAssignments.filter(
          (item) => item.problemSetId === created.id,
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

    const nextSets = updateProblemSet(loadProblemSets(), problemSet.id, {
      assignedClassIds: classIds.length > 0 ? classIds : problemSet.assignedClassIds,
    });
    persistProblemSets(nextSets);
    return { ok: true };
  } catch {
    return { ok: false, message: "저장하지 못했어요. 다시 시도해 주세요." };
  }
}

function sliceCustomSetForGroup(
  source: SavedProblemSet,
  group: AssignGroup,
  result: AssignResult,
): CreateProblemSetInput {
  const includeWords = group.chips.some((chip) => chip.category === "words");
  const includeSentences = group.chips.some(
    (chip) => chip.category === "sentences",
  );
  const includeGrammar = group.chips.some((chip) => chip.category === "grammar");
  const problemTypes = {
    words: includeWords
      ? (result.types.words ?? source.problemTypes.words)
      : [],
    sentences: includeSentences
      ? (result.types.sentences ?? source.problemTypes.sentences)
      : [],
    grammar: includeGrammar
      ? (result.types.grammar ?? source.problemTypes.grammar)
      : [],
  };
  return {
    grade: source.grade,
    textbook: source.textbook,
    unit: source.unit,
    assignedClassIds: group.assignments.map((item) => item.classId),
    items: {
      words: includeWords ? source.items.words : [],
      sentences: includeSentences ? source.items.sentences : [],
      grammar: includeGrammar ? source.items.grammar : [],
    },
    problemTypes,
    customDraft: sliceCustomDraft(
      source.customDraft,
      includeWords,
      includeSentences,
      problemTypes.words,
      problemTypes.sentences,
    ),
  };
}

function sliceCustomDraft(
  draft: CustomAssignmentDraft | undefined,
  includeWords: boolean,
  includeSentences: boolean,
  wordTypeLabels: string[],
  sentenceTypeLabels: string[],
): CustomAssignmentDraft | undefined {
  if (!draft) return undefined;
  const wordLabels = new Set(wordTypeLabels);
  const sentenceLabels = new Set(sentenceTypeLabels);
  const typeOn = { ...draft.typeOn };
  for (const option of CUSTOM_PROBLEM_TYPE_OPTIONS) {
    if (option.category === "word") {
      typeOn[option.id] =
        includeWords && wordLabels.has(option.label) && draft.typeOn[option.id];
    } else {
      typeOn[option.id] =
        includeSentences &&
        sentenceLabels.has(option.label) &&
        draft.typeOn[option.id];
    }
  }
  return {
    ...draft,
    typeOn,
    selectedIds: includeWords ? draft.selectedIds : [],
    analyses: includeWords ? draft.analyses : {},
    sentenceDrafts: includeSentences ? draft.sentenceDrafts : {},
  };
}
