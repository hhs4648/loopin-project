/**
 * 영어 → 한국어 번역 보완 (MyMemory).
 * 브라우저는 `/api/translate-en-ko` 프록시, 서버는 직접 호출.
 */

const translateCache = new Map<string, string>();

function looksLikeKorean(text: string): boolean {
  return /[\uac00-\ud7a3]/.test(text);
}

/** 번역 결과에서 단어 뜻으로 쓸 짧은 한글만 남김 */
export function normalizeTranslatedGloss(text: string): string | null {
  const cleaned = text
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || !looksLikeKorean(cleaned)) return null;
  if (cleaned.length > 20) {
    const first = cleaned.split(/[,\s/·]/)[0]?.trim() ?? "";
    if (first && looksLikeKorean(first) && first.length <= 12) return first;
    return null;
  }
  return cleaned;
}

export async function translateEnToKoDirect(
  word: string,
): Promise<string | null> {
  const q = word.trim();
  if (!q) return null;
  const key = q.toLowerCase();
  const cached = translateCache.get(key);
  if (cached !== undefined) return cached || null;

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|ko`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // 네트워크/쿼터 오류는 캐시하지 않음
      return null;
    }
    const data = (await res.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number | string;
    };
    const status = Number(data.responseStatus);
    if (status && status !== 200) {
      return null;
    }
    const gloss = normalizeTranslatedGloss(
      data.responseData?.translatedText ?? "",
    );
    // 정상 응답만 캐시 (빈 번역 포함 — 재요청 방지)
    translateCache.set(key, gloss ?? "");
    return gloss;
  } catch {
    return null;
  }
}

export async function translateEnToKo(word: string): Promise<string | null> {
  const q = word.trim();
  if (!q) return null;
  const key = q.toLowerCase();

  if (typeof window !== "undefined") {
    const cached = translateCache.get(key);
    if (cached !== undefined) return cached || null;
    try {
      const res = await fetch(
        `/api/translate-en-ko?q=${encodeURIComponent(q)}`,
        { signal: AbortSignal.timeout(12_000) },
      );
      if (!res.ok) {
        return null;
      }
      const data = (await res.json()) as { text?: string | null };
      const gloss =
        typeof data.text === "string" && data.text.trim()
          ? data.text.trim()
          : null;
      translateCache.set(key, gloss ?? "");
      return gloss;
    } catch {
      return null;
    }
  }

  return translateEnToKoDirect(q);
}

export function clearTranslateCache(): void {
  translateCache.clear();
}
