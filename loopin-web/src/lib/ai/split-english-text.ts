import { lookupIdiomMeaning } from "@/lib/ai/idiom-meanings";
import { findIdiomSpans } from "@/lib/ai/phrase-chunks";

export type SentenceToken =
  | { kind: "word"; text: string; wordIndex: number }
  | { kind: "gap"; text: string };

export type ParsedSentence = {
  index: number;
  text: string;
  tokens: SentenceToken[];
};

/**
 * **문장부호로만 가른다 — 줄바꿈으로는 안 가른다.**
 *
 * 마침표·물음표·느낌표(뜻은 「。？！」도) 뒤에서 가른다.
 * 뒤에 칸이 없어도 글자가 이어지면 가른다 (`A.B.` → `A.` / `B.`).
 * `3.14`처럼 숫자 소수점은 그대로 둔다.
 *
 * 문장부호 뒤의 **닫는 따옴표는 앞 문장에 붙인다.** 예전 규칙은 마침표 다음 글자가
 * 따옴표라 조건에 안 맞아 **따옴표로 끝나는 문장을 아예 못 갈랐다.** 따옴표를 두 개
 * 쓰는 경우까지 받도록 최대 2개를 허용한다.
 *
 * **줄바꿈(Shift+Enter)은 더 이상 문장 경계가 아니다.** 예전에는 줄바꿈도 경계로 봐서,
 * 선생님이 본문을 보기 좋게 줄만 바꿔도 한 문장이 둘로 쪼개졌다. 문장부호로 끝나고
 * 줄을 바꾼 경우는 그 부호에서 이미 갈리므로 잃는 것이 없다.
 *
 * 대신 **부호 없이 줄만 바꾼 글은 한 문장으로 남는다.** 본문 뜻을 마침표 없이 줄 단위로
 * 적어 오면 영어 문장 수와 안 맞게 되고, 화면에 「문장 수가 다르다」로 보인다.
 */
const ENGLISH_SENTENCE_SPLIT = /(?<=[.!?]['"’”]{0,2})(?:\s+|(?=[A-Za-z가-힣]))/;
const MEANING_SENTENCE_SPLIT =
  /(?<=[.!?。？！]['"’”」』]{0,2})(?:\s+|(?=[A-Za-z가-힣]))/;

/** 영어 텍스트를 문장 단위로 분리 (간단한 규칙 · 목업용) */
export function splitIntoSentences(raw: string): string[] {
  const trimmed = raw.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return [];

  const parts = trimmed
    .split(ENGLISH_SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [trimmed];
}

/** 한글 문장 뜻 — 문장부호·줄바꿈 기준으로 분리 (영어 문장 수와 맞춰 씀) */
export function splitIntoMeaningSentences(raw: string): string[] {
  const trimmed = raw.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return [];

  const parts = trimmed
    .split(MEANING_SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [trimmed];
}

const WORD_RE = /^[A-Za-z]+(?:'[A-Za-z]+)?$/;

/**
 * 한 문장을 클릭 가능한 단어 + 구두점/공백 토큰으로 분리.
 *
 * @param idioms 한 단어처럼 다뤄야 할 숙어. 넘기면 `look at`, `do your best`가
 *   따로따로가 아니라 **하나의 클릭 단위**가 된다. 청크 나눔과 같은 인식기를 쓴다.
 */
export function tokenizeSentence(
  sentence: string,
  idioms: string[] = [],
): SentenceToken[] {
  const tokens: SentenceToken[] = [];
  let wordIndex = 0;

  const pushPlain = (text: string) => {
    for (const chunk of text.split(/(\s+|[^\w\s']+)/)) {
      if (!chunk) continue;
      if (WORD_RE.test(chunk)) {
        tokens.push({ kind: "word", text: chunk, wordIndex });
        wordIndex += 1;
      } else {
        tokens.push({ kind: "gap", text: chunk });
      }
    }
  };

  // `findIdiomSpans`는 **청크를 예쁘게 자르려고** 만든 것이라 `during the`,
  // `have been`, `there is` 같은 문법 덩어리까지 묶는다. 그건 청크엔 맞지만
  // 클릭 단위로는 틀렸다 — 어휘가 아니기 때문이다.
  // 그래서 토큰화에서는 **사전에 실린 숙어이거나 단원 어휘인 것만** 한 덩어리로 둔다.
  const unitVocabulary = new Set(
    idioms.map((phrase) => phrase.trim().toLowerCase()).filter(Boolean),
  );
  const isVocabulary = (text: string) =>
    lookupIdiomMeaning(text) !== null ||
    unitVocabulary.has(text.trim().toLowerCase());

  let cursor = 0;
  for (const span of findIdiomSpans(sentence, idioms).filter((s) =>
    isVocabulary(s.text),
  )) {
    if (span.start > cursor) pushPlain(sentence.slice(cursor, span.start));
    tokens.push({
      kind: "word",
      text: sentence.slice(span.start, span.end),
      wordIndex,
    });
    wordIndex += 1;
    cursor = span.end;
  }
  if (cursor < sentence.length) pushPlain(sentence.slice(cursor));

  return tokens;
}

export function parseEnglishPassage(
  raw: string,
  idioms: string[] = [],
): ParsedSentence[] {
  return splitIntoSentences(raw).map((text, index) => ({
    index,
    text,
    tokens: tokenizeSentence(text, idioms),
  }));
}

export function wordSelectionId(
  sentenceIndex: number,
  wordIndex: number,
): string {
  return `${sentenceIndex}:${wordIndex}`;
}
