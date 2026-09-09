import {
  englishSurfaceForms,
  findSlotLiteralHits,
  isInflectedFormOf,
  lemmaHasSlots,
  lemmaSearchPattern,
} from "@/lib/english-inflections";
import { stripBrackets } from "@/lib/problem-bank";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type ClozePart =
  | { kind: "text"; text: string }
  | { kind: "blank"; text: string };

/** 예문의 `[빈칸]`. 없거나 여러 개면 각각 null / `__multiple__`. */
export function findExistingCloze(
  exampleEn: string,
): string | null | "__multiple__" {
  const matches = [...exampleEn.matchAll(/\[([^\]]+)\]/g)];
  if (matches.length === 0) return null;
  if (matches.length > 1) return "__multiple__";
  return matches[0]?.[1]?.trim() || null;
}

export function findClozeBlanks(exampleEn: string): string[] {
  return [...exampleEn.matchAll(/\[([^\]]+)\]/g)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
}

export function parseClozeParts(exampleEn: string): ClozePart[] {
  const parts: ClozePart[] = [];
  const token = /\[([^\]]+)\]/g;
  let last = 0;
  let match = token.exec(exampleEn);
  while (match) {
    if (match.index > last) {
      parts.push({ kind: "text", text: exampleEn.slice(last, match.index) });
    }
    parts.push({ kind: "blank", text: match[1]!.trim() });
    last = match.index + match[0].length;
    match = token.exec(exampleEn);
  }
  if (last < exampleEn.length) {
    parts.push({ kind: "text", text: exampleEn.slice(last) });
  }
  return parts;
}

export function findSurfaceInSentence(
  sentence: string,
  word: string,
): { start: number; end: number; surface: string } | null {
  const target = stripBrackets(word).trim();
  if (!sentence.trim() || !target) return null;

  const slot = lemmaSearchPattern(target);
  if (slot) {
    const match = sentence.match(new RegExp(slot, "i"));
    if (match?.[0] && match.index != null) {
      return {
        start: match.index,
        end: match.index + match[0].length,
        surface: match[0],
      };
    }
  }

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

/** 본문·예문에 표제어나 활용형이 나오는지. 단원 단어 추적에 쓴다. */
export function wordAppearsInText(text: string, word: string): boolean {
  return findSurfaceInSentence(text, word) !== null;
}

function wrapHits(
  sentence: string,
  hits: { start: number; end: number; surface: string }[],
): string {
  let out = sentence;
  for (const hit of [...hits].sort((a, b) => b.start - a.start)) {
    out = `${out.slice(0, hit.start)}[${hit.surface}]${out.slice(hit.end)}`;
  }
  return out;
}

/**
 * 예문에서 표제어·활용형 중 가장 왼쪽(같으면 더 긴) 토큰을 `[단어]`로 감싼다.
 * 자리(`A`/`B`/`~`)가 있는 숙어는 실제 단어만 잠근다
 * (`take A to B` → `He [takes] … [to] them`).
 * `be`로 시작하는 숙어의 의문문 도치는 주어를 빈칸에 넣지 않는다
 * (`be ready for` → `[Are] you [ready for]`).
 */
export function wrapMatchingWord(
  sentence: string,
  word: string,
): string | null {
  const target = stripBrackets(word).trim();
  if (!sentence.trim() || !target) return null;

  const literals = findSlotLiteralHits(sentence, target);
  if (literals && literals.length > 0) {
    return wrapHits(sentence, literals);
  }

  const hit = findSurfaceInSentence(sentence, target);
  if (!hit) return null;
  return `${sentence.slice(0, hit.start)}[${hit.surface}]${sentence.slice(hit.end)}`;
}

function clozeAlreadyMatchesLemma(sentence: string, word: string): boolean {
  const blanks = findClozeBlanks(sentence);
  if (blanks.length === 0) return false;
  if (blanks.length === 1 && isInflectedFormOf(blanks[0]!, word)) {
    if (lemmaHasSlots(word)) return false;
    // `[big]gest`처럼 표제어가 단어 안에만 있으면 다시 잠근다
    if (
      !new RegExp(`\\b${escapeRegExp(blanks[0]!)}\\b`, "i").test(
        stripBrackets(sentence),
      )
    ) {
      return false;
    }
    return true;
  }
  const auto = wrapMatchingWord(stripBrackets(sentence), word);
  if (!auto) return false;
  return stripBrackets(sentence) === stripBrackets(auto) && auto === sentence;
}

/**
 * 이미 `[단어]`가 있으면 그대로(활용형 허용), 없으면 같은 단어·활용형을 찾아 감싼다.
 * 자리 있는 숙어의 예전 통째 빈칸은 풀어 다시 잠근다.
 * 빈칸을 만들 수 없으면 null.
 */
export function ensureWordCloze(
  exampleEn: string,
  english: string,
): string | null {
  const sentence = exampleEn.trim();
  const word = stripBrackets(english).trim();
  if (!sentence || !word) return null;

  if (clozeAlreadyMatchesLemma(sentence, word)) {
    return sentence;
  }
  return wrapMatchingWord(stripBrackets(sentence), word);
}

export function extractCloze(
  example: string | undefined,
  english?: string,
): {
  englishBefore: string;
  englishAfter: string;
  answer: string;
  parts: ClozePart[];
} | null {
  const source =
    example && english ? (ensureWordCloze(example, english) ?? example) : example;
  if (!source) return null;
  const parts = parseClozeParts(source);
  const blanks = parts.filter(
    (part): part is { kind: "blank"; text: string } => part.kind === "blank",
  );
  if (blanks.length === 0) return null;
  let firstBlank = -1;
  let lastBlank = -1;
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i]!.kind !== "blank") continue;
    if (firstBlank < 0) firstBlank = i;
    lastBlank = i;
  }
  return {
    englishBefore: parts
      .slice(0, firstBlank)
      .map((part) => (part.kind === "text" ? part.text : ""))
      .join(""),
    englishAfter: parts
      .slice(lastBlank + 1)
      .map((part) => (part.kind === "text" ? part.text : ""))
      .join(""),
    answer: blanks.map((part) => part.text).join(" "),
    parts,
  };
}
