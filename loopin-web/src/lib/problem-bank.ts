import bankIndex from "@/data/problem-bank-index.json";
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

export type ProblemBankChunk = {
  words: ProblemWord[];
  sentences: ProblemSentence[];
  grammar: ProblemGrammar[];
};

/**
 * **문제은행은 교과서 단위로 나눠 받는다.**
 *
 * 단어가 9,590개가 되면서 `problem-bank.json`이 2.9MB가 됐다. 예전처럼 통째로 import하면
 * 문제 출제 화면을 열 때마다 그 2.9MB가 번들에 실려 나간다 — 선생님이 실제로 쓰는 건
 * 자기 교과서 한 종뿐인데도. 그래서 `scripts/split-problem-bank.mjs`가 `(학년·교과서)`
 * 단위로 잘라 `public/problem-bank/bNN.json`에 두고, 번들에는 목록·개수·숙어만 담긴
 * 인덱스(40KB)만 남긴다.
 *
 * 읽기(`getUnitContent`)는 **예전처럼 동기**다. 대신 그 단원 조각이 먼저 받아져 있어야
 * 한다 — 화면은 `useUnitBank`(`@/lib/use-unit-bank`)가 알아서 받고, 저장된 과제를 다루는
 * 흐름은 `ensureUnitsLoaded`로 미리 받아 둔다. 안 받힌 채로 읽으면 개발 모드에서 경고가
 * 뜬다(운영에서는 조용히 빈 목록 — 화면이 깨지는 것보다 낫다).
 */
const EMPTY_CHUNK: ProblemBankChunk = { words: [], sentences: [], grammar: [] };

const CHUNK_IDS = bankIndex.chunks as Record<string, string>;

/** 단원별 항목 수 — 조각을 안 받고도 목록·개수를 그릴 수 있다 */
export type ProblemBankScope = {
  grade: string;
  textbook: string;
  unit: string;
  words: number;
  sentences: number;
  grammar: number;
};
export const problemBankScopes = bankIndex.scopes as ProblemBankScope[];

const loadedChunks = new Map<string, ProblemBankChunk>();
const pendingChunks = new Map<string, Promise<ProblemBankChunk>>();
const listeners = new Set<() => void>();
const warned = new Set<string>();

function chunkIdFor(query: Pick<ProblemBankQuery, "grade" | "textbook">): string | null {
  return CHUNK_IDS[`${query.grade}|${query.textbook}`] ?? null;
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/** 조각이 받아졌을 때 다시 그리도록 — `useUnitBank`가 쓴다 */
export function subscribeProblemBank(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 그 교과서 조각이 이미 있는지 (데이터가 아예 없는 교과서면 받을 것도 없으므로 true) */
export function isUnitLoaded(query: Pick<ProblemBankQuery, "grade" | "textbook">): boolean {
  const id = chunkIdFor(query);
  return !id || loadedChunks.has(id);
}

/** 그 교과서 조각을 받아 둔다. 같은 조각을 여러 번 불러도 요청은 한 번이다. */
export async function ensureUnitLoaded(
  query: Pick<ProblemBankQuery, "grade" | "textbook">,
): Promise<void> {
  const id = chunkIdFor(query);
  if (!id || loadedChunks.has(id)) return;
  if (typeof window === "undefined") return;

  let pending = pendingChunks.get(id);
  if (!pending) {
    pending = fetch(`/problem-bank/${id}.json`)
      .then((res) => (res.ok ? (res.json() as Promise<ProblemBankChunk>) : EMPTY_CHUNK))
      .catch(() => EMPTY_CHUNK)
      .then((chunk) => {
        loadedChunks.set(id, {
          words: chunk.words ?? [],
          sentences: chunk.sentences ?? [],
          grammar: chunk.grammar ?? [],
        });
        pendingChunks.delete(id);
        notify();
        return chunk;
      });
    pendingChunks.set(id, pending);
  }
  await pending;
}

/**
 * 여러 단원 조각을 한꺼번에 받아 둔다.
 * 저장된 과제를 다루는 흐름(스냅샷·동기화·오답 학습지)은 지금 화면에 없는 단원도
 * 읽으므로, 그 과제들의 교과서를 미리 받아 두는 자리에서 쓴다.
 */
export async function ensureUnitsLoaded(
  queries: Pick<ProblemBankQuery, "grade" | "textbook">[],
): Promise<void> {
  const seen = new Set<string>();
  const jobs: Promise<void>[] = [];
  for (const query of queries) {
    const key = `${query.grade}|${query.textbook}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push(ensureUnitLoaded(query));
  }
  await Promise.all(jobs);
}

function getChunk(query: ProblemBankQuery): ProblemBankChunk {
  const id = chunkIdFor(query);
  if (!id) return EMPTY_CHUNK;
  const chunk = loadedChunks.get(id);
  if (chunk) return chunk;
  if (process.env.NODE_ENV !== "production" && !warned.has(id)) {
    warned.add(id);
    console.warn(
      `[problem-bank] ${query.grade} ${query.textbook} 조각을 안 받은 채로 읽었습니다. ` +
        "화면이면 useUnitBank, 그 밖이면 ensureUnitsLoaded를 먼저 부르세요.",
    );
  }
  return EMPTY_CHUNK;
}

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
  const chunk = getChunk(query);

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
    words: merge(chunk.words, custom.words),
    sentences: merge(chunk.sentences, custom.sentences),
    grammar: merge(chunk.grammar, custom.grammar),
  };
}

/** 조각을 받은 뒤 읽는다 — 지금 화면에 없는 단원을 다룰 때 쓴다 */
export async function loadUnitContent(query: ProblemBankQuery) {
  await ensureUnitLoaded(query);
  return getUnitContent(query);
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
 *
 * 조각을 안 받아도 되도록 **인덱스에 미리 뽑아 둔 목록**을 쓴다(9,590개 중 902개뿐).
 */
export function getAllIdioms(): string[] {
  const custom = loadCustomProblemBank();
  return [
    ...new Set([
      ...(bankIndex.idioms as string[]),
      ...custom.words
        .map((word) => word.english.trim())
        .filter((english) => /\s/.test(english)),
    ]),
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

/**
 * 단어 뜻에서 괄호 안 부가 설명은 빼 둔다.
 * 문제(짝맞추기·3지선다 등)에만 쓰고, 수정 칸·문제은행 원문은 그대로 둔다.
 * 예: `(비 등이) 거센` → `거센`, `응급(상황)` → `응급`
 */
export function stripMeaningParens(text: string): string {
  const source = text.trim();
  if (!source) return source;

  let next = source;
  for (let i = 0; i < 8; i += 1) {
    const stripped = next.replace(/[（(][^（）()]*[）)]/g, "");
    if (stripped === next) break;
    next = stripped;
  }

  const cleaned = next
    .replace(/\s+/g, " ")
    .replace(/\s*([,;])\s*/g, "$1 ")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned) return cleaned;

  const inner = source.replace(/^[（(]/, "").replace(/[）)]$/, "").trim();
  return inner || source;
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
