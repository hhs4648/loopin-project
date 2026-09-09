import {
  stripMeaningParens,
  type ProblemGrammar,
  type ProblemSentence,
  type ProblemWord,
} from "@/lib/problem-bank";
import type { WordMatchPair } from "@/components/teacher/preview/WordMatchPreview";
import type { WordQuizQuestion } from "@/components/teacher/preview/WordQuizPreview";
import type { WordSpellQuestion } from "@/components/teacher/preview/WordSpellPreview";
import type { BodyTextAQuestion } from "@/components/teacher/preview/BodyTextAPreview";
import {
  normalizeBodyTextBChunk,
  type BodyTextBQuestion,
} from "@/components/teacher/preview/BodyTextBPreview";
import type { BodyTextCQuestion } from "@/components/teacher/preview/BodyTextCPreview";
import type { GrammarType1Question } from "@/components/teacher/preview/GrammarType1Preview";
import type { GrammarType2Step } from "@/components/teacher/preview/GrammarType2Preview";
import { extractCloze } from "@/lib/word-cloze";
import {
  canBuildArrangeQuestion,
  isGivenWord,
  partitionChunkSlots,
} from "@/lib/ai/given-chunks";
import { sanitizeChunkParts } from "@/lib/ai/phrase-chunks";

export type PreviewSection =
  | { kind: "word-match"; label: string; pairs: WordMatchPair[] }
  | { kind: "word-listen-match"; label: string; pairs: WordMatchPair[] }
  | { kind: "word-quiz"; label: string; question: WordQuizQuestion }
  | { kind: "word-spell"; label: string; question: WordSpellQuestion }
  | { kind: "body-text-a"; label: string; question: BodyTextAQuestion }
  | { kind: "body-text-b"; label: string; question: BodyTextBQuestion }
  | { kind: "body-text-c"; label: string; question: BodyTextCQuestion }
  | { kind: "grammar-ox"; label: string; steps: GrammarType2Step[] }
  | { kind: "grammar-choice-1"; label: string; question: GrammarType1Question }
  | { kind: "grammar-choice-2"; label: string; steps: GrammarType2Step[] }
  | { kind: "unavailable"; label: string; reason: string };

// --- shared helpers (ported from loopin-webapp's build-session-sections.ts) ---

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

function stripBrackets(text: string): string {
  return text
    .replace(/\[([^\]]+)\]/g, "$1")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitChunks(text: string | undefined, fallback: string): string[] {
  const source = text?.includes("/") ? text : fallback;
  if (source.includes("/")) {
    return sanitizeChunkParts(
      source
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean),
    );
  }
  return sanitizeChunkParts(
    stripBrackets(source)
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

function buildThreeChoices(
  correct: string,
  distractorPool: string[],
): string[] | null {
  const unique = [
    ...new Set(distractorPool.filter((item) => item && item !== correct)),
  ];
  if (unique.length < 2) return null;
  const distractors = shuffle(unique).slice(0, 2);
  const slot = Math.floor(Math.random() * 3);
  const options = [...distractors];
  options.splice(slot, 0, correct);
  return options;
}

function parseGrammarChoices(choices: string | undefined): string[] {
  return (choices ?? "")
    .split(/[|/]/)
    .map((choice) => choice.trim())
    .filter((choice) => choice && choice !== "-");
}

// --- word ---

function wordMeaning(word: ProblemWord): string {
  return stripMeaningParens(word.korean);
}

export function buildWordMatchPreview(
  item: ProblemWord,
  pool: ProblemWord[],
): PreviewSection {
  const valid = pool.filter((word) => word.english.trim() && wordMeaning(word));
  if (!item.english.trim() || !wordMeaning(item)) {
    return {
      kind: "unavailable",
      label: "짝맞추기",
      reason: "영어·한글 뜻이 모두 있어야 미리볼 수 있어요.",
    };
  }

  const others = shuffle(valid.filter((word) => word.id !== item.id));
  const fillers = others.slice(0, 3);
  const pairs: WordMatchPair[] = [
    { id: item.id, english: item.english.trim(), korean: wordMeaning(item) },
    ...fillers.map((word) => ({
      id: word.id,
      english: word.english.trim(),
      korean: wordMeaning(word),
    })),
  ];

  return { kind: "word-match", label: "짝맞추기", pairs: shuffle(pairs) };
}

export function buildWordListenMatchPreview(
  item: ProblemWord,
  pool: ProblemWord[],
): PreviewSection {
  const valid = pool.filter((word) => word.english.trim() && wordMeaning(word));
  if (!item.english.trim() || !wordMeaning(item)) {
    return {
      kind: "unavailable",
      label: "음성 짝맞추기",
      reason: "영어·한글 뜻이 모두 있어야 미리볼 수 있어요.",
    };
  }

  const others = shuffle(valid.filter((word) => word.id !== item.id));
  const fillers = others.slice(0, 3);
  const pairs: WordMatchPair[] = [
    { id: item.id, english: item.english.trim(), korean: wordMeaning(item) },
    ...fillers.map((word) => ({
      id: word.id,
      english: word.english.trim(),
      korean: wordMeaning(word),
    })),
  ];

  return {
    kind: "word-listen-match",
    label: "음성 짝맞추기",
    pairs: shuffle(pairs),
  };
}

export function buildWordQuizPreview(
  item: ProblemWord,
  pool: ProblemWord[],
): PreviewSection {
  const correct = wordMeaning(item);
  const distractorPool = pool
    .filter((word) => word.id !== item.id && wordMeaning(word))
    .map((word) => wordMeaning(word));
  const options = buildThreeChoices(correct, distractorPool);
  if (!options) {
    return {
      kind: "unavailable",
      label: "3지선다",
      reason: "오답 선택지를 만들 다른 단어가 이 단원에 2개 이상 있어야 해요.",
    };
  }

  return {
    kind: "word-quiz",
    label: "3지선다",
    question: {
      id: `${item.id}:choice`,
      word: item.english,
      correctAnswer: correct,
      options,
    },
  };
}

export function buildWordSpellPreview(item: ProblemWord): PreviewSection {
  const cloze = extractCloze(item.exampleEn, item.english);
  if (!cloze) {
    return {
      kind: "unavailable",
      label: "예문 빈칸",
      reason: "예문에 영어 단어(활용형 포함)와 같은 부분이 있어야 빈칸을 만들 수 있어요.",
    };
  }

  const meaning = wordMeaning(item);
  return {
    kind: "word-spell",
    label: "예문 빈칸",
    question: {
      id: `${item.id}:spell`,
      korean: item.exampleKo || meaning,
      englishBefore: cloze.englishBefore,
      englishAfter: cloze.englishAfter,
      answer: cloze.answer,
      answerHint: `${cloze.answer}(${meaning})`,
      parts: cloze.parts,
    },
  };
}

// --- sentence ---

export function buildBodyTextAPreview(item: ProblemSentence): PreviewSection {
  const slots = partitionChunkSlots(splitChunks(item.chunksKo, item.korean));
  if (!canBuildArrangeQuestion(slots)) {
    return {
      kind: "unavailable",
      label: "번역 배열",
      reason: "한글 뜻이 2조각 이상으로 나뉘어야 해요 (chunksKo 또는 '/' 구분).",
    };
  }

  return {
    kind: "body-text-a",
    label: "번역 배열",
    question: {
      id: `${item.id}:translate`,
      exampleEn: stripBrackets(item.english),
      exampleKo: stripBrackets(item.korean),
      slots,
    },
  };
}

export function buildBodyTextBPreview(item: ProblemSentence): PreviewSection {
  const slots = partitionChunkSlots(splitChunks(item.chunksEn, item.english))
    .map((slot) =>
      slot.kind === "playable"
        ? { ...slot, label: normalizeBodyTextBChunk(slot.label) }
        : slot,
    )
    .filter((slot) => slot.label);
  if (!canBuildArrangeQuestion(slots)) {
    return {
      kind: "unavailable",
      label: "청크배열",
      reason: "영어 예문이 2조각 이상으로 나뉘어야 해요 (chunksEn 또는 '/' 구분).",
    };
  }

  return {
    kind: "body-text-b",
    label: "청크배열",
    question: {
      id: `${item.id}:chunk`,
      promptKo: stripBrackets(item.korean),
      exampleEn: stripBrackets(item.english),
      slots,
    },
  };
}

export function buildBodyTextCPreview(item: ProblemSentence): PreviewSection {
  const keywords = (item.hint
    ? item.hint
        .split(/[,/]/)
        .map((part) => part.trim())
        .filter(Boolean)
    : splitChunks(item.chunksEn, item.english)
  )
    .filter((part) => !isGivenWord(part) && !isGivenWord(part.split(/\s+/)[0] ?? ""))
    .slice(0, 3);

  return {
    kind: "body-text-c",
    label: "영작",
    question: {
      id: `${item.id}:write`,
      promptKo: stripBrackets(item.korean),
      keywords:
        keywords.length > 0
          ? keywords
          : [stripBrackets(item.english).split(/\s+/)[0] ?? ""],
      exampleEn: stripBrackets(item.english),
    },
  };
}

// --- grammar ---

/**
 * OX 미리보기.
 * 정답이 X이고 교정(3지선다)이 만들어지면 **폰 두 개**로 나란히 보여 주려고
 * 섹션을 둘로 나눈다 — 학생앱에선 이어지지만, 미리보기에선 한눈에 보고 싶다.
 */
export function buildGrammarOxPreview(item: ProblemGrammar): PreviewSection[] {
  const ox = item.ox?.trim().toUpperCase();
  if (ox !== "O" && ox !== "X") {
    return [
      {
        kind: "unavailable",
        label: "OX문제",
        reason: "O/X 정답 값이 있어야 해요.",
      },
    ];
  }

  const correctOptionId = ox === "O" ? "o" : "x";
  const oxStep: GrammarType2Step = {
    kind: "ox",
    id: `${item.id}:ox`,
    maskPassage: true,
    passageLines: [stripBrackets(item.english)],
    correctOptionId,
  };
  const sections: PreviewSection[] = [
    { kind: "grammar-ox", label: "OX문제", steps: [oxStep] },
  ];

  if (correctOptionId !== "x") return sections;

  const target = item.wrongPart?.trim();
  const english = stripBrackets(item.english);
  const targetIndex = target
    ? english.toLowerCase().indexOf(target.toLowerCase())
    : -1;
  const choices = parseGrammarChoices(item.choices);

  if (!target || targetIndex < 0 || choices.length < 3) return sections;

  const matchedPart = english.slice(targetIndex, targetIndex + target.length);
  const before = english.slice(0, targetIndex);
  const after = english.slice(targetIndex + target.length);
  const correct = choices[0]!;
  const options = shuffle(choices.slice(0, 3)).map((label, index) => ({
    id: `${item.id}:ox-fix:${index}:${label}`,
    label,
  }));
  const correctOption = options.find((option) => option.label === correct);
  if (!correctOption) return sections;

  sections.push({
    kind: "grammar-ox",
    label: "교정 문제",
    steps: [
      {
        kind: "word-choice",
        id: `${item.id}:ox-fix`,
        options,
        correctOptionId: correctOption.id,
        maskPassage: true,
        passageBefore: before.trimEnd(),
        wrongPart: matchedPart,
        passageAfter: after.trimStart(),
      },
    ],
  });
  return sections;
}

export function buildGrammarChoicePreview(
  item: ProblemGrammar,
): PreviewSection | null {
  const choices = parseGrammarChoices(item.choices);
  const target = item.wrongPart?.trim();

  if (
    choices.length < 2 ||
    !target ||
    target === "-" ||
    !item.english.includes(target)
  ) {
    return null;
  }

  // target이 두 번 이상 나오면 split은 세 번째 조각부터 버린다 → 첫 출현 위치에서만 자른다.
  const targetIndex = item.english.indexOf(target);
  if (targetIndex < 0) return null;
  const before = item.english.slice(0, targetIndex);
  const after = item.english.slice(targetIndex + target.length);
  const correct = choices[0]!;
  const options = shuffle(choices).map((label, index) => ({
    id: `${item.id}:opt:${index}:${label}`,
    label,
  }));
  const correctOption = options.find((option) => option.label === correct);
  if (!correctOption) {
    return null;
  }

  if (choices.length === 2) {
    return {
      kind: "grammar-choice-1",
      label: "선택형 문제",
      question: {
        id: `${item.id}:choice`,
        maskPassage: true,
        passageBefore: before.trimEnd(),
        passageAfter: after.trimStart(),
        options,
        correctOptionId: correctOption.id,
      },
    };
  }

  const sliced = options.slice(0, 3);
  const slicedCorrect =
    sliced.find((option) => option.label === correct)?.id ?? sliced[0]!.id;

  return {
    kind: "grammar-choice-2",
    label: "선택형 문제",
    steps: [
      {
        kind: "word-choice",
        id: `${item.id}:choice`,
        options: sliced,
        correctOptionId: slicedCorrect,
        maskPassage: true,
        passageBefore: before.trimEnd(),
        wrongPart: target,
        passageAfter: after.trimStart(),
      },
    ],
  };
}

// --- entry points used by PreviewModal ---

export function buildWordPreviewSections(
  item: ProblemWord,
  pool: ProblemWord[],
  checkedTypes: string[],
): PreviewSection[] {
  const sections: PreviewSection[] = [];
  if (checkedTypes.includes("짝맞추기")) sections.push(buildWordMatchPreview(item, pool));
  if (
    checkedTypes.includes("음성 짝맞추기") ||
    checkedTypes.includes("TTS 뜻 짝맞추기") ||
    checkedTypes.includes("듣기 짝맞추기")
  ) {
    sections.push(buildWordListenMatchPreview(item, pool));
  }
  if (checkedTypes.includes("3지선다")) sections.push(buildWordQuizPreview(item, pool));
  if (checkedTypes.includes("예문 빈칸")) sections.push(buildWordSpellPreview(item));
  return sections;
}

export function buildSentencePreviewSections(
  item: ProblemSentence,
  checkedTypes: string[],
): PreviewSection[] {
  const sections: PreviewSection[] = [];
  if (checkedTypes.includes("번역 배열")) sections.push(buildBodyTextAPreview(item));
  if (checkedTypes.includes("청크배열")) sections.push(buildBodyTextBPreview(item));
  if (checkedTypes.includes("영작")) sections.push(buildBodyTextCPreview(item));
  return sections;
}

export function buildGrammarPreviewSections(
  item: ProblemGrammar,
  checkedTypes: string[],
): PreviewSection[] {
  const sections: PreviewSection[] = [];
  if (checkedTypes.includes("OX문제")) {
    sections.push(...buildGrammarOxPreview(item));
  }
  if (checkedTypes.includes("선택형 문제")) {
    const choice = buildGrammarChoicePreview(item);
    if (choice) sections.push(choice);
  }
  return sections;
}
