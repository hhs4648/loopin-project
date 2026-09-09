import { stripBrackets, stripMeaningParens } from "@/lib/problem-bank";
import { sanitizeChunkParts } from "@/lib/ai/phrase-chunks";
import { extractCloze } from "@/lib/word-cloze";
import { buildContentSnapshot } from "@/lib/sync/content-snapshot";
import type { SavedProblemSet } from "@/lib/problem-sets";
import type {
  ProblemGrammarSnapshot,
  ProblemSentenceSnapshot,
  ProblemWordSnapshot,
} from "@/lib/sync/types";

export type WrongAnswerRef = {
  questionId: string;
  baseId: string;
  typeKey: string;
};

export type WorksheetCategory = "단어" | "문장" | "문법";

export type WorksheetItem = {
  category: WorksheetCategory;
  typeKey: string;
  typeLabel: string;
  promptLines: string[];
  answerBlankHint?: string;
  answerKey: string;
};

export type WrongAnswerWorksheet = {
  studentId: string;
  studentName: string;
  className: string;
  teacherName: string;
  textbookLine: string;
  assignmentTitle: string;
  lessonDateLabel: string;
  generatedAtLabel: string;
  items: WorksheetItem[];
};

const TYPE_LABEL: Record<string, string> = {
  match: "짝맞추기",
  listen: "음성 짝맞추기",
  choice: "3지선다",
  spell: "예문 빈칸",
  chunk: "청크배열",
  translate: "번역 배열",
  write: "영작",
  ox: "OX문제",
  fix: "OX 교정",
};

const CATEGORY_ORDER: WorksheetCategory[] = ["단어", "문장", "문법"];

const SECTION_INSTRUCTION: Record<WorksheetCategory, string> = {
  단어: "다음 단어·예문을 보고 알맞은 뜻을 쓰거나 빈칸을 채우세요.",
  문장: "제시된 조각을 배열하거나, 한국어를 보고 영어로 쓰세요.",
  문법: "문장이 맞으면 O, 틀리면 X를 쓰고, 선택형이면 알맞은 답을 고르세요.",
};

function typeLabelFor(typeKey: string, category: WorksheetCategory): string {
  if (typeKey === "choice") {
    return category === "문법" ? "선택형 문제" : "3지선다";
  }
  return TYPE_LABEL[typeKey] ?? typeKey;
}

/** 지필 시험지에서는 짝맞추기·음성 짝맞추기를 같은 문항으로 본다. */
function canonicalWorksheetTypeKey(typeKey: string): string {
  if (typeKey === "listen") return "match";
  return typeKey;
}

function splitChunks(text: string | undefined, fallback: string): string[] {
  const source = text?.includes("/") ? text : fallback;
  if (source.includes("/")) {
    return sanitizeChunkParts(
      source
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean),
    );
  }
  return sanitizeChunkParts(
    stripBrackets(source)
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

function scrambleStable(parts: string[], seed: string): string[] {
  const arr = [...parts];
  if (arr.length < 2) return arr;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  for (let i = arr.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const j = (h >>> 0) % (i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  if (arr.join("\0") === parts.join("\0")) {
    [arr[0], arr[arr.length - 1]] = [arr[arr.length - 1]!, arr[0]!];
  }
  return arr;
}

function parseGrammarChoices(choices: string | undefined): string[] {
  return (choices ?? "")
    .split(/[|/]/)
    .map((choice) => choice.trim())
    .filter((choice) => choice && choice !== "-");
}

function buildWordItem(
  word: ProblemWordSnapshot,
  typeKey: string,
  pool: ProblemWordSnapshot[],
  seed: string,
): WorksheetItem | null {
  const category: WorksheetCategory = "단어";
  const label = typeLabelFor(typeKey, category);
  const english = stripBrackets(word.english);
  const korean = stripMeaningParens(stripBrackets(word.korean));

  if (typeKey === "match" || typeKey === "listen" || typeKey === "choice") {
    const distractors = pool
      .filter((w) => w.id !== word.id && w.korean.trim())
      .map((w) => stripBrackets(w.korean));
    const unique = [...new Set(distractors.filter((d) => d !== korean))];
    let promptLines: string[];
    if (typeKey === "choice" && unique.length >= 2) {
      const options = scrambleStable([korean, unique[0]!, unique[1]!], seed);
      promptLines = [
        english,
        ...options.map((opt, i) => `  ${i + 1}) ${opt}`),
      ];
    } else {
      promptLines = [english, "뜻: ________________________"];
    }
    const canonicalType = canonicalWorksheetTypeKey(typeKey);
    return {
      category,
      typeKey: canonicalType,
      typeLabel: typeLabelFor(canonicalType, category),
      promptLines,
      answerKey: korean,
    };
  }

  if (typeKey === "spell") {
    const cloze = extractCloze(word.exampleEn, word.english);
    if (!cloze) {
      return {
        category,
        typeKey,
        typeLabel: label,
        promptLines: [
          `${english} (${korean})`,
          "예문 빈칸을 채우세요: ________________________",
        ],
        answerKey: english,
      };
    }
    return {
      category,
      typeKey,
      typeLabel: label,
      promptLines: [
        stripBrackets(word.exampleKo || korean),
        `${cloze.parts
          .map((part) => (part.kind === "blank" ? "________" : part.text))
          .join("")}`,
      ],
      answerKey: `${cloze.answer} (${korean})`,
    };
  }

  return null;
}

function buildSentenceItem(
  sentence: ProblemSentenceSnapshot,
  typeKey: string,
  seed: string,
): WorksheetItem | null {
  const category: WorksheetCategory = "문장";
  const label = typeLabelFor(typeKey, category);
  const english = stripBrackets(sentence.english);
  const korean = stripBrackets(sentence.korean);

  if (typeKey === "chunk") {
    const segments = splitChunks(sentence.chunksEn, sentence.english);
    const scrambled = scrambleStable(segments, seed);
    return {
      category,
      typeKey,
      typeLabel: label,
      promptLines: [
        korean,
        `조각: ${scrambled.join("  /  ")}`,
        "→ ______________________________________________",
      ],
      answerKey: english,
    };
  }

  if (typeKey === "translate") {
    const segments = splitChunks(sentence.chunksKo, sentence.korean);
    const scrambled = scrambleStable(segments, seed);
    return {
      category,
      typeKey,
      typeLabel: label,
      promptLines: [
        english,
        `조각: ${scrambled.join("  /  ")}`,
        "→ ______________________________________________",
      ],
      answerKey: korean,
    };
  }

  if (typeKey === "write") {
    const keywords = sentence.hint
      ? sentence.hint
          .split(/[,/]/)
          .map((part) => part.trim())
          .filter(Boolean)
          .slice(0, 3)
      : splitChunks(sentence.chunksEn, sentence.english).slice(0, 3);
    return {
      category,
      typeKey,
      typeLabel: label,
      promptLines: [
        korean,
        keywords.length > 0 ? `힌트: ${keywords.join(", ")}` : "",
        "→ ______________________________________________",
      ].filter(Boolean),
      answerKey: english,
    };
  }

  return null;
}

function normalizeGrammarTypeKey(typeKey: string): string {
  if (typeKey === "ox-fix") return "fix";
  return typeKey;
}

function buildGrammarItem(
  grammar: ProblemGrammarSnapshot,
  typeKey: string,
): WorksheetItem | null {
  const category: WorksheetCategory = "문법";
  const normalizedType = normalizeGrammarTypeKey(typeKey);
  const label = typeLabelFor(normalizedType, category);
  const english = stripBrackets(grammar.english);
  const korean = stripBrackets(grammar.korean);
  const ox = (grammar.ox ?? "").trim().toUpperCase();
  const choices = parseGrammarChoices(grammar.choices);

  // `ox` = OX 판정, `fix` = X일 때 이어지는 교정 스텝 오답
  if (normalizedType === "ox" || normalizedType === "fix") {
    const isFix = normalizedType === "fix";
    const lines = isFix
      ? [
          english,
          "틀린 곳에 ○ 치고 바르게 고치세요: ________________________",
        ]
      : [
          english,
          "O / X : ______",
          "틀린 곳에 ○ 치고 바르게 고치세요: ________________________",
        ];
    const answerParts = isFix
      ? [choices[0] ? `고침: ${choices[0]}` : korean || "—"]
      : [ox || "—"];
    if (!isFix && ox === "X") {
      const fix = choices[0] || grammar.wrongPart?.trim();
      if (fix && fix !== "-") answerParts.push(`고침: ${fix}`);
    }
    return {
      category,
      typeKey: normalizedType,
      typeLabel: label,
      promptLines: lines,
      answerKey: answerParts.join(" · "),
    };
  }

  if (normalizedType === "choice") {
    const target = grammar.wrongPart?.trim();
    const blanked =
      target && target !== "-" && english.includes(target)
        ? english.replace(target, "________")
        : english;
    const optionLines =
      choices.length > 0
        ? choices.map((c, i) => `  ${i + 1}) ${c}`)
        : ["  (보기를 보고 고르세요)"];
    return {
      category,
      typeKey: normalizedType,
      typeLabel: label,
      promptLines: [blanked, ...optionLines],
      answerKey: choices[0] ?? korean ?? "—",
    };
  }

  return null;
}

/** 같은 지문·유형·정답이 이미 있으면 중복으로 본다. */
function isDuplicateItem(item: WorksheetItem, seenContent: Set<string>): boolean {
  const key = [
    item.category,
    canonicalWorksheetTypeKey(item.typeKey),
    item.answerKey,
    ...item.promptLines,
  ].join("\0");
  if (seenContent.has(key)) return true;
  seenContent.add(key);
  return false;
}

export function buildWrongAnswerWorksheet(params: {
  problemSet: SavedProblemSet;
  wrongAnswers: WrongAnswerRef[];
  studentId: string;
  studentName: string;
  className: string;
  teacherName: string;
  lessonDateLabel: string;
}): WrongAnswerWorksheet {
  const snapshot = buildContentSnapshot(params.problemSet);
  const words = snapshot.words;
  const sentences = snapshot.sentences;
  const grammarList = snapshot.grammar;

  const wordById = new Map(words.map((w) => [w.id, w]));
  const sentenceById = new Map(sentences.map((s) => [s.id, s]));
  const grammarById = new Map(grammarList.map((g) => [g.id, g]));

  const items: WorksheetItem[] = [];
  const seenIds = new Set<string>();
  const seenContent = new Set<string>();

  for (const wrong of params.wrongAnswers) {
    const idKey = `${wrong.baseId}:${canonicalWorksheetTypeKey(wrong.typeKey)}`;
    if (seenIds.has(wrong.questionId) || seenIds.has(idKey)) continue;
    seenIds.add(wrong.questionId);
    seenIds.add(idKey);
    const seed = `${params.studentId}:${wrong.questionId}`;

    const word = wordById.get(wrong.baseId);
    if (word) {
      const item = buildWordItem(word, wrong.typeKey, words, seed);
      if (item && !isDuplicateItem(item, seenContent)) items.push(item);
      continue;
    }

    const sentence = sentenceById.get(wrong.baseId);
    if (sentence) {
      const item = buildSentenceItem(sentence, wrong.typeKey, seed);
      if (item && !isDuplicateItem(item, seenContent)) items.push(item);
      continue;
    }

    const g = grammarById.get(wrong.baseId);
    if (g) {
      const item = buildGrammarItem(g, wrong.typeKey);
      if (item && !isDuplicateItem(item, seenContent)) items.push(item);
    }
  }

  items.sort((a, b) => {
    const cat =
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (cat !== 0) return cat;
    return a.typeLabel.localeCompare(b.typeLabel, "ko");
  });

  const now = new Date();
  const generatedAtLabel = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;

  return {
    studentId: params.studentId,
    studentName: params.studentName,
    className: params.className,
    teacherName: params.teacherName,
    textbookLine: `${params.problemSet.grade} · ${params.problemSet.textbook} · ${params.problemSet.unit}`,
    assignmentTitle: params.problemSet.title,
    lessonDateLabel: params.lessonDateLabel,
    generatedAtLabel,
    items,
  };
}

export function groupWorksheetItems(items: WorksheetItem[]) {
  return CATEGORY_ORDER.map((category) => ({
    category,
    instruction: SECTION_INSTRUCTION[category],
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);
}

export type WorksheetBlockStyle =
  | "title"
  | "meta"
  | "heading"
  | "instruction"
  | "body"
  | "spacer";

export type WorksheetBlock = {
  style: WorksheetBlockStyle;
  text: string;
};

/** 인쇄·HWPX 공용 문단 목록 (한 줄 = 한 문단) — 문제만 */
export function worksheetQuestionBlocks(
  sheet: WrongAnswerWorksheet,
): WorksheetBlock[] {
  const blocks: WorksheetBlock[] = [];
  blocks.push({
    style: "meta",
    text: `${sheet.generatedAtLabel}   ${sheet.className}   ${sheet.teacherName} 선생님   이름: ${sheet.studentName}`,
  });
  blocks.push({
    style: "meta",
    text: `교과서: ${sheet.textbookLine}${
      sheet.lessonDateLabel ? `   수업일: ${sheet.lessonDateLabel}` : ""
    }`,
  });
  blocks.push({
    style: "title",
    text: `${sheet.assignmentTitle} · 오답 시험지`,
  });

  if (sheet.items.length === 0) {
    blocks.push({ style: "spacer", text: "" });
    blocks.push({ style: "body", text: "오답이 없습니다. 잘했어요!" });
    return blocks;
  }

  let n = 1;
  for (const group of groupWorksheetItems(sheet.items)) {
    blocks.push({ style: "heading", text: `${group.category} 테스트` });
    blocks.push({ style: "instruction", text: `* ${group.instruction}` });
    for (const item of group.items) {
      for (const [i, line] of item.promptLines.entries()) {
        // HWPX: underscore 대신 이은 가로선(─)으로 빈칸 표시
        const lined = line.replace(/_{2,}/g, (run) =>
          "─".repeat(Math.max(4, Math.ceil(run.length * 0.55))),
        );
        blocks.push({
          style: "body",
          text: i === 0 ? `${n}. ${lined}` : `    ${lined}`,
        });
      }
      blocks.push({ style: "spacer", text: "" });
      n += 1;
    }
  }
  return blocks;
}

/** 정답 전용 페이지 문단 — 문제와 항상 분리 */
export function worksheetAnswerBlocks(
  sheet: WrongAnswerWorksheet,
): WorksheetBlock[] | null {
  if (sheet.items.length === 0) return null;

  const blocks: WorksheetBlock[] = [];
  blocks.push({
    style: "meta",
    text: `${sheet.className}   이름: ${sheet.studentName}`,
  });
  blocks.push({
    style: "title",
    text: `${sheet.assignmentTitle} · 정답`,
  });
  blocks.push({ style: "heading", text: "정답" });
  let n = 1;
  for (const item of sheet.items) {
    blocks.push({
      style: "body",
      text: `${n}. ${item.answerKey}`,
    });
    n += 1;
  }
  return blocks;
}

/** 문제(+정답) 전체 — 미리보기·평문용. 인쇄 시엔 페이지를 분리해 쓴다. */
export function worksheetBlocks(sheet: WrongAnswerWorksheet): WorksheetBlock[] {
  const answers = worksheetAnswerBlocks(sheet);
  return [
    ...worksheetQuestionBlocks(sheet),
    ...(answers ?? []),
  ];
}

export function worksheetPlainLines(sheet: WrongAnswerWorksheet): string[] {
  return worksheetBlocks(sheet).map((block) => block.text);
}
