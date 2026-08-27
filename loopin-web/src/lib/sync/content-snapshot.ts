import type {
  ContentSnapshot,
  ProblemGrammarSnapshot,
  ProblemSentenceSnapshot,
  ProblemWordSnapshot,
} from "@/lib/sync/types";
import { getUnitContent } from "@/lib/problem-bank";
import type {
  CreateProblemSetInput,
  CustomAssignmentDraft,
  SavedProblemSet,
} from "@/lib/problem-sets";
import { ensureWordCloze } from "@/lib/word-cloze";

function buildCustomDraftSnapshot(
  input: Pick<
    SavedProblemSet | CreateProblemSetInput,
    "grade" | "textbook" | "unit" | "items" | "problemTypes"
  > & { title?: string; customDraft?: CustomAssignmentDraft },
  draft: CustomAssignmentDraft,
): ContentSnapshot {
  const selected = new Set(draft.selectedIds);
  const analyses = Object.values(draft.analyses).filter(
    (item) => selected.size === 0 || selected.has(item.id),
  );

  const words: ProblemWordSnapshot[] = analyses.map((item) => ({
    id: item.id,
    english: (item.lemma || item.surface).trim() || item.surface,
    korean: item.meaningKo.trim() || item.surface,
    exampleEn:
      ensureWordCloze(item.sourceSentence, item.surface) ??
      ensureWordCloze(item.sourceSentence, item.lemma || "") ??
      item.sourceSentence.trim(),
    exampleKo: item.translationKo.trim() || undefined,
  }));

  const sentences: ProblemSentenceSnapshot[] = Object.values(
    draft.sentenceDrafts,
  )
    .sort((a, b) => a.sentenceIndex - b.sentenceIndex)
    .map((item) => ({
      id: `custom-s-${item.sentenceIndex}`,
      english: item.english.trim(),
      korean: item.translationKo.trim(),
      chunksEn: item.chunksEn.trim() || undefined,
      chunksKo: item.chunksKo.trim() || undefined,
    }))
    .filter((item) => item.english);

  // 문장유형만 켜져 있고 draft에 문장 행이 없으면 본문 문장으로 보정
  if (
    sentences.length === 0 &&
    input.problemTypes.sentences.length > 0 &&
    draft.passage.trim()
  ) {
    const parts = draft.passage
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const meanings = draft.passageMeanings;
    for (let i = 0; i < parts.length; i += 1) {
      sentences.push({
        id: `custom-s-${i}`,
        english: parts[i]!,
        korean: meanings[i]?.trim() || "",
      });
    }
  }

  return {
    version: 1,
    title:
      input.title ?? `${input.grade} · ${input.textbook} · ${input.unit}`,
    grade: input.grade,
    textbook: input.textbook,
    unit: input.unit,
    problemTypes: {
      words: [...input.problemTypes.words],
      sentences: [...input.problemTypes.sentences],
      grammar: [...input.problemTypes.grammar],
    },
    words,
    sentences,
    grammar: [],
  };
}

export function buildContentSnapshot(
  input: Pick<
    SavedProblemSet | CreateProblemSetInput,
    "grade" | "textbook" | "unit" | "items" | "problemTypes"
  > & { title?: string; customDraft?: CustomAssignmentDraft },
): ContentSnapshot {
  if (input.customDraft) {
    return buildCustomDraftSnapshot(input, input.customDraft);
  }

  // 예전 오답 재출제가 unit에 `· 오답`을 붙여 저장한 경우가 있다.
  // 문제은행 조회 키만 원래 단원명으로 되돌린다 (스냅샷 unit 표기는 그대로).
  const bankUnit = input.unit.replace(/\s·\s오답(?:\s.*)?$/, "").trim();
  const unit = getUnitContent({
    grade: input.grade,
    textbook: input.textbook,
    unit: bankUnit || input.unit,
  });
  const wordIds = new Set(input.items.words);
  const sentenceIds = new Set(input.items.sentences);
  const grammarIds = new Set(input.items.grammar);

  const words: ProblemWordSnapshot[] = unit.words
    .filter((w) => wordIds.has(w.id))
    .map((w) => ({
      id: w.id,
      english: w.english,
      korean: w.korean,
      exampleEn: ensureWordCloze(w.exampleEn, w.english) ?? w.exampleEn,
      exampleKo: w.exampleKo,
    }));

  const sentences: ProblemSentenceSnapshot[] = unit.sentences
    .filter((s) => sentenceIds.has(s.id))
    .map((s) => ({
      id: s.id,
      english: s.english,
      korean: s.korean,
      chunksEn: s.chunksEn,
      chunksKo: s.chunksKo,
      wrongChunks: s.wrongChunks,
      hint: s.hint,
    }));

  const grammar: ProblemGrammarSnapshot[] = unit.grammar
    .filter((g) => grammarIds.has(g.id))
    .map((g) => ({
      id: g.id,
      english: g.english,
      korean: g.korean,
      ox: g.ox,
      wrongPart: g.wrongPart,
      choices: g.choices,
      explanation: g.explanation,
      // 학생앱 복습 탭의 유형(문법 개념)별 정답률 집계용 — 비어 있으면 담지 않는다.
      major: g.major?.trim() || undefined,
      minor: g.minor?.trim() || undefined,
    }));

  return {
    version: 1,
    title:
      input.title ??
      `${input.grade} · ${input.textbook} · ${input.unit}`,
    grade: input.grade,
    textbook: input.textbook,
    unit: input.unit,
    problemTypes: {
      words: [...input.problemTypes.words],
      sentences: [...input.problemTypes.sentences],
      grammar: [...input.problemTypes.grammar],
    },
    words,
    sentences,
    grammar,
  };
}

export function countSnapshotQuestions(snapshot: ContentSnapshot): number {
  const wordTypes = snapshot.problemTypes.words.length || 1;
  const sentenceTypes = snapshot.problemTypes.sentences.length || 1;
  const grammarTypes = snapshot.problemTypes.grammar.length || 1;
  return (
    snapshot.words.length * wordTypes +
    snapshot.sentences.length * sentenceTypes +
    snapshot.grammar.length * grammarTypes
  );
}
