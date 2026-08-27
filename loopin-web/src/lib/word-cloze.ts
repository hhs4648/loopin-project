import { englishSurfaceForms, isInflectedFormOf } from "@/lib/english-inflections";
import { stripBrackets } from "@/lib/problem-bank";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 예문의 `[빈칸]`. 없거나 여러 개면 각각 null / `__multiple__`. */
export function findExistingCloze(
  exampleEn: string,
): string | null | "__multiple__" {
  const matches = [...exampleEn.matchAll(/\[([^\]]+)\]/g)];
  if (matches.length === 0) return null;
  if (matches.length > 1) return "__multiple__";
  return matches[0]?.[1]?.trim() || null;
}

function findSurfaceInSentence(
  sentence: string,
  word: string,
): { start: number; end: number; surface: string } | null {
  const target = stripBrackets(word).trim();
  if (!sentence.trim() || !target) return null;

  let best: { start: number; end: number; surface: string } | null = null;
  for (const form of englishSurfaceForms(target)) {
    const flexible = escapeRegExp(form).replace(/ /g, "\\s+");
    const match = sentence.match(new RegExp(`\\b(${flexible})\\b`, "i"));
    if (!match?.[1] || match.index == null) continue;
    const start = match.index;
    const end = start + match[0].length;
    const length = end - start;
    if (
      !best ||
      start < best.start ||
      (start === best.start && length > best.end - best.start)
    ) {
      best = { start, end, surface: match[1] };
    }
  }
  return best;
}

/**
 * 예문에서 표제어·활용형 중 가장 왼쪽(같으면 더 긴) 토큰을 `[단어]`로 감싼다.
 * 문장에 나온 철자 그대로 잠근다 (`hold` → `[held]`).
 */
export function wrapMatchingWord(
  sentence: string,
  word: string,
): string | null {
  const hit = findSurfaceInSentence(sentence, word);
  if (!hit) return null;
  return `${sentence.slice(0, hit.start)}[${hit.surface}]${sentence.slice(hit.end)}`;
}

/**
 * 이미 `[단어]`가 있으면 그대로(활용형 허용), 없으면 같은 단어·활용형을 찾아 감싼다.
 * 빈칸을 만들 수 없으면 null.
 */
export function ensureWordCloze(
  exampleEn: string,
  english: string,
): string | null {
  const sentence = exampleEn.trim();
  const word = stripBrackets(english).trim();
  if (!sentence || !word) return null;

  const existing = findExistingCloze(sentence);
  if (existing === "__multiple__") return null;
  if (existing !== null) {
    return isInflectedFormOf(existing, word) ? sentence : null;
  }
  return wrapMatchingWord(sentence, word);
}

export function extractCloze(
  example: string | undefined,
  english?: string,
): {
  englishBefore: string;
  englishAfter: string;
  answer: string;
} | null {
  const source =
    example && english ? (ensureWordCloze(example, english) ?? example) : example;
  if (!source) return null;
  const match = source.match(/\[([^\]]+)\]/);
  if (!match?.[1]) return null;
  const [before, after = ""] = source.split(match[0]);
  return {
    englishBefore: before ?? "",
    englishAfter: after,
    answer: match[1].trim(),
  };
}
