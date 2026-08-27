/**
 * 영어 Wiktionary에서 한국어 대역(gloss) 수집.
 * 브라우저에서는 same-origin `/api/wiktionary-ko` 프록시를 쓰고,
 * 서버(라우트 핸들러)에서는 MediaWiki API를 직접 호출한다.
 */

const glossCache = new Map<string, string[]>();

/** 확인된 미스(페이지는 읽었으나 한국어 뜻 없음)만 빈 배열 캐시. 네트워크/429는 캐시하지 않음. */
const confirmedMissCache = new Set<string>();

const KO_TEMPLATE_RE =
  /\{\{t(?:t)?(?:\+|-\w+)?\s*\|\s*ko\s*\|\s*([^}|]+)/gi;

function cleanGloss(raw: string): string {
  return (
    raw
      .replace(/\[\[([^|\]]+\|)?([^\]]+)\]\]/g, "$2")
      // 템플릿 캡처가 `|`에서 잘려 `[[적다` 처럼 닫히지 않은 링크가 남는다.
      // 위 정규식은 `]]`를 요구하므로 못 걷어낸다 — 남은 대괄호를 직접 지운다.
      .replace(/\[\[|\]\]/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/'''|''/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      // Wiktionary 한국어 조사 표기 `-까지`, `[[-까지]][[-도]]` → 까지 / 까지도
      .replace(/-/g, "")
      .replace(/\s+/g, " ")
      .trim()
      // 목적어 자리를 생략기호·하이픈으로 적는 표기(`-를 들어올리다`, `...에 미치지 못하는`)
      // 때문에 뜻 맨 앞에 조사만 덩그러니 남는다 → 떼어낸다
      .replace(/^(?:을|를|이|가|에|의|로|으로|와|과|에게|에서)\s+/, "")
      .trim()
  );
}

function isHangulGloss(text: string): boolean {
  return /[\uac00-\ud7a3]/.test(text) && text.length <= 24;
}

/** wikitext에서 한국어 뜻만 추출 (중복 제거, 등장 순) */
export function extractKoGlossesFromWikitext(wikitext: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const cleaned = cleanGloss(raw);
    if (!cleaned || !isHangulGloss(cleaned) || seen.has(cleaned)) return;
    seen.add(cleaned);
    out.push(cleaned);
  };

  KO_TEMPLATE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = KO_TEMPLATE_RE.exec(wikitext)) !== null) {
    push(match[1] ?? "");
  }

  for (const line of wikitext.split("\n")) {
    const koreanLine = line.match(/^\*+\s*Korean\s*:\s*(.+)$/i);
    if (!koreanLine?.[1]) continue;
    KO_TEMPLATE_RE.lastIndex = 0;
    let inner: RegExpExecArray | null;
    let foundTemplate = false;
    while ((inner = KO_TEMPLATE_RE.exec(koreanLine[1])) !== null) {
      foundTemplate = true;
      push(inner[1] ?? "");
    }
    if (!foundTemplate) {
      for (const part of koreanLine[1].split(/[,;、]/)) {
        push(part);
      }
    }
  }

  // {{t+|ko|…}} 가 줄 밖에만 있는 경우도 템플릿 전역 스캔으로 이미 수집됨.
  // 번역 상자 없이 본문에 `[[ko:…]]` interwiki 만 있는 경우는 제외.

  return out;
}

/**
 * 한국어판 위키낱말사전(ko.wiktionary)의 **뜻풀이 줄**에서 짧은 뜻을 뽑는다.
 *
 * 영어판의 번역 템플릿과 데이터가 겹치지 않아 서로 다른 구멍을 메운다.
 * 예) `below` — 영어판엔 "밑"뿐이지만 한국어판엔 "아래에"가 있다.
 *
 * 한 페이지에 여러 언어가 들어 있으므로(`test`에는 `== 우니쉬 ==`도 있다)
 * 반드시 `== 영어 ==` 구간만 읽는다.
 */
export function extractKoGlossesFromKoWikitext(wikitext: string): string[] {
  const start = wikitext.search(/^==\s*영어\s*==\s*$/m);
  if (start < 0) return [];
  const rest = wikitext.slice(start + 1);
  const nextLang = rest.search(/^==\s*[^=]+\s*==\s*$/m);
  const section = nextLang < 0 ? rest : rest.slice(0, nextLang);

  const out: string[] = [];
  const seen = new Set<string>();

  for (const line of section.split("\n")) {
    // `#` 은 뜻풀이, `#:`/`#*` 는 예문·인용이라 제외
    if (!line.startsWith("#") || /^#[:*]/.test(line)) continue;
    const body = cleanGloss(line.replace(/^#+/, ""));
    if (!body) continue;
    // "…아래에, …보다 밑의" 같은 산문형 뜻풀이를 조각으로 자른다
    for (const part of body.split(/[,;.]/)) {
      // 앞머리 생략기호를 떼고 나면 조사만 남을 수 있어 cleanGloss 로 한 번 더 다듬는다
      const gloss = cleanGloss(part.replace(/^[.\s…]+/, ""));
      // 산문에서 나온 조각이라 영어판 번역보다 길이를 더 조인다
      if (!gloss || gloss.length > 16 || !isHangulGloss(gloss)) continue;
      if (seen.has(gloss)) continue;
      seen.add(gloss);
      out.push(gloss);
    }
  }

  return out;
}

type FetchWikitextResult =
  | { ok: true; wikitext: string }
  | { ok: false; kind: "missing" }
  | { ok: false; kind: "error"; retryable: boolean };

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWikitext(
  pageTitle: string,
  host: "en.wiktionary.org" | "ko.wiktionary.org" = "en.wiktionary.org",
): Promise<FetchWikitextResult> {
  const params = new URLSearchParams({
    action: "parse",
    page: pageTitle,
    prop: "wikitext",
    formatversion: "2",
    format: "json",
    origin: "*",
    redirects: "true",
  });
  const url = `https://${host}/w/api.php?${params.toString()}`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "HaksupTeacherWeb/1.0 (https://haksup.com; custom-assignment; educational)",
          "Api-User-Agent":
            "HaksupTeacherWeb/1.0 (https://haksup.com; custom-assignment; educational)",
        },
        signal: AbortSignal.timeout(12_000),
      });

      if (res.status === 429 || res.status === 503) {
        await sleep(400 * (attempt + 1) ** 2);
        continue;
      }
      if (!res.ok) {
        return { ok: false, kind: "error", retryable: res.status >= 500 };
      }

      const data = (await res.json()) as {
        error?: { code?: string };
        parse?: { wikitext?: string };
      };
      if (data.error?.code === "missingtitle") {
        return { ok: false, kind: "missing" };
      }
      if (data.error || !data.parse?.wikitext) {
        return { ok: false, kind: "error", retryable: false };
      }
      return { ok: true, wikitext: data.parse.wikitext };
    } catch {
      if (attempt < 2) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      return { ok: false, kind: "error", retryable: true };
    }
  }

  return { ok: false, kind: "error", retryable: true };
}

/**
 * 소문자 표제어 + translations 서브페이지만 시도 (최대 2회).
 * 대소문자 변형을 모두 치면 Wikimedia 429가 난다.
 */
function candidatePages(word: string): string[] {
  const trimmed = word.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  return [`${lower}/translations`, lower];
}

type SourceResult = {
  glosses: string[];
  sawSuccessfulPage: boolean;
  hadRetryableError: boolean;
};

/** 영어판: 번역 템플릿 `{{t+|ko|…}}` 수집 */
async function fetchFromEnWiktionary(word: string): Promise<SourceResult> {
  const out: SourceResult = {
    glosses: [],
    sawSuccessfulPage: false,
    hadRetryableError: false,
  };
  for (const page of candidatePages(word)) {
    const result = await fetchWikitext(page, "en.wiktionary.org");
    if (!result.ok) {
      if (result.kind === "error" && result.retryable) {
        out.hadRetryableError = true;
      }
      continue;
    }
    out.sawSuccessfulPage = true;
    out.glosses = extractKoGlossesFromWikitext(result.wikitext);
    // 번역 서브페이지·본문 어디서든 뜻만 모이면 즉시 종료 (추가 요청으로 429 방지)
    if (out.glosses.length > 0) break;
  }
  return out;
}

/** 한국어판: `== 영어 ==` 섹션의 뜻풀이 줄 수집 */
async function fetchFromKoWiktionary(word: string): Promise<SourceResult> {
  const result = await fetchWikitext(
    word.trim().toLowerCase(),
    "ko.wiktionary.org",
  );
  if (!result.ok) {
    return {
      glosses: [],
      sawSuccessfulPage: false,
      hadRetryableError: result.kind === "error" && result.retryable,
    };
  }
  return {
    glosses: extractKoGlossesFromKoWikitext(result.wikitext),
    sawSuccessfulPage: true,
    hadRetryableError: false,
  };
}

/**
 * 서버·라우트 핸들러용 — Wiktionary 직접 조회.
 *
 * 영어판과 한국어판은 데이터가 겹치지 않아 **둘 다** 봐야 적중률이 오른다.
 * 두 호스트라 레이트 리밋도 따로 걸리므로 병렬로 조회해 지연을 늘리지 않는다.
 * 영어판 번역을 앞에 두는 이유는 짧은 대역어라 문맥 매칭에 더 잘 맞아서다.
 */
export async function fetchWiktionaryKoGlossesDirect(
  word: string,
): Promise<string[]> {
  const key = word.trim().toLowerCase();
  if (!key) return [];
  const cached = glossCache.get(key);
  if (cached) return cached;
  if (confirmedMissCache.has(key)) return [];

  const [en, ko] = await Promise.all([
    fetchFromEnWiktionary(word),
    fetchFromKoWiktionary(word),
  ]);

  const merged: string[] = [];
  const seen = new Set<string>();
  for (const gloss of [...en.glosses, ...ko.glosses]) {
    if (seen.has(gloss)) continue;
    seen.add(gloss);
    merged.push(gloss);
  }

  const sawSuccessfulPage = en.sawSuccessfulPage || ko.sawSuccessfulPage;
  const hadRetryableError = en.hadRetryableError || ko.hadRetryableError;

  if (merged.length > 0) {
    glossCache.set(key, merged);
    return merged;
  }

  // 페이지는 읽었는데 한국어 gloss가 없음 → 확정 미스만 캐시
  if (sawSuccessfulPage && !hadRetryableError) {
    confirmedMissCache.add(key);
    glossCache.set(key, []);
  }
  // 429·네트워크 실패 시 빈 배열을 캐시하지 않음 → 다음 선택에서 재시도
  return [];
}

/**
 * 영어 표제어의 한국어 Wiktionary gloss 목록.
 * 브라우저: `/api/wiktionary-ko` · 서버: 직접 MediaWiki.
 * 실패 시 빈 배열.
 */
export async function fetchWiktionaryKoGlosses(word: string): Promise<string[]> {
  const key = word.trim().toLowerCase();
  if (!key) return [];

  if (typeof window !== "undefined") {
    const cached = glossCache.get(key);
    if (cached) return cached;
    if (confirmedMissCache.has(key)) return [];
    try {
      const res = await fetch(
        `/api/wiktionary-ko?word=${encodeURIComponent(word.trim())}`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!res.ok) {
        // 프록시/서버 오류 — 캐시하지 않음
        return [];
      }
      const data = (await res.json()) as {
        glosses?: string[];
        miss?: boolean;
      };
      const glosses = Array.isArray(data.glosses) ? data.glosses : [];
      if (glosses.length > 0) {
        glossCache.set(key, glosses);
        return glosses;
      }
      if (data.miss) {
        confirmedMissCache.add(key);
        glossCache.set(key, []);
      }
      return glosses;
    } catch {
      return [];
    }
  }

  return fetchWiktionaryKoGlossesDirect(word);
}

export function isConfirmedWiktionaryMiss(word: string): boolean {
  return confirmedMissCache.has(word.trim().toLowerCase());
}

export function clearWiktionaryGlossCache(): void {
  glossCache.clear();
  confirmedMissCache.clear();
}
