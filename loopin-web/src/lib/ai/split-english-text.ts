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
 * **여는 따옴표부터 닫는 따옴표까지는 한 문장이다.** 대화문 안의 마침표·느낌표는
 * 가름이 아니다 (`"It's already 7:30. Oops! I'm late."`). ASCII `'` 는 `It's` /
 * `I'm` 때문에 따옴표로 보지 않는다.
 *
 * **따옴표를 닫고 이어지는 전달절도 같은 문장이다.** 영어는 `Say honestly, "…"`처럼
 * 전달이 앞이고, 한글은 `"…"라고 솔직하게 말해`처럼 전달이 뒤다. 물음표 뒤 닫는
 * 따옴표에 `라고`/`솔직하게 말해`/`she said`가 이어지면 가르지 않는다.
 * `"늦지 마." 엄마는 문을 닫았다`처럼 전달이 아니면 그 뒤에서 가른다.
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

const QUOTE_CLOSE: Record<string, string> = {
  '"': '"',
  "\u201C": "\u201D",
  "「": "」",
  "『": "』",
};

function isSentencePunct(ch: string, korean: boolean): boolean {
  return korean ? /[.!?。？！]/.test(ch) : /[.!?]/.test(ch);
}

function isAttachCloser(ch: string, korean: boolean): boolean {
  return korean ? /['"’”」』]/.test(ch) : /['"’”]/.test(ch);
}

function isDecimalDot(text: string, index: number): boolean {
  return (
    text[index] === "." &&
    index > 0 &&
    index + 1 < text.length &&
    /\d/.test(text[index - 1]!) &&
    /\d/.test(text[index + 1]!)
  );
}

function canSplitAfter(text: string, end: number): boolean {
  if (end >= text.length) return false;
  const next = text[end]!;
  return /\s/.test(next) || /[A-Za-z가-힣]/.test(next);
}

function skipSpaces(text: string, index: number): number {
  let i = index;
  while (i < text.length && /\s/.test(text[i]!)) i += 1;
  return i;
}

/** 닫는 따옴표 뒤의 「라고 말했다 / 솔직하게 말해 / she said」는 새 문장이 아니다. */
const KOREAN_QUOTE_ATTRIB =
  /^(?:이라고|이라면서|이라며|이라는|라고|라면서|라며|라는|하고|하면서|하며|고(?:\s|했)|솔직하게|솔직히|말했|말해|이야기했|이야기해|대답했|물었|외쳤)/;

function isQuoteAttribution(text: string, end: number): boolean {
  const rest = text.slice(end).replace(/^[\s,.'"’”」』]+/u, "");
  if (!rest) return false;
  if (KOREAN_QUOTE_ATTRIB.test(rest)) return true;
  return /^[a-z]/.test(rest);
}

function matchingQuoteClose(ch: string, stack: string[]): boolean {
  const top = stack.at(-1);
  if (!top) return false;
  return QUOTE_CLOSE[top] === ch;
}

/** 영어 텍스트를 문장 단위로 분리 (간단한 규칙 · 목업용) */
export function splitIntoSentences(raw: string): string[] {
  return mergeShortSentences(splitBySentencePunctuation(raw, false));
}

export function splitEnglishSentencesByPunctuation(raw: string): string[] {
  return splitBySentencePunctuation(raw, false);
}

/** 한글 문장 뜻 — 문장부호·줄바꿈 기준으로 분리 (영어 문장 수와 맞춰 씀) */
export function splitIntoMeaningSentences(raw: string): string[] {
  return splitBySentencePunctuation(raw, true);
}

function splitBySentencePunctuation(raw: string, korean: boolean): string[] {
  const trimmed = raw.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return [];

  const parts: string[] = [];
  const stack: string[] = [];
  let start = 0;

  const push = (from: number, to: number) => {
    const piece = trimmed.slice(from, to).trim();
    if (piece) parts.push(piece);
  };

  const splitAt = (end: number, cursor: number) => {
    if (!canSplitAfter(trimmed, end)) return cursor;
    if (isQuoteAttribution(trimmed, end)) return cursor;
    push(start, end);
    start = skipSpaces(trimmed, end);
    return start - 1;
  };

  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i]!;

    if (matchingQuoteClose(ch, stack)) {
      const punctBefore = trimmed[i - 1];
      stack.pop();
      if (
        stack.length === 0 &&
        punctBefore &&
        isSentencePunct(punctBefore, korean)
      ) {
        let end = i + 1;
        let extra = 0;
        while (
          extra < 1 &&
          end < trimmed.length &&
          isAttachCloser(trimmed[end]!, korean)
        ) {
          end += 1;
          extra += 1;
        }
        i = splitAt(end, i);
      }
      continue;
    }

    if (QUOTE_CLOSE[ch] && !(ch === '"' && stack.at(-1) === '"')) {
      stack.push(ch);
      continue;
    }

    if (stack.length > 0) continue;
    if (!isSentencePunct(ch, korean)) continue;
    if (isDecimalDot(trimmed, i)) continue;

    let end = i + 1;
    let extra = 0;
    while (
      extra < 2 &&
      end < trimmed.length &&
      isAttachCloser(trimmed[end]!, korean)
    ) {
      end += 1;
      extra += 1;
    }
    i = splitAt(end, i);
  }

  push(start, trimmed.length);
  return parts.length > 0 ? parts : [trimmed];
}

/** 인사·감탄 한두 단어(`Hi!`, `Thank you.`)는 단독 문항으로 두지 않는다. */
const SHORT_SENTENCE_WORDS = 2;

export function countEnglishWords(text: string): number {
  return (text.match(/[A-Za-z0-9]+(?:'[A-Za-z]+)?/g) ?? []).length;
}

function joinSentenceParts(left: string, right: string): string {
  const a = left.trim();
  const b = right.trim();
  if (!a) return b;
  if (!b) return a;
  return `${a} ${b}`;
}

/** 단어가 2개 이하인 문장은 다음 문장과 합친다. 마지막이면 앞 문장과 합친다. */
export function mergeShortSentences(sentences: string[]): string[] {
  return mergeShortGroups(sentences, countEnglishWords).map((group) =>
    group.reduce((acc, part) => joinSentenceParts(acc, part), ""),
  );
}

function mergeShortGroups<T>(
  items: T[],
  wordsOf: (item: T) => number,
): T[][] {
  if (items.length === 0) return [];
  const groups: T[][] = [];
  for (const item of items) {
    const prev = groups.at(-1);
    const lastPart = prev?.at(-1);
    if (
      prev &&
      lastPart !== undefined &&
      wordsOf(lastPart) <= SHORT_SENTENCE_WORDS
    ) {
      prev.push(item);
      continue;
    }
    groups.push([item]);
  }
  const lastGroup = groups.at(-1);
  const lastPart = lastGroup?.at(-1);
  if (
    groups.length >= 2 &&
    lastPart !== undefined &&
    wordsOf(lastPart) <= SHORT_SENTENCE_WORDS
  ) {
    const last = groups.pop()!;
    groups.at(-1)!.push(...last);
  }
  return groups;
}

/** 영어 단어 수로 짧은 문장을 묶고, 같은 칸의 한글 뜻도 함께 붙인다. */
export function mergeShortSentencePairs(
  english: string[],
  korean: string[],
): { english: string; korean: string }[] {
  const pairs = english.map((text, index) => ({
    english: text,
    korean: korean[index] ?? "",
  }));
  return mergeShortGroups(pairs, (pair) => countEnglishWords(pair.english)).map(
    (group) => ({
      english: group.reduce(
        (acc, pair) => joinSentenceParts(acc, pair.english),
        "",
      ),
      korean: group.reduce(
        (acc, pair) => joinSentenceParts(acc, pair.korean),
        "",
      ),
    }),
  );
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
