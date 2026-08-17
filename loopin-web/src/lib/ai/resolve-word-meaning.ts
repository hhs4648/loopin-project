import {
  lookupIdiomMeaning,
  splitIdiomSenses,
} from "@/lib/ai/idiom-meanings";
import { fetchWiktionaryKoGlosses } from "@/lib/ai/wiktionary-ko-glosses";

export type MeaningResolveSource =
  | "idiom-dictionary"
  | "wiktionary-sentence"
  | "wiktionary-primary"
  | "lexicon"
  | "placeholder";

/** 문장 매칭·사전 모두 실패 시 표에 넣는 편집용 플레이스홀더 */
export const WORD_MEANING_EDIT_PLACEHOLDER = "문맥에 맞게 수정하세요";

/** 복원 등에서 쓰이는 「뜻 확인」 안내 — 제출 전 교사가 고쳐야 함 */
const MEANING_NEEDS_CONFIRM_RE = /\(\s*뜻\s*확인\s*\)\s*$/u;

export type ResolvedWordMeaning = {
  meaningKo: string;
  /** 파이프라인 내부용. UI hover 목록으로는 쓰지 않음. */
  glosses: string[];
  source: MeaningResolveSource;
  /**
   * 예문과 대조해 고른 뜻이 아니라 **그냥 첫 번째 뜻**이라 틀릴 수 있음.
   * 측정해 보면 오답은 거의 전부 여기 몰린다 — 문맥 매칭에 성공한 건 대체로 맞고,
   * 실패해서 대표 뜻으로 때운 건 `heavy → 무겁다`(정답은 "거센")처럼 어긋난다.
   */
  needsReview: boolean;
  /** 교사가 바로 고를 수 있는 대표 뜻 (최대 3개) */
  candidates: string[];
};

/**
 * 「확신」으로 보는 경우 — 예문과 대조해 고른 뜻, 또는 뜻이 하나로 굳은 숙어.
 * 나머지는 대표 뜻으로 때운 것이라 교사 확인이 필요하다.
 */
function isConfidentSource(source: MeaningResolveSource): boolean {
  return source === "wiktionary-sentence" || source === "idiom-dictionary";
}

/** 대표 뜻 후보 — 이미 고른 뜻을 맨 앞에 두고 최대 3개 */
export const MEANING_CANDIDATE_LIMIT = 3;

function pickCandidates(chosen: string, glosses: string[]): string[] {
  const out = [chosen, ...glosses].map((g) => g.trim()).filter(Boolean);
  return [...new Set(out)].slice(0, MEANING_CANDIDATE_LIMIT);
}

/** 교사가 고쳐야 하는 뜻(플레이스홀더·확인 안내)인지 */
export function isUnresolvedWordMeaning(meaning: string): boolean {
  const trimmed = meaning.trim();
  if (!trimmed) return true;
  if (trimmed === WORD_MEANING_EDIT_PLACEHOLDER) return true;
  if (MEANING_NEEDS_CONFIRM_RE.test(trimmed)) return true;
  return false;
}

/** 로컬 사전 값 "친절한; 종류" / "너, 당신" → 후보 목록 */
export function splitLexiconSenses(meaning: string): string[] {
  return meaning
    .split(/[;；,/·|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /[\uac00-\ud7a3~]/.test(s));
}

const HANGUL = /[\uac00-\ud7a3]/;
/** 한 글자 gloss 뒤에 허용하는 조사·문장부호 (하다 활용 접두는 제외 → 말⊂말한다 방지) */
const PARTICLE_AFTER =
  /^(?:은|는|이|가|을|를|의|에|와|과|도|만|로|으로|에서|에게|한테|부터|까지|이랑|처럼|같이|들|께|,|\.|\s|$)/u;

/**
 * 한 글자 **용언 어간** 뒤에 오는 어미. 조사와 달리 어미는 위 목록에 없어서
 * `들다`(어간 `들`)가 "연필을 **들고**"에 매칭되지 못했다.
 * 두 글자 용언과 ㄷ불규칙(`묻다`→`물었다`)이 전부 여기 걸린다.
 *
 * `은`/`는`/`을`은 관형형 어미이면서 조사이기도 해 일부러 뺐다 —
 * 넣으면 `물다`의 어간 `물`이 "**물을** 마셨다"의 명사 `물`에 붙는다.
 */
const VERB_ENDING_AFTER =
  /^(?:고|어|아|었|았|여|해|지|며|면|니|나|다|기|게|도록|려|러)/u;

/**
 * 용언으로 끝나는 어절인지. 한 글자 어간이 명사의 첫 음절에 붙는 걸 막는다 —
 * `보다`의 어간 `보`는 "**보고**"(용언)에는 붙어도 "**보고서를**"(명사+조사)에는 안 붙어야 한다.
 */
const VERB_FINAL_EOJEOL = /(?:다|요|까|네|지|고|며|면|자|어|아|았|었|겠|죠|니|기|게)[.,!?"')\]]*$/u;

/**
 * 사전형 gloss → 문장 뜻에 나타날 수 있는 활용형.
 * (친절하다 → 친절한/친절, 공부하다 → 공부한/공부)
 */
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const JONGSEONG_COUNT = 28;
const JONGSEONG_D = 7; // ㄷ
const JONGSEONG_R = 8; // ㄹ

/** 받침을 떼어낸 음절 (`볍` → `벼`). 받침이 없으면 그대로 */
function dropFinalConsonant(syllable: string): string {
  const code = syllable.charCodeAt(0) - HANGUL_BASE;
  if (code < 0 || syllable.charCodeAt(0) > HANGUL_LAST) return syllable;
  const jong = code % JONGSEONG_COUNT;
  if (jong === 0) return syllable;
  return String.fromCharCode(HANGUL_BASE + (code - jong));
}

/** 받침을 바꾼 음절 (`묻` → `물`). 대상 받침이 아니면 null */
function swapFinalConsonant(
  syllable: string,
  from: number,
  to: number,
): string | null {
  const code = syllable.charCodeAt(0) - HANGUL_BASE;
  if (code < 0 || syllable.charCodeAt(0) > HANGUL_LAST) return null;
  if (code % JONGSEONG_COUNT !== from) return null;
  return String.fromCharCode(HANGUL_BASE + (code - from) + to);
}

/** ㅎ불규칙 형용사 — 지시·색깔 계열의 닫힌 집합. `좋다`는 여기 없고 규칙이다 */
const H_IRREGULAR_ADJECTIVES =
  /(?:그렇|이렇|저렇|어떻|아무렇|하얗|까맣|노랗|빨갛|파랗|뿌옇|동그랗|조그맣)다$/;

const JONGSEONG_L = 8; // ㄹ
const JONGSEONG_N = 4; // ㄴ
const JONGSEONG_B = 17; // ㅂ
const JONGSEONG_S = 19; // ㅅ
const JONGSEONG_H = 27; // ㅎ

/** 받침을 갈아 끼운 음절. 받침이 없어도 붙일 수 있다 */
function withFinalConsonant(syllable: string, jongseong: number): string {
  const code = syllable.charCodeAt(0) - HANGUL_BASE;
  if (code < 0 || syllable.charCodeAt(0) > HANGUL_LAST) return syllable;
  const base = code - (code % JONGSEONG_COUNT);
  return String.fromCharCode(HANGUL_BASE + base + jongseong);
}

function finalConsonantOf(syllable: string): number {
  const code = syllable.charCodeAt(0) - HANGUL_BASE;
  if (code < 0 || syllable.charCodeAt(0) > HANGUL_LAST) return -1;
  return code % JONGSEONG_COUNT;
}

/**
 * 형용사 기본형 → 관형형. `다양하다`가 아니라 **`다양한`**이 되도록.
 *
 * 사전은 기본형(`-다`)을 주지만 교과서 단어장은 관형형으로 싣는다
 * (`various 다양한`, `heavy 무거운`). 불규칙 활용이 많아 규칙으로 처리한다.
 */
export function toKoreanAttributive(gloss: string): string {
  const g = gloss.trim();
  if (!g.endsWith("다") || g.length < 2) return g;
  // 띄어쓰기가 있으면 한 낱말이 아니라 구(`~을 보다`, `불을 켜다`)라 손대지 않는다
  if (/\s/.test(g)) return g;
  // 있다/없다 는 형용사지만 `-은`이 아니라 `-는`을 쓴다
  if (g.endsWith("있다")) return `${g.slice(0, -1)}는`;
  if (g.endsWith("없다")) return `${g.slice(0, -1)}는`;

  const stem = g.slice(0, -1);
  const last = stem.at(-1);
  if (!last) return g;
  const head = stem.slice(0, -1);
  const jong = finalConsonantOf(last);
  if (jong < 0) return g;

  switch (jong) {
    case 0: // 받침 없음 — 크다→큰, 다르다→다른, 다양하다→다양한
      return head + withFinalConsonant(last, JONGSEONG_N);
    case JONGSEONG_B: // ㅂ불규칙 — 가볍다→가벼운, 무겁다→무거운
      return `${head}${withFinalConsonant(last, 0)}운`;
    case JONGSEONG_L: // ㄹ탈락 — 길다→긴, 멀다→먼
      return head + withFinalConsonant(last, JONGSEONG_N);
    case JONGSEONG_H: // ㅎ받침은 대부분 규칙(좋다→좋은). 불규칙은 닫힌 집합이라 목록으로
      return H_IRREGULAR_ADJECTIVES.test(g)
        ? head + withFinalConsonant(last, JONGSEONG_N) // 그렇다→그런, 하얗다→하얀
        : `${stem}은`; // 좋다→좋은

    case JONGSEONG_S: // ㅅ불규칙 — 낫다→나은
      return `${head}${withFinalConsonant(last, 0)}은`;
    default: // 좋다→좋은, 작다→작은, 많다→많은
      return `${stem}은`;
  }
}

/**
 * 사전 뜻(기본형)이 예문에서 활용된 형태로 나타나므로, 찾아볼 변형을 만든다.
 *
 * 규칙 활용만으로는 **불규칙 용언을 놓친다** — 사전이 `가볍다`를 주는데
 * 예문에는 `가벼운`이라 어간 `가볍`이 문장에 없다(ㅂ불규칙). 실제로 이 때문에
 * `light`가 형용사 뜻을 두고 엉뚱한 동사 뜻(`불붙이다`)으로 잡혔다.
 * 받침을 떼거나(ㅂ·ㅅ·ㅎ) ㄷ→ㄹ로 바꾼 어간도 함께 시도한다.
 */
/** 문장에서 찾아볼 형태. `isStem`이면 용언 어간이라 뒤에 조사가 올 수 없다. */
type GlossVariant = { text: string; isStem: boolean };

function glossMatchVariantsDetailed(gloss: string): GlossVariant[] {
  const g = gloss.trim();
  if (!g) return [];
  const out: GlossVariant[] = [{ text: g, isStem: false }];
  const pushAs = (v: string, isStem: boolean) => {
    const t = v.trim();
    if (t && !out.some((entry) => entry.text === t)) out.push({ text: t, isStem });
  };
  const push = (v: string) => pushAs(v, false);

  if (g.endsWith("하다") && g.length > 2) {
    const stem = g.slice(0, -2);
    push(`${stem}한`);
    push(`${stem}할`);
    push(`${stem}함`);
    push(`${stem}해`);
    push(`${stem}했`);
    pushAs(stem, true);
  } else if (g.endsWith("되다") && g.length > 2) {
    const stem = g.slice(0, -2);
    push(`${stem}된`);
    push(`${stem}될`);
    push(`${stem}됨`);
    push(`${stem}돼`);
    pushAs(stem, true);
  } else if (g.endsWith("다") && g.length > 2) {
    pushAs(g.slice(0, -1), true);
  }

  // `들다`처럼 두 글자인 용언은 위 분기(g.length > 2)에서 빠져 어간이 안 만들어진다
  if (g.endsWith("다") && g.length >= 2) {
    const stem = g.slice(0, -1);
    pushAs(stem, true);
    const last = stem.at(-1);
    if (last) {
      const head = stem.slice(0, -1);
      pushAs(head + dropFinalConsonant(last), true); // 가볍 → 가벼
      const swapped = swapFinalConsonant(last, JONGSEONG_D, JONGSEONG_R);
      if (swapped) pushAs(head + swapped, true); // 묻 → 물
    }
  }

  // 긴 변형 우선 (문장에서 더 구체적인 매칭)
  return out.sort((a, b) => b.text.length - a.text.length);
}

/** 표시용·외부용 — 찾아볼 형태 문자열만 */
export function glossMatchVariants(gloss: string): string[] {
  return glossMatchVariantsDetailed(gloss).map((v) => v.text);
}

function findGlossInSentence(
  variant: string,
  haystack: string,
  isStem = false,
): number | null {
  if (!variant) return null;
  let from = 0;
  while (from <= haystack.length) {
    const index = haystack.indexOf(variant, from);
    if (index < 0) return null;

    const before = index > 0 ? haystack[index - 1]! : "";
    const after = haystack.slice(index + variant.length);

    // 한·두 글자 뜻이 더 긴 단어 한가운데에 끼는 경우 제외
    if (
      variant.length <= 2 &&
      HANGUL.test(before) &&
      HANGUL.test(after[0] ?? "")
    ) {
      from = index + 1;
      continue;
    }
    // 한 글자 뜻은 조사·어미 앞에서만 허용 (말 ⊂ 말한다)
    if (variant.length === 1 && HANGUL.test(after[0] ?? "")) {
      // 용언 어간 뒤에는 조사가 못 온다 → 어미만, 그것도 어절 첫머리에서만.
      // (`말하다`의 어간 `말`이 "**말이** 빨랐다"의 명사에 붙는 걸 막는다)
      // 게다가 그 어절 전체가 용언으로 끝나야 한다 (`보` + `고서를` 같은 명사 배제).
      const eojeol = haystack.slice(index).split(/[\s]/)[0] ?? "";
      const allowed = isStem
        ? !HANGUL.test(before) &&
          VERB_ENDING_AFTER.test(after) &&
          VERB_FINAL_EOJEOL.test(eojeol)
        : PARTICLE_AFTER.test(after);
      if (!allowed) {
        from = index + 1;
        continue;
      }
    }

    return index;
  }
  return null;
}

/**
 * 문장 뜻 안에 실제로 등장하는 gloss를 고른다.
 * 긴 후보 우선, 같으면 더 앞에 나온 것.
 * 하다/다 활용형도 허용하되, 반환값은 Wiktionary 원본 gloss.
 */
export function pickGlossMatchingSentence(
  glosses: string[],
  translationKo: string,
): string | null {
  const haystack = translationKo.trim();
  if (!haystack || glosses.length === 0) return null;

  const scored: {
    gloss: string;
    index: number;
    length: number;
  }[] = [];

  for (const gloss of glosses) {
    const g = gloss.trim();
    if (!g) continue;
    for (const variant of glossMatchVariantsDetailed(g)) {
      const index = findGlossInSentence(variant.text, haystack, variant.isStem);
      if (index == null) continue;
      scored.push({
        gloss: g,
        index,
        // 실제 문장에 맞닿은 형태 길이로 점수 (친절한 > 친절)
        length: variant.text.length,
      });
      break;
    }
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return a.index - b.index;
  });
  return scored[0]!.gloss;
}

/**
 * 1) Wiktionary 한국어 뜻 전부 수집
 * 2) 문장 뜻과 비교해 맞는 뜻 선택
 * 3) 없으면 핵심 뜻(첫 gloss) — 교사가 표에서 수정
 */
export async function resolveWordMeaningPipeline(params: {
  surface: string;
  lemma: string;
  sentence: string;
  translationKo: string;
  lexiconMeaning?: string;
}): Promise<ResolvedWordMeaning> {
  const translationKo = params.translationKo.trim();

  const finishIdiom = (
    meaningKo: string,
    all: string[],
    source: MeaningResolveSource,
  ): ResolvedWordMeaning => ({
    meaningKo,
    glosses: all,
    source,
    needsReview: !isConfidentSource(source),
    candidates: isConfidentSource(source) ? [] : pickCandidates(meaningKo, all),
  });

  // 숙어는 자체 사전을 먼저 본다 — 위키낱말사전엔 표제어조차 없는 경우가 많고
  // (`look at`, `find out`, `put on` 모두 한국어 번역 0개) 뜻도 하나로 굳어 있다.
  for (const phrase of [params.surface, params.lemma]) {
    const idiom = lookupIdiomMeaning(phrase);
    if (!idiom) continue;
    const senses = splitIdiomSenses(idiom);
    // 뜻이 갈리는 숙어(`pick up` 줍다/태우러 가다)는 예문과 대조해 고른다
    const matched =
      senses.length > 1 ? pickGlossMatchingSentence(senses, translationKo) : null;
    if (senses.length > 1 && !matched) {
      return finishIdiom(senses[0]!, senses, "wiktionary-primary");
    }
    return finishIdiom(matched ?? senses[0]!, senses, "idiom-dictionary");
  }

  const lookupWords = Array.from(
    new Set(
      [params.lemma, params.surface]
        .map((w) => w.trim())
        .filter(Boolean),
    ),
  );

  let glosses: string[] = [];
  for (const word of lookupWords) {
    try {
      glosses = await fetchWiktionaryKoGlosses(word);
    } catch {
      glosses = [];
    }
    if (glosses.length > 0) break;
  }

  const finish = (
    meaningKo: string,
    all: string[],
    source: MeaningResolveSource,
  ): ResolvedWordMeaning => ({
    meaningKo,
    glosses: all,
    source,
    needsReview: !isConfidentSource(source),
    candidates: isConfidentSource(source) ? [] : pickCandidates(meaningKo, all),
  });

  if (glosses.length > 0) {
    const matched = pickGlossMatchingSentence(glosses, translationKo);
    if (matched) return finish(matched, glosses, "wiktionary-sentence");
    return finish(glosses[0]!, glosses, "wiktionary-primary");
  }

  // Wiktionary 미스: 로컬 핵심 뜻 한 줄(있으면) 또는 편집용 플레이스홀더
  if (params.lexiconMeaning?.trim()) {
    const senses = splitLexiconSenses(params.lexiconMeaning);
    return finish(
      senses[0] ?? params.lexiconMeaning.trim(),
      senses,
      "lexicon",
    );
  }

  return finish(WORD_MEANING_EDIT_PLACEHOLDER, [], "placeholder");
}
