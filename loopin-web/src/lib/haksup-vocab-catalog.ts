import bankData from "@/data/problem-bank.json";
import {
  createEmptyVocabSet,
  DEFAULT_VOCAB_WORDS_PER_DAY,
  padVocabSheet,
  VOCAB_SHEET_INITIAL,
  type VocabEntry,
  type VocabSet,
} from "@/lib/vocab-workbook";

/**
 * 「학습 제공 단어장」 — 교사가 직접 안 만들고 바로 가져다 쓰는 기본 단어장.
 *
 * 지금은 문제은행(`problem-bank.json`)의 단어를 **교과서·단원 단위로** 묶어 노출한다.
 * 별도 큐레이션 목록으로 바꾸고 싶으면 `listHaksupVocabSets`만 갈아끼우면 되고,
 * 담기(`buildVocabSetFromCatalog`) 이후는 **교사 소유의 일반 단어장**이라 자유롭게 편집된다.
 */

type CatalogWord = {
  grade: string;
  textbook: string;
  unit: string;
  english: string;
  korean: string;
  exampleEn: string;
  exampleKo: string;
};

type BankFile = { words?: CatalogWord[] };

const words = ((bankData as BankFile).words ?? []).filter(
  (word) => word.english?.trim() && word.korean?.trim(),
);

export type HaksupVocabSetInfo = {
  /** 카탈로그 안에서만 쓰는 키 */
  id: string;
  grade: string;
  textbook: string;
  unit: string;
  /** 목록에 보이는 이름 */
  name: string;
  /** 목록 그룹 = 학년 */
  groupName: string;
  wordCount: number;
};

function catalogKey(word: {
  grade: string;
  textbook: string;
  unit: string;
}): string {
  return `${word.grade}|${word.textbook}|${word.unit}`;
}

/** 교과서·단원별로 묶은 제공 단어장 목록 (학년 → 교과서 → 단원 순) */
export function listHaksupVocabSets(): HaksupVocabSetInfo[] {
  const groups = new Map<string, CatalogWord[]>();
  for (const word of words) {
    const key = catalogKey(word);
    const bucket = groups.get(key);
    if (bucket) bucket.push(word);
    else groups.set(key, [word]);
  }

  return [...groups.entries()]
    .map(([key, items]) => {
      const first = items[0]!;
      return {
        id: `haksup-vocab-${key}`,
        grade: first.grade,
        textbook: first.textbook,
        unit: first.unit,
        name: `${first.textbook} ${first.unit}`,
        groupName: first.grade,
        wordCount: items.length,
      };
    })
    .sort(
      (a, b) =>
        a.groupName.localeCompare(b.groupName, "ko") ||
        a.textbook.localeCompare(b.textbook, "ko") ||
        a.unit.localeCompare(b.unit, "ko", { numeric: true }),
    );
}

/**
 * 제공 단어장을 **내 보관함에 담을 새 단어장**으로 만든다.
 * 새 id로 복사하므로 담은 뒤 수정해도 원본 카탈로그는 그대로다.
 */
export function buildVocabSetFromCatalog(info: HaksupVocabSetInfo): VocabSet {
  const base = createEmptyVocabSet(info.name);
  const entries: VocabEntry[] = words
    .filter((word) => catalogKey(word) === `${info.grade}|${info.textbook}|${info.unit}`)
    .map((word, index) => ({
      id: `${base.id}-entry-${index}`,
      unit: "",
      word: word.english.trim(),
      meaning: word.korean.trim(),
      example: word.exampleEn?.trim() ?? "",
      exampleMeaning: word.exampleKo?.trim() ?? "",
    }));

  return {
    ...base,
    groupName: info.groupName,
    wordsPerDay: DEFAULT_VOCAB_WORDS_PER_DAY,
    entries: padVocabSheet(entries, VOCAB_SHEET_INITIAL),
  };
}
