import {
  splitIntoMeaningSentences,
  splitIntoSentences,
} from "@/lib/ai/split-english-text";
import type { ProblemSentence, ProblemWord } from "@/lib/problem-bank";
import { ensureWordCloze, wordAppearsInText } from "@/lib/word-cloze";

export function normalizeSentenceEnglish(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "");
}

export function pairPassageSentences(
  english: string,
  korean: string,
): {
  pairs: { english: string; korean: string }[];
  enCount: number;
  koCount: number;
} {
  const en = splitIntoSentences(english);
  const ko = splitIntoMeaningSentences(korean);
  return {
    pairs: en.map((text, index) => ({
      english: text,
      korean: ko[index] ?? "",
    })),
    enCount: en.length,
    koCount: ko.length,
  };
}

/** 단원에 저장된 단어 중 본문에 표제어·활용형이 나오는 항목 */
export function matchUnitWordsInPassage(
  words: ProblemWord[],
  passage: string,
): ProblemWord[] {
  return words.filter((word) => wordAppearsInText(passage, word.english));
}

/** 그 단어가 나온 본문 문장·뜻을 예문으로 씀 (수정 칸에 채움) */
export function passageExampleForWord(
  pairs: { english: string; korean: string }[],
  word: string,
): { exampleEn: string; exampleKo: string } | null {
  const pair = pairs.find((item) => wordAppearsInText(item.english, word));
  if (!pair) return null;
  return {
    exampleEn: ensureWordCloze(pair.english, word) ?? pair.english,
    exampleKo: pair.korean,
  };
}

/** 이미 단원 문장으로 있는 본문 문장 — 직접 추가분(접두사)은 빼고 교과서 쪽을 우선 */
export function findExistingSentence(
  sentences: ProblemSentence[],
  english: string,
  skipIdPrefix?: string,
): ProblemSentence | undefined {
  const key = normalizeSentenceEnglish(english);
  if (!key) return undefined;
  return sentences.find((item) => {
    if (skipIdPrefix && item.id.startsWith(skipIdPrefix)) return false;
    return normalizeSentenceEnglish(item.english) === key;
  });
}
