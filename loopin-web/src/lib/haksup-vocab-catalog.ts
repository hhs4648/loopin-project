import {
  ensureUnitLoaded,
  getUnitContent,
  problemBankScopes,
} from "@/lib/problem-bank";
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
 * 문제은행의 단어를 **교과서·단원 단위로** 묶어 노출한다. 목록은 문제은행 인덱스의
 * 단원별 개수만으로 그리므로(조각을 안 받아도 된다), 실제 단어는 교사가 하나를 고른
 * 순간에만 그 교과서 조각을 받아 채운다 — `buildVocabSetFromCatalog`가 비동기인 이유다.
 * 별도 큐레이션 목록으로 바꾸고 싶으면 `listHaksupVocabSets`만 갈아끼우면 되고,
 * 담기 이후는 **교사 소유의 일반 단어장**이라 자유롭게 편집된다.
 */

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

/** 교과서·단원별로 묶은 제공 단어장 목록 (학년 → 교과서 → 단원 순) */
export function listHaksupVocabSets(): HaksupVocabSetInfo[] {
  return problemBankScopes
    .filter((scope) => scope.words > 0)
    .map((scope) => ({
      id: `haksup-vocab-${scope.grade}|${scope.textbook}|${scope.unit}`,
      grade: scope.grade,
      textbook: scope.textbook,
      unit: scope.unit,
      name: `${scope.textbook} ${scope.unit}`,
      groupName: scope.grade,
      wordCount: scope.words,
    }));
}

/**
 * 제공 단어장을 **내 보관함에 담을 새 단어장**으로 만든다.
 * 새 id로 복사하므로 담은 뒤 수정해도 원본 카탈로그는 그대로다.
 */
export async function buildVocabSetFromCatalog(
  info: HaksupVocabSetInfo,
): Promise<VocabSet> {
  await ensureUnitLoaded(info);
  const base = createEmptyVocabSet(info.name);
  const entries: VocabEntry[] = getUnitContent({
    grade: info.grade,
    textbook: info.textbook,
    unit: info.unit,
  })
    .words.filter((word) => word.english?.trim() && word.korean?.trim())
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
