import {
  ASSIGNMENT_NO_DEADLINE_DATE,
  ASSIGNMENT_NO_DEADLINE_TIME,
  createClassAssignment,
  loadClassAssignments,
  saveClassAssignments,
  type ClassAssignment,
} from "@/lib/class-assignments";
import { MIN_WORD_MATCH_ITEMS } from "@/lib/problem-set-parts";
import type {
  CreateProblemSetInput,
  CustomAssignmentDraft,
  SavedProblemSet,
} from "@/lib/problem-sets";
import {
  appendProblemSet,
  loadProblemSets,
  persistProblemSets,
  problemSetPartLabel,
  updateProblemSet,
} from "@/lib/problem-sets";
import { publishTargetedStudentAssignments } from "@/lib/sync/teacher-sync";
import type { StudentWrongAnswer } from "@/lib/sync/teacher-sync";

export type StudentWrongReissueRow = {
  studentId: string;
  studentName: string;
  wrongAnswers: StudentWrongAnswer[];
};

type ItemCategory = "words" | "sentences" | "grammar";

/** 짝맞추기·음성/TTS 짝맞추기 — 오답 &lt; 4이면 같은 과제 단어로 패딩 */
function isMatchingWordTypeLabel(label: string): boolean {
  const t = label.trim();
  if (t === "짝맞추기") return true;
  if (t === "음성 짝맞추기" || t === "TTS 뜻 짝맞추기" || t === "듣기 짝맞추기") {
    return true;
  }
  // 그 외 「○○ 짝맞추기」 변형 (지선다와 구분)
  return t.includes("짝맞추기");
}

/** 3/4지선다·TTS 지선다 등 — 패딩하지 않음(오답만) */
function isChoiceWordTypeLabel(label: string): boolean {
  const t = label.trim();
  if (t === "3지선다" || t === "4지선다") return true;
  if (t.includes("지선다") && !t.includes("짝맞추기")) return true;
  return false;
}

function labelMatchesTypeKey(
  label: string,
  typeKey: string,
  category: ItemCategory,
): boolean {
  const t = label.trim();
  switch (typeKey) {
    case "match":
      return t === "짝맞추기";
    case "listen":
      return (
        t === "음성 짝맞추기" ||
        t === "TTS 뜻 짝맞추기" ||
        t === "듣기 짝맞추기" ||
        (t.includes("짝맞추기") && t !== "짝맞추기")
      );
    case "choice":
      if (category === "grammar") return t === "선택형 문제";
      return isChoiceWordTypeLabel(t);
    case "spell":
      return t === "예문 빈칸" || t.includes("빈칸");
    case "chunk":
      return t === "청크배열";
    case "translate":
      return t === "번역 배열";
    case "write":
      return t === "영작";
    case "ox":
      return t === "OX문제";
    case "fix":
      // OX 교정 스텝 오답 → 원본 OX문제로 재출제
      return t === "OX문제" || t === "OX 교정";
    default:
      return false;
  }
}

/**
 * 원본 과제에 켜져 있던 유형 중, 실제 오답 typeKey에 해당하는 라벨만 남긴다.
 * (원본에 없던 라벨은 넣지 않음 — 스냅샷·학생앱 라벨 계약 유지)
 */
function filterProblemTypeLabels(
  sourceLabels: string[],
  typeKeys: Iterable<string>,
  category: ItemCategory,
): string[] {
  const keys = [...new Set([...typeKeys].map((k) => k.trim()).filter(Boolean))];
  if (keys.length === 0) return [];
  return sourceLabels.filter((label) =>
    keys.some((key) => labelMatchesTypeKey(label, key, category)),
  );
}

/** typeKey → 학생앱/미리보기와 맞는 표준 라벨 (원본 라벨 매칭 실패 시 보정용) */
const CANONICAL_TYPE_LABEL: Record<
  string,
  Partial<Record<ItemCategory, string>>
> = {
  match: { words: "짝맞추기" },
  listen: { words: "음성 짝맞추기" },
  choice: { words: "3지선다", grammar: "선택형 문제" },
  spell: { words: "예문 빈칸" },
  chunk: { sentences: "청크배열" },
  translate: { sentences: "번역 배열" },
  write: { sentences: "영작" },
  ox: { grammar: "OX문제" },
  fix: { grammar: "OX문제" },
};

function canonicalLabelsForTypeKeys(
  typeKeys: Iterable<string>,
  category: ItemCategory,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of typeKeys) {
    const label = CANONICAL_TYPE_LABEL[key.trim()]?.[category];
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

function shuffleIds(ids: string[]): string[] {
  const next = [...ids];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
  }
  return next;
}

/**
 * 짝맞추기 패딩용 풀 — **해당 과제에 포함된 단어만** (문제은행 단원 보충 없음).
 */
function assignmentWordPadPool(
  source: SavedProblemSet,
  exclude: Set<string>,
): string[] {
  const out: string[] = [];
  const seen = new Set(exclude);

  const push = (id: string) => {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };

  if (source.customDraft) {
    for (const id of source.customDraft.selectedIds) push(id);
    for (const id of Object.keys(source.customDraft.analyses)) push(id);
  }
  for (const id of source.items.words) push(id);

  return out;
}

/**
 * 짝맞추기·음성 짝맞추기용 — 오답 단어가 4개 미만이면 같은 과제 단어로 랜덤 보충.
 */
export function padMatchingWrongWordIds(
  wrongWordIds: string[],
  source: SavedProblemSet,
): string[] {
  if (wrongWordIds.length === 0) return wrongWordIds;
  if (wrongWordIds.length >= MIN_WORD_MATCH_ITEMS) return wrongWordIds;

  const exclude = new Set(wrongWordIds);
  const needed = MIN_WORD_MATCH_ITEMS - wrongWordIds.length;
  const fillers = shuffleIds(assignmentWordPadPool(source, exclude)).slice(
    0,
    needed,
  );
  return [...wrongWordIds, ...fillers];
}

/**
 * @deprecated 지선다는 패딩하지 않음. 이름만 유지 — 짝맞추기 패딩으로 위임하지 않고 그대로 반환.
 */
export function padChoiceWrongWordIds(
  wrongWordIds: string[],
  _source: SavedProblemSet,
): string[] {
  return wrongWordIds;
}

function isWordBaseId(source: SavedProblemSet, baseId: string): boolean {
  if (source.customDraft) {
    if (baseId in source.customDraft.analyses) return true;
    if (source.customDraft.selectedIds.includes(baseId)) return true;
  }
  return source.items.words.includes(baseId);
}

function isSentenceBaseId(source: SavedProblemSet, baseId: string): boolean {
  if (source.customDraft) {
    for (const [key, item] of Object.entries(source.customDraft.sentenceDrafts)) {
      const sid = `custom-s-${item.sentenceIndex}`;
      if (
        baseId === sid ||
        baseId === key ||
        baseId === String(item.sentenceIndex)
      ) {
        return true;
      }
    }
  }
  return source.items.sentences.includes(baseId);
}

function isGrammarBaseId(source: SavedProblemSet, baseId: string): boolean {
  return source.items.grammar.includes(baseId);
}

function collectWrongWordIds(
  source: SavedProblemSet,
  idSet: Set<string>,
): string[] {
  if (source.customDraft) {
    const fromDraft = Object.keys(source.customDraft.analyses).filter((id) =>
      idSet.has(id),
    );
    if (fromDraft.length > 0) return fromDraft;
  }
  return source.items.words.filter((id) => idSet.has(id));
}

function resolveWordItems(
  wordIds: string[],
  draft: CustomAssignmentDraft | undefined,
): string[] {
  if (!draft) return wordIds;
  return wordIds.map((id) => {
    const analysis = draft.analyses[id];
    if (!analysis) return id;
    return analysis.lemma || analysis.surface || id;
  });
}

function filterWrongAnswers(
  wrongAnswers: StudentWrongAnswer[],
  filterBaseIds?: string[] | null,
): StudentWrongAnswer[] {
  const filter =
    filterBaseIds && filterBaseIds.length > 0
      ? new Set(filterBaseIds)
      : null;
  const seen = new Set<string>();
  const out: StudentWrongAnswer[] = [];
  for (const item of wrongAnswers) {
    if (!item.baseId || !item.typeKey) continue;
    if (filter && !filter.has(item.baseId)) continue;
    const key = `${item.baseId}\0${item.typeKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * 선택한 문항의 **틀린 유형만** 남긴 오답 복습용 문제 세트 입력.
 * 학생 앱에는 `buildContentSnapshot` → content_snapshot 으로 전달된다.
 *
 * - `problemTypes`: 원본에 있던 유형 ∩ 실제 오답 typeKey
 * - 짝맞추기·음성 짝맞추기: 해당 유형 오답 단어 &lt; 4이면 **같은 과제** 단어로 랜덤 패딩
 * - 지선다·예문 빈칸(및 문장·문법): 오답만 (패딩 없음)
 */
export function buildReissueProblemSetInput(
  source: SavedProblemSet,
  wrongAnswers: StudentWrongAnswer[],
  filterBaseIds?: string[] | null,
): CreateProblemSetInput | null {
  const wrongs = filterWrongAnswers(wrongAnswers, filterBaseIds);
  if (wrongs.length === 0) return null;

  const wordTypeKeys = new Set<string>();
  const sentenceTypeKeys = new Set<string>();
  const grammarTypeKeys = new Set<string>();
  const wrongWordIdSet = new Set<string>();
  const matchingWrongWordIdSet = new Set<string>();
  const wrongSentenceIdSet = new Set<string>();
  const wrongGrammarIdSet = new Set<string>();

  for (const wrong of wrongs) {
    const { baseId, typeKey } = wrong;
    if (isWordBaseId(source, baseId)) {
      wordTypeKeys.add(typeKey);
      wrongWordIdSet.add(baseId);
      if (typeKey === "match" || typeKey === "listen") {
        matchingWrongWordIdSet.add(baseId);
      }
    } else if (isSentenceBaseId(source, baseId)) {
      sentenceTypeKeys.add(typeKey);
      wrongSentenceIdSet.add(baseId);
    } else if (isGrammarBaseId(source, baseId)) {
      grammarTypeKeys.add(typeKey);
      wrongGrammarIdSet.add(baseId);
    } else {
      // 분류 불명이면 단어·문장·문법 id 집합에 없을 수 있음 — 단어로 시도
      wordTypeKeys.add(typeKey);
      wrongWordIdSet.add(baseId);
      if (typeKey === "match" || typeKey === "listen") {
        matchingWrongWordIdSet.add(baseId);
      }
    }
  }

  const problemTypes = {
    words: filterProblemTypeLabels(
      source.problemTypes.words,
      wordTypeKeys,
      "words",
    ),
    sentences: filterProblemTypeLabels(
      source.problemTypes.sentences,
      sentenceTypeKeys,
      "sentences",
    ),
    grammar: filterProblemTypeLabels(
      source.problemTypes.grammar,
      grammarTypeKeys,
      "grammar",
    ),
  };

  // 원본 라벨과 typeKey가 안 맞을 때만(레거시) 표준 라벨로 보정 — 원본 전체 유형 복원은 하지 않음
  if (wrongWordIdSet.size > 0 && problemTypes.words.length === 0) {
    problemTypes.words = canonicalLabelsForTypeKeys(wordTypeKeys, "words");
  }
  if (wrongSentenceIdSet.size > 0 && problemTypes.sentences.length === 0) {
    problemTypes.sentences = canonicalLabelsForTypeKeys(
      sentenceTypeKeys,
      "sentences",
    );
  }
  if (wrongGrammarIdSet.size > 0 && problemTypes.grammar.length === 0) {
    problemTypes.grammar = canonicalLabelsForTypeKeys(
      grammarTypeKeys,
      "grammar",
    );
  }

  let wordIds = collectWrongWordIds(source, wrongWordIdSet);

  const needsMatchingPad = problemTypes.words.some(isMatchingWordTypeLabel);
  if (needsMatchingPad) {
    const matchingIds = collectWrongWordIds(source, matchingWrongWordIdSet);
    const paddedMatching = padMatchingWrongWordIds(
      matchingIds.length > 0 ? matchingIds : wordIds,
      source,
    );
    const merged = new Set(wordIds);
    for (const id of paddedMatching) merged.add(id);
    wordIds = [...merged];
  }

  const draftIdSet = new Set<string>([
    ...wordIds,
    ...wrongSentenceIdSet,
    ...wrongGrammarIdSet,
  ]);

  const draft = source.customDraft
    ? filterCustomDraft(source.customDraft, draftIdSet)
    : undefined;

  const words =
    wordIds.length > 0 && problemTypes.words.length > 0
      ? resolveWordItems(wordIds, draft)
      : [];

  const sentences =
    problemTypes.sentences.length > 0
      ? draft
        ? Object.values(draft.sentenceDrafts)
            .sort((a, b) => a.sentenceIndex - b.sentenceIndex)
            .map((s) => s.english)
        : source.items.sentences.filter((id) => wrongSentenceIdSet.has(id))
      : [];

  const grammar =
    problemTypes.grammar.length > 0
      ? source.items.grammar.filter((id) => wrongGrammarIdSet.has(id))
      : [];

  if (words.length + sentences.length + grammar.length === 0) return null;

  return {
    grade: source.grade,
    textbook: source.textbook,
    // unit은 문제은행 조회 키라 `· 오답`을 붙이면 grammar/words/sentences
    // 스냅샷이 전부 비어 학생 앱·시험지에 안 실립니다. 오답 표기는 title만.
    unit: source.unit,
    part: source.part,
    assignedClassIds: [...source.assignedClassIds],
    items: { words, sentences, grammar },
    problemTypes: {
      words: words.length > 0 ? problemTypes.words : [],
      sentences: sentences.length > 0 ? problemTypes.sentences : [],
      grammar: grammar.length > 0 ? problemTypes.grammar : [],
    },
    // 반 과제에서 바로 부여하는 복습 세트 — 목록에는 안 쌓음
    hiddenFromLibrary: true,
    customDraft: draft,
  };
}

function filterCustomDraft(
  draft: CustomAssignmentDraft,
  idSet: Set<string>,
): CustomAssignmentDraft {
  const analyses: CustomAssignmentDraft["analyses"] = {};
  const selectedIds: string[] = [];

  for (const [id, item] of Object.entries(draft.analyses)) {
    if (!idSet.has(id)) continue;
    analyses[id] = item;
    selectedIds.push(id);
  }

  const sentenceDrafts: CustomAssignmentDraft["sentenceDrafts"] = {};
  for (const [key, item] of Object.entries(draft.sentenceDrafts)) {
    const sid = `custom-s-${item.sentenceIndex}`;
    if (
      idSet.has(sid) ||
      idSet.has(key) ||
      idSet.has(String(item.sentenceIndex))
    ) {
      sentenceDrafts[String(item.sentenceIndex)] = item;
    }
  }

  return {
    ...draft,
    selectedIds,
    analyses,
    sentenceDrafts,
  };
}

/**
 * 오답 재출제 세트 제목.
 * 예: `중3 ybm(송).5단원.2파트.오답문제` (파트 없으면 파트 구간 생략)
 * 학년·교과서·단원·파트 필드를 쓰고, 문제 수·완료·학생명 접미사는 붙이지 않는다.
 */
export function reissueProblemSetTitle(source: SavedProblemSet): string {
  const grade = source.grade.trim();
  const textbook = source.textbook.trim().toLowerCase();
  const unit = source.unit
    .replace(/\s·\s오답(?:\s.*)?$/, "")
    .replace(/\.오답문제$/, "")
    .trim();
  const partLabel = problemSetPartLabel(source.part);
  const segments = [
    textbook,
    unit,
    ...(partLabel ? [partLabel] : []),
    "오답문제",
  ].filter(Boolean);
  return `${grade} ${segments.join(".")}`;
}

export function uniqueWrongBaseIds(
  wrongAnswers: StudentWrongAnswer[],
  filterBaseIds?: string[] | null,
): string[] {
  const filter =
    filterBaseIds && filterBaseIds.length > 0
      ? new Set(filterBaseIds)
      : null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of wrongAnswers) {
    if (!item.baseId || seen.has(item.baseId)) continue;
    if (filter && !filter.has(item.baseId)) continue;
    seen.add(item.baseId);
    out.push(item.baseId);
  }
  return out;
}

export function filterStudentsWithWrongReissue(
  rows: StudentWrongReissueRow[],
  filterBaseIds?: string[] | null,
): Array<StudentWrongReissueRow & { baseIds: string[] }> {
  return rows
    .map((row) => {
      const wrongAnswers = filterWrongAnswers(row.wrongAnswers, filterBaseIds);
      return {
        ...row,
        wrongAnswers,
        baseIds: uniqueWrongBaseIds(wrongAnswers),
      };
    })
    .filter((row) => row.wrongAnswers.length > 0);
}

/**
 * 학생마다 틀린 유형만 담은 개인 과제를 만들고 앱에 동기화한다.
 * 마감은 두지 않는다(학생 체크만). 스키마상 deadline은 센티널로 채운다.
 */
export async function assignPerStudentWrongReissues(params: {
  source: SavedProblemSet;
  classId: string;
  /** 오답의 출처가 된 과제 id — 만들어질 개인 과제에 `sourceAssignmentId`로 남는다 */
  sourceAssignmentId: string;
  lessonDate: string;
  students: Array<{
    studentId: string;
    studentName: string;
    wrongAnswers: StudentWrongAnswer[];
    /** @deprecated wrongAnswers 사용 — UI 집계용으로만 남아 있을 수 있음 */
    baseIds?: string[];
  }>;
}): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  const {
    source,
    classId,
    sourceAssignmentId,
    lessonDate,
    students,
  } = params;
  if (students.length === 0) {
    return { ok: false, message: "앱에 보낼 오답이 있는 학생이 없어요." };
  }

  /**
   * 이번 「앱에 내기」 묶음 id — 만들어지는 과제 전부가 공유한다.
   * 20명이면 과제가 20개 생기는데, 교사 화면은 이 값으로 접어 한 줄로 다룬다.
   */
  const reissueBatchId = `reissue-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;

  const createdLocal: ClassAssignment[] = [];
  const publishItems: Array<{
    problemSet: SavedProblemSet;
    assignment: ClassAssignment;
  }> = [];

  for (const student of students) {
    const input = buildReissueProblemSetInput(source, student.wrongAnswers);
    if (!input) continue;

    const created = appendProblemSet({
      ...input,
      assignedClassIds: [classId],
    });
    const titled = updateProblemSet(loadProblemSets(), created.id, {
      title: reissueProblemSetTitle(source),
    });
    persistProblemSets(titled);
    const problemSet =
      titled.find((item) => item.id === created.id) ?? created;

    const assignment = createClassAssignment({
      problemSetId: problemSet.id,
      classId,
      lessonDate,
      deadlineDate: ASSIGNMENT_NO_DEADLINE_DATE,
      deadlineTime: ASSIGNMENT_NO_DEADLINE_TIME,
      targetStudentId: student.studentId,
      sourceAssignmentId,
      reissueBatchId,
    });
    createdLocal.push(assignment);
    publishItems.push({ problemSet, assignment });
  }

  if (publishItems.length === 0) {
    return { ok: false, message: "다시 출제할 문제를 만들지 못했어요." };
  }

  const previous = loadClassAssignments();
  saveClassAssignments(
    [...previous, ...createdLocal].sort((a, b) =>
      b.assignedAt.localeCompare(a.assignedAt),
    ),
  );

  try {
    await publishTargetedStudentAssignments(publishItems);
  } catch {
    return {
      ok: false,
      message: "앱에 보내지 못했어요. 다시 시도해 주세요.",
    };
  }

  return { ok: true, count: publishItems.length };
}
