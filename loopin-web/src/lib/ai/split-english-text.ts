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
 * `Mrs.` / `Dr.` / `Mr.` 같은 **호칭·약어 마침표는 가름이 아니다**
 * (`Mrs. Schmidt`를 `Mrs.` / `Schmidt`로 쪼개지 않는다). `A.B.` 는 그대로 가른다.
 *
 * **여는 따옴표부터 닫는 따옴표까지는 한 문장이다.** 대화문 안의 마침표·느낌표는
 * 가름이 아니다 (`"It's already 7:30. Oops! I'm late."`). ASCII `'` 는 `It's` /
 * `I'm` 때문에 따옴표로 보지 않는다.
 *
 * **따옴표를 닫고 이어지는 전달절도 같은 문장이다.** 영어는 전달이 앞
 * (`Say honestly, "…"`)이거나 뒤 (`"…," she said` / `"…!" said Vashti`)다.
 * 한글은 `"…"라고 솔직하게 말해`뿐 아니라 **주어 + 말하다** (`"…." 그녀가 말했다`)
 * 도 같은 문장이다. 예전에는 `라고`/`말했`으로 시작하는 경우만 봐서 `그녀가 말했다`를
 * 다음 문장으로 잘랐고, 영어는 `"…," she said`가 한 문장이라 짝이 한 칸씩 밀렸다.
 * `"늦지 마." 엄마는 문을 닫았다`처럼 말하기 동사가 없으면 그 뒤에서 가른다.
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

/** `Mrs. Schmidt` / `Dr. Kim` — 호칭·약어 뒤 마침표는 문장 끝이 아니다. */
const TITLE_ABBREV =
  /^(?:Mr|Mrs|Ms|Dr|Prof|Jr|Sr|vs|etc|Mt|Ft|St|Rev|Lt|Col|Gen|Sgt|Capt)$/i;

function isAbbreviationDot(text: string, index: number): boolean {
  if (text[index] !== ".") return false;
  let start = index;
  while (start > 0 && /[A-Za-z]/.test(text[start - 1]!)) start -= 1;
  if (start === index) return false;
  if (start > 0 && /[A-Za-z0-9]/.test(text[start - 1]!)) return false;
  return TITLE_ABBREV.test(text.slice(start, index));
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

const ENGLISH_SAY_VERB =
  "(?:said|asked|replied|answered|shouted|whispered|cried|added|continued|explained|yelled|called|muttered|noted|remarked)";
const ENGLISH_REPORTING_HEAD =
  new RegExp(
    `^(?:${ENGLISH_SAY_VERB}\\s+\\S+|` +
      `(?:she|he|they|i|we|you|[A-Z][\\w.'-]*)(?:\\s+[A-Z][\\w.'-]*){0,2}\\s+${ENGLISH_SAY_VERB}\\b)`,
    "i",
  );
const KOREAN_SAY_VERB =
  /말했|말해|이야기했|이야기해|대답했|물었|외쳤|속삭였|소리쳤|중얼|되물었|덧붙였/;
const KOREAN_QUOTE_PARTICLE =
  /^(?:이라고|이라면서|이라며|이라는|라고|라면서|라며|라는|하고|하면서|하며|고(?:\s|했)|솔직하게|솔직히)/;

function takeFirstClause(text: string): string {
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (!isSentencePunct(ch, true)) continue;
    if (isDecimalDot(text, i)) continue;
    if (isAbbreviationDot(text, i)) continue;
    return text.slice(0, i + 1).trim();
  }
  return text.trim().slice(0, 64);
}

/** `"…." 그녀가 말했다` / `said Vashti` — 짧은 말하기 절만 전달절로 본다. */
export function isReportingClause(text: string): boolean {
  const t = text.replace(/^[\s,.'"’”」』]+/u, "").trim();
  if (!t || t.length > 64) return false;
  if (/["“「『].{8,}["”」』]/.test(t)) return false;
  if (ENGLISH_REPORTING_HEAD.test(t)) return true;
  if (KOREAN_QUOTE_PARTICLE.test(t) && t.length <= 64) return true;
  return t.length <= 48 && KOREAN_SAY_VERB.test(t);
}

function endsWithQuotedSpeech(text: string): boolean {
  const t = text.trim();
  return /["”」』][,.!?…]?\s*$/.test(t) || /[,.!?…]["”」』]\s*$/.test(t);
}

/** 닫는 따옴표 뒤의 전달절은 새 문장이 아니다. */
function isQuoteAttribution(text: string, end: number): boolean {
  const rest = text.slice(end).replace(/^[\s,]+/u, "");
  if (!rest) return false;
  if (/^[a-z]/.test(rest)) return true;
  return isReportingClause(takeFirstClause(rest));
}

/** 이미 갈린 `그녀가 말했다` / `said Vashti` 를 앞 따옴표 문장에 되돌린다. */
function mergeAttributionSentences(sentences: string[]): string[] {
  const out: string[] = [];
  for (const part of sentences) {
    const prev = out.at(-1);
    if (prev && isReportingClause(part) && endsWithQuotedSpeech(prev)) {
      out[out.length - 1] = joinSentenceParts(prev, part);
      continue;
    }
    out.push(part);
  }
  return out;
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
    if (!korean && isAbbreviationDot(trimmed, i)) continue;

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
  return mergeAttributionSentences(parts.length > 0 ? parts : [trimmed]);
}

/** 인사·감탄(`Hi!`, `Thank you.`)만 단독 문항으로 두지 않는다. `I'm Hannah.` 는 합치지 않는다. */
const MERGEABLE_GREETING =
  /^(?:hi|hello|hey|oh|ah|wow|oops|yes|no|ok|okay|bye|goodbye|thanks|thank you|thank you very much|good morning|good afternoon|good evening|good night|see you|excuse me|sorry|hi there)$/i;

export function countEnglishWords(text: string): number {
  return (text.match(/[A-Za-z0-9]+(?:'[A-Za-z]+)?/g) ?? []).length;
}

/** 단어 1개, 또는 `Thank you.` 같은 인사만 다음 문장에 붙인다. */
export function isMergeableShortSentence(text: string): boolean {
  const words = countEnglishWords(text);
  if (words <= 1) return words === 1;
  if (words > 4) return false;
  const folded = text
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return MERGEABLE_GREETING.test(folded);
}

function joinSentenceParts(left: string, right: string): string {
  const a = left.trim();
  const b = right.trim();
  if (!a) return b;
  if (!b) return a;
  return `${a} ${b}`;
}

/** 인사·감탄만 다음 문장과 합친다. 마지막이면 앞 문장과 합친다. */
export function mergeShortSentences(sentences: string[]): string[] {
  return mergeShortGroups(sentences, (part) =>
    isMergeableShortSentence(part),
  ).map((group) =>
    group.reduce((acc, part) => joinSentenceParts(acc, part), ""),
  );
}

function mergeShortGroups<T>(
  items: T[],
  shouldMerge: (item: T) => boolean,
): T[][] {
  if (items.length === 0) return [];
  const groups: T[][] = [];
  for (const item of items) {
    const prev = groups.at(-1);
    const lastPart = prev?.at(-1);
    if (prev && lastPart !== undefined && shouldMerge(lastPart)) {
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
    shouldMerge(lastPart)
  ) {
    const last = groups.pop()!;
    groups.at(-1)!.push(...last);
  }
  return groups;
}

/** 영어가 인사·감탄이면 다음 문장과 묶고, 같은 칸의 한글 뜻도 함께 붙인다. */
export function mergeShortSentencePairs(
  english: string[],
  korean: string[],
): { english: string; korean: string }[] {
  const pairs = english.map((text, index) => ({
    english: text,
    korean: korean[index] ?? "",
  }));
  return mergeShortGroups(pairs, (pair) =>
    isMergeableShortSentence(pair.english),
  ).map((group) => ({
    english: group.reduce(
      (acc, pair) => joinSentenceParts(acc, pair.english),
      "",
    ),
    korean: group.reduce(
      (acc, pair) => joinSentenceParts(acc, pair.korean),
      "",
    ),
  }));
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
