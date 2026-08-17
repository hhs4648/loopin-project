import {
  IDIOM_MEANINGS,
  IDIOM_PATTERNS,
} from "@/lib/ai/idiom-meanings.data";
import { idiomLookupKeys } from "@/lib/ai/phrase-chunks";

/**
 * 중학 영어 숙어 → 한국어 뜻 조회.
 *
 * **왜 자체 사전이 필요한가:** 위키낱말사전은 단일 단어는 잘 커버하지만 숙어는
 * 표제어에 한국어 번역이 아예 없는 경우가 많다 — `look at`, `take care of`,
 * `find out`, `put on`, `make up`, `run into`, `go on` 모두 0개다.
 * 반대로 숙어는 뜻이 하나로 굳어 있는 편이라(단어 평균 2.1개 vs 숙어 0.7개)
 * 고정 사전이 잘 맞는다.
 *
 * **데이터의 소스는 `scripts/idiom-source.xlsx`**이고 `idiom-meanings.data.ts`는
 * 거기서 생성된다(`node scripts/import-idioms.mjs`). 이 파일에는 로직만 둔다 —
 * 그래야 재생성이 손으로 쓴 코드를 덮어쓰지 않는다.
 */
export { IDIOM_MEANINGS, IDIOM_PATTERNS };

/**
 * 표면형 숙어의 뜻을 찾는다. 굴절·소유격은 정규화해서 맞춘다
 * (`looked at` → `look at`, `did her best` → `do one's best`).
 * 한 단어짜리는 대상이 아니다 — 그건 위키낱말사전이 잘 처리한다.
 */
export function lookupIdiomMeaning(phrase: string): string | null {
  const trimmed = phrase.trim();
  if (!trimmed || !/\s/.test(trimmed)) return null;
  for (const key of idiomLookupKeys(trimmed)) {
    const hit = IDIOM_MEANINGS[key];
    if (hit) return hit;
  }
  return null;
}

/** 뜻이 문맥에 따라 갈리는 숙어는 `/`로 적어 둔다 → 후보 목록으로 */
export function splitIdiomSenses(meaning: string): string[] {
  return meaning
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}
