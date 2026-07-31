export type SentenceToken =
  | { kind: "word"; text: string; wordIndex: number }
  | { kind: "gap"; text: string };

export type ParsedSentence = {
  index: number;
  text: string;
  tokens: SentenceToken[];
};

/** 영어 텍스트를 문장 단위로 분리 (간단한 규칙 · 목업용) */
export function splitIntoSentences(raw: string): string[] {
  const trimmed = raw.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return [];

  const parts = trimmed
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [trimmed];
}

/** 한글 문장 뜻 — 문장부호·줄바꿈 기준으로 분리 (영어 문장 수와 맞춰 씀) */
export function splitIntoMeaningSentences(raw: string): string[] {
  const trimmed = raw.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return [];

  const parts = trimmed
    .split(/(?<=[.!?。？！])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [trimmed];
}

const WORD_RE = /^[A-Za-z]+(?:'[A-Za-z]+)?$/;

/** 한 문장을 클릭 가능한 단어 + 구두점/공백 토큰으로 분리 */
export function tokenizeSentence(sentence: string): SentenceToken[] {
  const chunks = sentence.split(/(\s+|[^\w\s']+)/);
  const tokens: SentenceToken[] = [];
  let wordIndex = 0;

  for (const chunk of chunks) {
    if (!chunk) continue;
    if (WORD_RE.test(chunk)) {
      tokens.push({ kind: "word", text: chunk, wordIndex });
      wordIndex += 1;
    } else {
      tokens.push({ kind: "gap", text: chunk });
    }
  }

  return tokens;
}

export function parseEnglishPassage(raw: string): ParsedSentence[] {
  return splitIntoSentences(raw).map((text, index) => ({
    index,
    text,
    tokens: tokenizeSentence(text),
  }));
}

export function wordSelectionId(
  sentenceIndex: number,
  wordIndex: number,
): string {
  return `${sentenceIndex}:${wordIndex}`;
}
