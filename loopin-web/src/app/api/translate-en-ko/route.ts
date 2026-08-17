import { NextResponse } from "next/server";
import { translateEnToKoDirect } from "@/lib/ai/translate-en-ko";

export const runtime = "nodejs";

/** GET /api/translate-en-ko?q=language → { text: string | null } */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ text: null }, { status: 400 });
  }
  try {
    const text = await translateEnToKoDirect(q);
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ text: null });
  }
}
