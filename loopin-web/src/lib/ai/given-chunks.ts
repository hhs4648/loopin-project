/**
 * 사전에 없는 표기(대화 아이디, 글자+숫자 핸들) — 문제에는 보이되
 * 학생이 맞출 조각이 아니다. `messi10:` 같은 채팅 화자가 전형.
 *
 * 이 파일은 의존성이 없다. 학생앱(`loopin-webapp`) 문장 배열·영작 빌더에도
 * 같은 파일을 복사해 쓴다. 한쪽만 고치면 미리보기와 실제 문제가 어긋난다.
 */

export type ChunkSlot =
  | { kind: "given"; label: string }
  | { kind: "playable"; label: string };

const ORDINAL = /^\d+(?:st|nd|rd|th)$/i;
const TRAILING_PUNCT = /[\s.,!?;:"'”)\]]+$/;
const LEADING_PUNCT = /^[\s(“"']+/;

/**
 * 대화 문장부호는 남기고 화살표·이모티콘은 뺀다.
 * `phrase-chunks.ts` 의 `stripDecorativeMarks` 와 같게 유지한다.
 */
function stripDecorativeMarks(text: string): string {
  return text
    .replace(/[^\s\p{L}\p{N}.,!?;:'"‘’“”…~\-–—()[\]。？！、，「」『』·]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasWord(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

function stripOuterPunct(token: string): string {
  return token.replace(LEADING_PUNCT, "").replace(TRAILING_PUNCT, "");
}

/** `messi10:` / `Minji:` / `A:` / `민지:` */
export function isSpeakerLabel(token: string): boolean {
  const t = token.trim();
  if (!t || /\s/.test(t)) return false;
  if (!/[:：]$/.test(t)) return false;
  const stem = t.slice(0, -1);
  if (stem.length < 1 || stem.length > 24) return false;
  if (!/\p{L}/u.test(stem)) return false;
  return true;
}

/** `messi10` · `user_01` — 서수(`3rd`)는 학습 대상이라 빼 둔다. */
export function isAlphanumericId(token: string): boolean {
  const t = stripOuterPunct(token.trim());
  if (!t || /\s/.test(t)) return false;
  if (ORDINAL.test(t)) return false;
  const stem = t.replace(/[:：]+$/g, "");
  if (stem.length < 2 || stem.length > 24) return false;
  return /\p{L}/u.test(stem) && /\p{N}/u.test(stem);
}

export function isGivenSurface(token: string): boolean {
  const t = token.trim();
  if (!t || /\s/.test(t)) return false;
  return isSpeakerLabel(t) || isAlphanumericId(t);
}

/**
 * 청크 앞의 화자 표기를 떼어 낸다.
 * `messi10: 나도` → given `messi10:` + rest `나도`
 */
export function peelGivenPrefix(chunk: string): {
  given: string[];
  rest: string;
} {
  let rest = chunk.trim();
  const given: string[] = [];
  if (!rest) return { given, rest };

  const speaker = rest.match(/^(\S+[:：])(?:\s+|$)/);
  if (speaker && isGivenSurface(speaker[1]!)) {
    given.push(speaker[1]!);
    rest = rest.slice(speaker[0].length).trim();
    return { given, rest };
  }

  const first = rest.match(/^(\S+)(?:\s+|$)/);
  if (first && isAlphanumericId(first[1]!) && !isGivenSurface(rest)) {
    given.push(first[1]!.replace(TRAILING_PUNCT, ""));
    rest = rest.slice(first[0].length).trim();
  }
  return { given, rest };
}

export function partitionChunkSlots(segments: string[]): ChunkSlot[] {
  const slots: ChunkSlot[] = [];
  for (const raw of segments) {
    const segment = stripDecorativeMarks(raw.trim());
    if (!segment || !hasWord(segment)) continue;
    if (isGivenSurface(segment)) {
      slots.push({ kind: "given", label: segment });
      continue;
    }
    const { given, rest } = peelGivenPrefix(segment);
    for (const label of given) slots.push({ kind: "given", label });
    if (rest) {
      if (isGivenSurface(rest)) slots.push({ kind: "given", label: rest });
      else slots.push({ kind: "playable", label: rest });
    }
  }
  return slots;
}

export function countPlayableSlots(slots: ChunkSlot[]): number {
  return slots.filter((slot) => slot.kind === "playable").length;
}

export function countGivenSlots(slots: ChunkSlot[]): number {
  return slots.filter((slot) => slot.kind === "given").length;
}

export function canBuildArrangeQuestion(slots: ChunkSlot[]): boolean {
  const playable = countPlayableSlots(slots);
  if (playable >= 2) return true;
  return playable >= 1 && countGivenSlots(slots) >= 1;
}

/** 영작에서 글자를 학생에게 받지 않는 단어인지. */
export function isGivenWord(word: string): boolean {
  const t = word.trim();
  if (!t) return false;
  if (isGivenSurface(t)) return true;
  const { given, rest } = peelGivenPrefix(t);
  return given.length > 0 && !rest;
}

/**
 * 문장에서 주어진 단어에 속한 알파벳 위치.
 * 영작 빈칸·입력 칸 수에서 빼 쓴다.
 */
export function givenLetterMask(sentence: string): boolean[] {
  const target = sentence.trim();
  const mask = Array.from({ length: target.length }, () => false);
  const token = /\S+/g;
  let match: RegExpExecArray | null = token.exec(target);
  while (match) {
    const word = match[0]!;
    const start = match.index;
    if (isGivenWord(word)) {
      for (let i = 0; i < word.length; i += 1) {
        if (/[A-Za-z]/.test(word[i]!)) mask[start + i] = true;
      }
    } else {
      const { given } = peelGivenPrefix(word);
      if (given.length > 0) {
        const prefix = given[0]!;
        const prefixAt = word.indexOf(prefix);
        if (prefixAt >= 0) {
          for (let i = 0; i < prefix.length; i += 1) {
            if (/[A-Za-z]/.test(prefix[i]!)) {
              mask[start + prefixAt + i] = true;
            }
          }
        }
      }
    }
    match = token.exec(target);
  }
  return mask;
}
