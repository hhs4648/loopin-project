import {
  splitEnglishChunksPhrase,
  splitKoreanChunksPhrase,
} from "@/lib/ai/phrase-chunks";
import { stripBrackets } from "@/lib/problem-bank";

export type AddProblemKind = "word" | "sentence" | "grammar";

function parseSlashParts(value: string): string[] {
  return value
    .split(/[|/]/)
    .map((part) => part.trim())
    .filter((part) => part && part !== "-");
}

function findCloze(exampleEn: string): string | null {
  const matches = [...exampleEn.matchAll(/\[([^\]]+)\]/g)];
  if (matches.length === 0) return null;
  if (matches.length > 1) return "__multiple__";
  return matches[0]?.[1]?.trim() || null;
}

/** 형식이 올바르면 null, 아니면 사용자에게 보여줄 이유 */
export function validateProblemItemInput(input: {
  kind: AddProblemKind;
  english: string;
  korean: string;
  exampleEn?: string;
  exampleKo?: string;
  chunksEn?: string;
  chunksKo?: string;
  ox?: "O" | "X";
  wrongPart?: string;
  choices?: string;
}): string | null {
  const en = input.english.trim();
  const ko = input.korean.trim();

  if (!en) return "영어를 입력해 주세요.";
  if (!ko) return "한글 뜻을 입력해 주세요.";

  if (input.kind === "word") {
    const exampleEn = (input.exampleEn ?? "").trim();
    const exampleKo = (input.exampleKo ?? "").trim();
    if (!exampleEn) {
      return "예문(영어)을 입력해 주세요. 빈칸은 [단어] 형태로 적어 주세요.";
    }
    const cloze = findCloze(exampleEn);
    if (cloze === null) {
      return "예문(영어)에 빈칸이 없어요. 예: The pets you [raise] show...";
    }
    if (cloze === "__multiple__") {
      return "예문(영어)의 [빈칸]은 하나만 넣어 주세요.";
    }
    if (cloze.toLowerCase() !== stripBrackets(en).toLowerCase()) {
      return `예문 빈칸 [${cloze}]이 영어 단어 "${en}"과 같아야 해요.`;
    }
    if (!exampleKo) {
      return "예문 뜻(한글)을 입력해 주세요.";
    }
    return null;
  }

  if (input.kind === "sentence") {
    const chunksEnRaw = (input.chunksEn ?? "").trim();
    const chunksKoRaw = (input.chunksKo ?? "").trim();
    const enParts = chunksEnRaw
      ? parseSlashParts(chunksEnRaw)
      : splitEnglishChunksPhrase(en);
    const koParts = chunksKoRaw
      ? parseSlashParts(chunksKoRaw)
      : splitKoreanChunksPhrase(ko);

    if (chunksEnRaw && !chunksEnRaw.includes("/") && enParts.length < 2) {
      return "영어 청크는 `/`로 구분해 주세요. 또는 「자동 나눔」을 눌러 주세요.";
    }
    if (chunksKoRaw && !chunksKoRaw.includes("/") && koParts.length < 2) {
      return "한글 청크는 `/`로 구분해 주세요. 또는 「자동 나눔」을 눌러 주세요.";
    }
    if (enParts.length < 2) {
      return "영어 청크가 2조각 이상이어야 해요. 「자동 나눔」을 누르거나 `/`로 나눠 주세요.";
    }
    if (koParts.length < 2) {
      return "한글 청크가 2조각 이상이어야 해요. 「자동 나눔」을 누르거나 `/`로 나눠 주세요.";
    }
    return null;
  }

  // grammar
  const ox = input.ox ?? "O";
  if (ox !== "O" && ox !== "X") {
    return "O / X 정답을 선택해 주세요.";
  }
  if (ox === "X") {
    const wrong = (input.wrongPart ?? "").trim();
    if (!wrong) {
      return "정답이 X일 때는 틀린 부분을 입력해 주세요.";
    }
    if (!en.includes(wrong)) {
      return `틀린 부분 "${wrong}"이 영어 문장 안에 없어요. 문장과 똑같이 적어 주세요.`;
    }
    const choiceParts = parseSlashParts(input.choices ?? "");
    if (choiceParts.length === 0) {
      return "선택지를 입력해 주세요. 첫 항목이 정답이며 `/`로 구분해요.";
    }
    // 교정 문제는 3지선다 고정 — 학생앱 buildOxXCorrection이 3개 미만이면 교정 단계를 만들지 않는다.
    if (choiceParts.length !== 3) {
      return "선택지는 3개를 `/`로 구분해 주세요. (첫 항목이 정답)";
    }
  }
  return null;
}
