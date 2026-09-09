import {
  splitEnglishChunksPhrase,
  splitKoreanChunksPhrase,
} from "@/lib/ai/phrase-chunks";
import { stripBrackets } from "@/lib/problem-bank";
import { isInflectedFormOf } from "@/lib/english-inflections";
import { findExistingCloze, wrapMatchingWord } from "@/lib/word-cloze";

export type AddProblemKind = "word" | "sentence" | "grammar";

function parseSlashParts(value: string): string[] {
  return value
    .split(/[|/]/)
    .map((part) => part.trim())
    .filter((part) => part && part !== "-");
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
    /*
      **예문은 선택이다.** 예전에는 예문과 그 뜻이 없으면 저장을 막았는데, 단어만 넣고
      싶은 경우가 훨씬 많다 — 예문까지 매번 지어내라고 하면 단어 추가 자체를 안 하게 된다.
      비워 두면 예문을 쓰는 문제 유형에서 그 단어가 빠질 뿐, 나머지는 그대로 나간다.

      **넣었을 때의 형식 검사는 그대로 둔다.** 빈칸이 단어와 안 맞으면 문제가 깨지므로
      그건 여전히 막아야 한다 — 「안 써도 된다」와 「틀리게 써도 된다」는 다르다.
    */
    const exampleEn = (input.exampleEn ?? "").trim();
    if (!exampleEn) return null;
    const cloze = findExistingCloze(exampleEn);
    const auto = wrapMatchingWord(stripBrackets(exampleEn), stripBrackets(en));
    if (cloze === "__multiple__") {
      if (auto && auto === exampleEn) return null;
      return "예문 빈칸이 표제어의 실제 단어와 맞아야 해요. 자리를 나타내는 A/B/~ 는 빈칸에 넣지 않습니다.";
    }
    if (cloze !== null && !isInflectedFormOf(cloze, stripBrackets(en))) {
      if (auto && auto === exampleEn) return null;
      return `예문 빈칸 [${cloze}]이 영어 단어 "${en}"(활용형 포함)과 같아야 해요.`;
    }
    if (cloze === null && !auto) {
      return `예문에 영어 단어 "${en}"이 없어요. 같은 단어나 활용형(held 등)을 넣으면 빈칸이 자동으로 생겨요.`;
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
