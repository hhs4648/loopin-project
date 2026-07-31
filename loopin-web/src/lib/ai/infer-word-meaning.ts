import {
  splitEnglishChunksPhrase,
  splitKoreanChunksPhrase,
} from "@/lib/ai/phrase-chunks";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripKoreanParticles(token: string): string {
  return token
    .replace(/[.,!?。…]+$/g, "")
    .replace(/(으로|에서|에게|한테|부터|까지|이랑|처럼|같이)$/u, "")
    .replace(/(은|는|이|가|을|를|에|와|과|도|만|의|로|랑)$/u, "")
    .trim();
}

function cleanKoreanPhrase(phrase: string): string {
  return phrase
    .replace(/[.,!?。…]+$/g, "")
    .split(/\s+/)
    .map(stripKoreanParticles)
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** 한글 절을 접속·어미 기준으로 조금 더 잘게 나눔 (영문 청크 수에 맞춤) */
function splitKoreanForAlignment(translationKo: string): string[] {
  const trimmed = translationKo.trim();
  if (!trimmed) return [];
  if (trimmed.includes("/")) {
    return trimmed
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const clauseParts = trimmed
    .split(/(?<=(?:지만|고|며|어서|아서|니까|면|거나|든지)),?\s+|(?<=,)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (clauseParts.length > 1) {
    return clauseParts.flatMap((part) => {
      const chunks = splitKoreanChunksPhrase(part);
      return chunks.length > 0 ? chunks : [part];
    });
  }

  return splitKoreanChunksPhrase(trimmed);
}

function mapChunkIndex(
  enIndex: number,
  enCount: number,
  koCount: number,
): number {
  if (koCount <= 1) return 0;
  if (enCount <= 1) return 0;
  if (enCount === koCount) return enIndex;
  return Math.min(
    koCount - 1,
    Math.round((enIndex * (koCount - 1)) / (enCount - 1)),
  );
}

/**
 * 사용자가 넣은 문장 뜻 + 영어 문장으로 단어 뜻을 유추.
 * AI API 없이 구나 정렬 휴리스틱만 사용.
 */
export function inferWordMeaningFromSentence(params: {
  surface: string;
  sentence: string;
  translationKo: string;
}): string | null {
  const surface = params.surface.trim();
  const translationKo = params.translationKo.trim();
  if (!surface || !translationKo) return null;
  if (!/[\uac00-\ud7a3]/.test(translationKo)) return null;

  const enChunks = splitEnglishChunksPhrase(params.sentence);
  const koChunks = splitKoreanForAlignment(translationKo);
  if (enChunks.length === 0 || koChunks.length === 0) return null;

  const chunkIdx = enChunks.findIndex((chunk) =>
    new RegExp(`\\b${escapeRegExp(surface)}\\b`, "i").test(chunk),
  );
  if (chunkIdx < 0) return null;

  const koIdx = mapChunkIndex(chunkIdx, enChunks.length, koChunks.length);
  const enChunk = enChunks[chunkIdx]!;
  const koPhrase = cleanKoreanPhrase(koChunks[koIdx] ?? "");
  if (!koPhrase) return null;

  const enWords = enChunk.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
  const koWords = koPhrase.split(/\s+/).filter(Boolean);
  if (enWords.length <= 1 || koWords.length === 0) {
    return koWords.length === 1 ? koWords[0]! : koPhrase;
  }

  const wordPos = enWords.findIndex(
    (w) => w.toLowerCase() === surface.toLowerCase(),
  );
  if (wordPos < 0) return koPhrase;

  const glossIdx = mapChunkIndex(wordPos, enWords.length, koWords.length);
  return koWords[glossIdx] ?? koPhrase;
}
