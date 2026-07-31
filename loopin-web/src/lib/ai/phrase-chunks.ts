import { stripBrackets } from "@/lib/problem-bank";

/**
 * 문제은행 문장 청크 스타일에 가깝게 구나 단위로 나눔.
 * 예: "The pets / you raise / show / what kind of / person / you are."
 * (단어마다 쪼개지 않음)
 */

const MULTIWORD_PHRASES = [
  "what kind of",
  "related to",
  "have been",
  "has been",
  "had been",
  "woke up",
  "get up",
  "a little",
  "a few",
  "a lot of",
  "as much as",
  "instead of",
  "because of",
  "in front of",
  "best friend",
  "my best",
  "after school",
  "during the",
  "as soon as",
  "so that",
  "in order to",
].sort((a, b) => b.length - a.length);

const DET =
  /^(a|an|the|my|your|his|her|their|our|its|this|that|these|those)$/i;
const AUX =
  /^(am|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|can|could|should|may|might|must)$/i;
const PREP =
  /^(in|on|at|to|for|with|from|by|about|during|into|onto|of|as|over|under|after|before)$/i;
const PRON = /^(I|you|he|she|we|they|it)$/i;
const CONJ_SPLIT =
  /\s+(?=(?:and|but|or|because|although|when|whenever|while|if|so|after|before)\b)/i;
const PARTICLE = /^(up|out|off|away|down|back)$/i;
const LOOKS_ADJ = /(?:ous|ful|ive|less|ish|ical|able|ible|ent|ant)$/i;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function restorePlaceholders(text: string, stored: string[]): string {
  return text.replace(/__P(\d+)__/g, (_, n) => stored[Number(n)] ?? "");
}

function protectPhrases(sentence: string): { text: string; stored: string[] } {
  let text = sentence;
  const stored: string[] = [];
  for (const phrase of MULTIWORD_PHRASES) {
    const re = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "gi");
    text = text.replace(re, (match) => {
      const key = `__P${stored.length}__`;
      stored.push(match);
      return key;
    });
  }
  return { text, stored };
}

function chunkWords(words: string[], stored: string[]): string[] {
  const out: string[] = [];
  let i = 0;

  while (i < words.length) {
    const w = words[i]!;

    if (/^__P\d+__$/.test(w)) {
      out.push(restorePlaceholders(w, stored));
      i += 1;
      continue;
    }

    // 관사/소유격 + (형용사) + 명사
    if (DET.test(w) && i + 1 < words.length) {
      let j = i + 1;
      while (
        j < words.length - 1 &&
        LOOKS_ADJ.test(words[j]!) &&
        !DET.test(words[j]!)
      ) {
        j += 1;
      }
      if (j < words.length) {
        out.push(
          restorePlaceholders(words.slice(i, j + 1).join(" "), stored),
        );
        i = j + 1;
        continue;
      }
    }

    // 조동사/be + 본동사 (+ 부사 파티클)
    if (AUX.test(w) && i + 1 < words.length) {
      let j = i + 1;
      j += 1;
      if (j < words.length && PARTICLE.test(words[j]!)) j += 1;
      out.push(restorePlaceholders(words.slice(i, j).join(" "), stored));
      i = j;
      continue;
    }

    // 전치사 + (관사) + 명사구
    if (PREP.test(w) && i + 1 < words.length && !CONJ_SPLIT.test(` ${w}`)) {
      let j = i + 1;
      if (DET.test(words[j]!)) j += 1;
      while (
        j < words.length - 1 &&
        LOOKS_ADJ.test(words[j]!) &&
        !DET.test(words[j]!)
      ) {
        j += 1;
      }
      if (j < words.length && !/^[,.!?;:]$/.test(words[j]!)) {
        out.push(
          restorePlaceholders(words.slice(i, j + 1).join(" "), stored),
        );
        i = j + 1;
        continue;
      }
    }

    // 대명사 + 동사 (I woke, you are)
    if (PRON.test(w) && i + 1 < words.length) {
      let j = i + 1;
      j += 1;
      if (j < words.length && PARTICLE.test(words[j]!)) j += 1;
      out.push(restorePlaceholders(words.slice(i, j).join(" "), stored));
      i = j;
      continue;
    }

    // 쉼표 등은 앞 청크에 붙임
    if (/^[,.!?;:]$/.test(w) && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]}${w}`;
      i += 1;
      continue;
    }

    out.push(restorePlaceholders(w, stored));
    i += 1;
  }

  return out.filter(Boolean);
}

/** 영어 문장 → 구나 단위 청크 */
export function splitEnglishChunksPhrase(sentence: string): string[] {
  const trimmed = sentence.trim();
  if (!trimmed) return [];
  if (trimmed.includes("/")) {
    return trimmed
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const plain = stripBrackets(trimmed)
    .replace(/([,;:])/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();

  const { text, stored } = protectPhrases(plain);
  // 접속사 앞에서 절 단위로 먼저 가름
  const clauses = text
    .split(CONJ_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const clause of clauses) {
    // 접속사로 시작하는 절이면 접속사는 단독 청크
    const conjMatch = clause.match(
      /^(and|but|or|because|although|when|whenever|while|if|so|after|before)\b(.*)$/i,
    );
    if (conjMatch) {
      chunks.push(conjMatch[1]!);
      const rest = conjMatch[2]!.trim();
      if (rest) {
        chunks.push(...chunkWords(rest.split(/\s+/).filter(Boolean), stored));
      }
      continue;
    }
    chunks.push(...chunkWords(clause.split(/\s+/).filter(Boolean), stored));
  }

  return chunks.map((c) => c.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/**
 * 한글 뜻 → 구나 단위 청크.
 * 이미 `/`가 있으면 그대로, 없으면 어절 2개씩 묶어 문제은행 밀도에 가깝게.
 */
export function splitKoreanChunksPhrase(sentence: string): string[] {
  const trimmed = sentence.trim();
  if (!trimmed) return [];
  if (trimmed.includes("/")) {
    return trimmed
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const parts = stripBrackets(trimmed)
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length <= 3) return parts;

  const chunks: string[] = [];
  let i = 0;
  while (i < parts.length) {
    // 짧게 남은 꼬리는 앞 청크에 붙임
    if (i === parts.length - 1 && chunks.length > 0) {
      chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} ${parts[i]}`;
      break;
    }
    if (i + 2 === parts.length) {
      chunks.push(`${parts[i]} ${parts[i + 1]}`);
      break;
    }
    chunks.push(`${parts[i]} ${parts[i + 1]}`);
    i += 2;
  }
  return chunks;
}

export function formatChunkLine(parts: string[]): string {
  return parts.join(" / ");
}
