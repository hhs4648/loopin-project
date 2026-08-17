import { NextResponse } from "next/server";
import {
  fetchWiktionaryKoGlossesDirect,
  isConfirmedWiktionaryMiss,
} from "@/lib/ai/wiktionary-ko-glosses";

export const runtime = "nodejs";

/** GET /api/wiktionary-ko?word=language → { glosses: string[], miss?: boolean } */
export async function GET(request: Request) {
  const word = new URL(request.url).searchParams.get("word")?.trim() ?? "";
  if (!word) {
    return NextResponse.json({ glosses: [], miss: true }, { status: 400 });
  }
  try {
    const glosses = await fetchWiktionaryKoGlossesDirect(word);
    const miss = glosses.length === 0 && isConfirmedWiktionaryMiss(word);
    return NextResponse.json({ glosses, miss });
  } catch {
    // 재시도 가능 — miss 로 표시하지 않음 (클라이언트가 빈 결과 캐시하지 않음)
    return NextResponse.json({ glosses: [], miss: false });
  }
}
