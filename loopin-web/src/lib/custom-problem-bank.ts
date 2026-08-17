import {
  formatChunkLine,
  splitEnglishChunksPhrase,
  splitKoreanChunksPhrase,
} from "@/lib/ai/phrase-chunks";
import type {
  ProblemGrammar,
  ProblemSentence,
  ProblemWord,
} from "@/lib/problem-bank";

const STORAGE_KEY = "loopin-custom-problem-bank";
const CHANGE_EVENT = "loopin-custom-problem-bank-changed";

export type CustomProblemBank = {
  words: ProblemWord[];
  sentences: ProblemSentence[];
  grammar: ProblemGrammar[];
};

function emptyBank(): CustomProblemBank {
  return { words: [], sentences: [], grammar: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function loadRaw(): CustomProblemBank {
  if (typeof window === "undefined") return emptyBank();
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) || "null",
    ) as unknown;
    if (!isRecord(parsed)) return emptyBank();
    return {
      words: Array.isArray(parsed.words) ? (parsed.words as ProblemWord[]) : [],
      sentences: Array.isArray(parsed.sentences)
        ? (parsed.sentences as ProblemSentence[])
        : [],
      grammar: Array.isArray(parsed.grammar)
        ? (parsed.grammar as ProblemGrammar[])
        : [],
    };
  } catch {
    return emptyBank();
  }
}

function saveRaw(bank: CustomProblemBank) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bank));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function loadCustomProblemBank(): CustomProblemBank {
  return loadRaw();
}

export function subscribeCustomProblemBank(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index < 0) return [...list, item];
  const next = [...list];
  next[index] = item;
  return next;
}

export type CustomWordInput = {
  grade: string;
  textbook: string;
  unit: string;
  english: string;
  korean: string;
  exampleEn?: string;
  exampleKo?: string;
};

export type CustomSentenceInput = {
  grade: string;
  textbook: string;
  unit: string;
  english: string;
  korean: string;
  chunksEn?: string;
  chunksKo?: string;
  hint?: string;
};

export type CustomGrammarInput = {
  grade: string;
  textbook: string;
  unit: string;
  english: string;
  korean: string;
  ox: "O" | "X";
  wrongPart?: string;
  choices?: string;
  explanation?: string;
  major?: string;
  minor?: string;
};

function buildWord(
  input: CustomWordInput,
  id: string,
  base?: ProblemWord,
): ProblemWord {
  return {
    id,
    textbook: input.textbook,
    grade: input.grade,
    unit: input.unit,
    category: base?.category ?? "직접 추가",
    isBasicWord: base?.isBasicWord ?? false,
    english: input.english.trim(),
    korean: input.korean.trim(),
    exampleEn: (input.exampleEn ?? "").trim(),
    exampleKo: (input.exampleKo ?? "").trim(),
  };
}

function buildSentence(
  input: CustomSentenceInput,
  id: string,
  base?: ProblemSentence,
): ProblemSentence {
  const english = input.english.trim();
  const korean = input.korean.trim();
  // 교사가 청크를 비워 두면 「자동 나눔」과 같은 규칙으로 채운다 (어절 단위로 쪼개지 않음)
  const chunksEn =
    (input.chunksEn ?? "").trim() ||
    formatChunkLine(splitEnglishChunksPhrase(english));
  const chunksKo =
    (input.chunksKo ?? "").trim() ||
    formatChunkLine(splitKoreanChunksPhrase(korean));
  return {
    id,
    textbook: input.textbook,
    grade: input.grade,
    unit: input.unit,
    english,
    korean,
    chunksEn,
    chunksKo,
    wrongChunks: base?.wrongChunks ?? "",
    hint: (input.hint ?? "").trim(),
  };
}

function buildGrammar(
  input: CustomGrammarInput,
  id: string,
  base?: ProblemGrammar,
): ProblemGrammar {
  const ox = input.ox;
  const wrongPart =
    ox === "O"
      ? (input.wrongPart ?? "").trim() || "-"
      : (input.wrongPart ?? "").trim();
  const choices = (input.choices ?? "").trim() || "-";
  return {
    id,
    textbook: input.textbook,
    grade: input.grade,
    unit: input.unit,
    no: base?.no ?? "1",
    major: (input.major ?? "").trim() || base?.major || "직접 추가",
    minor: (input.minor ?? "").trim() || base?.minor || "직접 추가",
    representative: base?.representative ?? "O",
    english: input.english.trim(),
    ox,
    wrongPart: wrongPart || "-",
    korean: input.korean.trim(),
    choices,
    explanation: (input.explanation ?? "").trim() || "-",
  };
}

export function appendCustomWord(input: CustomWordInput): ProblemWord {
  const bank = loadRaw();
  const item = buildWord(input, createId("word-custom"));
  saveRaw({ ...bank, words: [...bank.words, item] });
  return item;
}

export function appendCustomSentence(
  input: CustomSentenceInput,
): ProblemSentence {
  const bank = loadRaw();
  const item = buildSentence(input, createId("sent-custom"));
  saveRaw({ ...bank, sentences: [...bank.sentences, item] });
  return item;
}

export function appendCustomGrammar(
  input: CustomGrammarInput,
): ProblemGrammar {
  const bank = loadRaw();
  const item = buildGrammar(input, createId("gram-custom"), {
    id: "",
    textbook: input.textbook,
    grade: input.grade,
    unit: input.unit,
    no: String(bank.grammar.length + 1),
    major: "직접 추가",
    minor: "직접 추가",
    representative: "O",
    english: "",
    ox: "O",
    wrongPart: "-",
    korean: "",
    choices: "-",
    explanation: "-",
  });
  saveRaw({ ...bank, grammar: [...bank.grammar, item] });
  return item;
}

/** 기존 교과서·직접추가 항목 수정 (같은 id로 덮어씀) */
export function upsertCustomWord(
  base: ProblemWord,
  input: CustomWordInput,
): ProblemWord {
  const bank = loadRaw();
  const item = buildWord(input, base.id, base);
  saveRaw({ ...bank, words: upsertById(bank.words, item) });
  return item;
}

export function upsertCustomSentence(
  base: ProblemSentence,
  input: CustomSentenceInput,
): ProblemSentence {
  const bank = loadRaw();
  const item = buildSentence(input, base.id, base);
  saveRaw({ ...bank, sentences: upsertById(bank.sentences, item) });
  return item;
}

export function upsertCustomGrammar(
  base: ProblemGrammar,
  input: CustomGrammarInput,
): ProblemGrammar {
  const bank = loadRaw();
  const item = buildGrammar(input, base.id, base);
  saveRaw({ ...bank, grammar: upsertById(bank.grammar, item) });
  return item;
}
