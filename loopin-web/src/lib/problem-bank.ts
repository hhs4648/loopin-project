import bankData from "@/data/problem-bank.json";
import { loadCustomProblemBank } from "@/lib/custom-problem-bank";

export type ProblemWord = {
  id: string;
  textbook: string;
  grade: string;
  unit: string;
  category: string;
  isBasicWord: boolean;
  english: string;
  korean: string;
  exampleEn: string;
  exampleKo: string;
};

export type ProblemSentence = {
  id: string;
  textbook: string;
  grade: string;
  unit: string;
  english: string;
  korean: string;
  chunksEn: string;
  chunksKo: string;
  wrongChunks?: string;
  hint?: string;
};

export type ProblemGrammar = {
  id: string;
  textbook: string;
  grade: string;
  unit: string;
  no: string;
  major: string;
  minor: string;
  representative: string;
  english: string;
  ox: string;
  wrongPart: string;
  korean: string;
  choices: string;
  explanation: string;
};

export type ProblemBankQuery = {
  grade: string;
  textbook: string;
  unit: string;
};

type BankFile = {
  words?: ProblemWord[];
  sentences?: ProblemSentence[];
  grammar?: ProblemGrammar[];
  items?: ProblemWord[];
};

const data = bankData as BankFile;

function matchScope<T extends { grade: string; textbook: string; unit: string }>(
  list: T[],
  query: ProblemBankQuery
): T[] {
  return list.filter(
    (item) =>
      item.grade === query.grade &&
      item.textbook === query.textbook &&
      item.unit === query.unit
  );
}

export function getUnitContent(query: ProblemBankQuery) {
  const custom = loadCustomProblemBank();

  const merge = <T extends { id: string; grade: string; textbook: string; unit: string }>(
    bankItems: T[],
    customItems: T[],
  ): T[] => {
    const scopedBank = matchScope(bankItems, query);
    const scopedCustom = matchScope(customItems, query);
    const bankIds = new Set(scopedBank.map((item) => item.id));
    const overrideById = new Map(
      scopedCustom
        .filter((item) => bankIds.has(item.id))
        .map((item) => [item.id, item] as const),
    );
    return [
      ...scopedBank.map((item) => overrideById.get(item.id) ?? item),
      ...scopedCustom.filter((item) => !bankIds.has(item.id)),
    ];
  };

  return {
    words: merge(data.words ?? data.items ?? [], custom.words),
    sentences: merge(data.sentences ?? [], custom.sentences),
    grammar: merge(data.grammar ?? [], custom.grammar),
  };
}

/**
 * 해당 단원 어휘 중 **여러 단어짜리 항목**(`be related to`, `On the other hand`).
 * 청크 자동 나눔에 넘기면 그 단원에서만 쓰는 숙어까지 쪼개지지 않는다.
 * 교사가 직접 추가한 단어도 포함된다.
 */
export function getUnitIdioms(query: ProblemBankQuery): string[] {
  return getUnitContent(query)
    .words.map((word) => word.english.trim())
    .filter((english) => /\s/.test(english));
}

/**
 * 단원 구분 없이 알고 있는 숙어 전부.
 * 사용자 지정 과제처럼 교과서 단원이 정해지지 않은 흐름에서 쓴다.
 */
export function getAllIdioms(): string[] {
  const custom = loadCustomProblemBank();
  const all = [...(data.words ?? data.items ?? []), ...custom.words];
  return [
    ...new Set(
      all
        .map((word) => word.english.trim())
        .filter((english) => /\s/.test(english)),
    ),
  ];
}

/** @deprecated use getUnitContent */
export type ProblemBankItem = ProblemWord;

/** @deprecated use getUnitContent */
export function getProblemBankItems(query: ProblemBankQuery): ProblemWord[] {
  return getUnitContent(query).words;
}

export function stripBrackets(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, "$1").replace(/\s+/g, " ").trim();
}

export function splitEnglishChunks(sentence: string): string[] {
  if (sentence.includes("/")) {
    return sentence
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const plain = stripBrackets(sentence);
  return plain
    /* `.`는 단어에 붙여 둠 — 청크 자동 나눔에서 마침표만 따로 쪼개지 않음 */
    .replace(/([,!?;:])/g, " $1 ")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function splitKoreanChunks(sentence: string): string[] {
  if (sentence.includes("/")) {
    return sentence
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const plain = stripBrackets(sentence);
  return plain.split(/\s+/).map((s) => s.trim()).filter(Boolean);
}
