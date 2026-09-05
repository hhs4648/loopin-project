import fs from "fs";
import path from "path";
import os from "os";
import { execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";

// 앱의 「자동 나눔」과 **같은 규칙**으로 청크를 만든다 (로직 이중화 방지).
// phrase-chunks.ts는 이 용도 때문에 의존성이 없다 — `@/…` 별칭을 넣지 말 것.
// Node 22.18+/24는 .ts를 타입 스트리핑으로 바로 읽는다.
const { splitEnglishChunksPhrase, splitKoreanChunksPhrase, formatChunkLine } =
  await import("../loopin-web/src/lib/ai/phrase-chunks.ts");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const xlsxPath = process.argv[2];
const outPath =
  process.argv[3] ??
  path.join(__dirname, "../loopin-web/src/data/problem-bank.json");

if (!xlsxPath) {
  console.error("Usage: node import-problem-bank.mjs <xlsx> [output-json]");
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xlsx-"));
const zipCopy = path.join(tmp, "sheet.zip");
fs.copyFileSync(xlsxPath, zipCopy);
const dest = path.join(tmp, "unzipped");
fs.mkdirSync(dest, { recursive: true });
execSync(
  `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipCopy.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/\\/g, "/")}' -Force"`,
  { stdio: "pipe" }
);

/*
  엑셀 파일마다 XML 태그에 **네임스페이스 접두사가 붙기도 한다** — 엑셀 데스크톱이
  쓴 파일은 `<si>`지만, 엑셀 온라인이나 일부 라이브러리로 저장하면 `<x:si>`가 된다.
  접두사를 안 받아 주면 시트를 하나도 못 읽고 **조용히 0건을 쓴다**(에러도 안 난다).
  그래서 아래 정규식은 전부 `NS`로 접두사를 선택 처리한다.
*/
const NS = "(?:[A-Za-z0-9_.-]+:)?";

function parseShared(xml) {
  const shared = [];
  const siRe = new RegExp(String.raw`<${NS}si[^>]*>([\s\S]*?)<\/${NS}si>`, "g");
  let m;
  while ((m = siRe.exec(xml))) {
    const tRe = new RegExp(String.raw`<${NS}t[^>]*>([\s\S]*?)<\/${NS}t>`, "g");
    let t;
    let text = "";
    while ((t = tRe.exec(m[1]))) text += t[1];
    shared.push(text);
  }
  return shared;
}

function colToIndex(col) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml, shared) {
  const rows = [];
  const rowRe = new RegExp(String.raw`<${NS}row[^>]*>([\s\S]*?)<\/${NS}row>`, "g");
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const map = {};
    let max = -1;
    // 빈 셀은 `<c r="B3" s="1"/>`처럼 self-closing으로 나온다.
    // `</c>`를 강제하면 그 뒤 셀들을 통째로 삼켜 열이 밀리므로 두 형태를 모두 받는다.
    const cRe = new RegExp(
      String.raw`<${NS}c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/${NS}c>)`,
      "g"
    );
    let cm;
    while ((cm = cRe.exec(rm[1]))) {
      const col = colToIndex(cm[1]);
      const attrs = cm[3];
      const inner = cm[4] ?? "";
      let val = "";
      const v = inner.match(new RegExp(String.raw`<${NS}v>([\s\S]*?)<\/${NS}v>`));
      if (v) {
        val = v[1];
        if (/t="s"/.test(attrs)) val = shared[Number(val)] ?? val;
      } else if (/t="inlineStr"/.test(attrs)) {
        // 인라인 문자열(`<is><t>…</t></is>`)은 `<v>`가 없다. 엑셀이 직접 쓴 시트는
        // 거의 안 쓰지만, 다른 도구로 만들거나 붙여넣은 시트에는 이 형태가 나온다.
        // 못 읽으면 **머리글이 통째로 빈 칸이 되어** 그 시트가 조용히 무시된다.
        val = [
          ...inner.matchAll(
            new RegExp(String.raw`<${NS}t[^>]*>([\s\S]*?)<\/${NS}t>`, "g")
          ),
        ]
          .map((m) => m[1])
          .join("");
      }
      map[col] = val;
      max = Math.max(max, col);
    }
    const arr = Array(max + 1).fill("");
    for (const [k, v] of Object.entries(map)) arr[Number(k)] = v;
    rows.push(arr);
  }
  return rows;
}

function decodeXml(s) {
  return String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function sheetGradeToUi(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return decodeXml(v);
  return `중${n}`;
}

function sheetUnitToUi(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return decodeXml(v);
  return `${n}단원`;
}

/** Excel short names → UI picker labels in NewProblemSetPanel */
const TEXTBOOK_ALIASES = {
  "능률(김)": "NE능률(김)",
  "NE능률(김)": "NE능률(김)",
};

function sheetTextbookToUi(v) {
  const raw = decodeXml(v);
  return TEXTBOOK_ALIASES[raw] ?? raw;
}

function getSheetNames(workbookXml, relsXml) {
  // 속성 순서는 파일마다 다르다(`Id` 다음 `Target`인 것도, 반대인 것도 있다).
  // 순서를 박아 두면 그 파일만 통째로 안 읽히므로 태그를 먼저 끊고 속성을 따로 읽는다.
  const attr = (tag, name) =>
    tag.match(new RegExp(String.raw`${name}="([^"]*)"`))?.[1];
  const idToTarget = {};
  const relRe = new RegExp(String.raw`<${NS}Relationship\b[^>]*>`, "g");
  let rm;
  while ((rm = relRe.exec(relsXml))) {
    const id = attr(rm[0], "Id");
    const target = attr(rm[0], "Target");
    if (id && target) idToTarget[id] = target.replace(/^.*\//, "");
  }
  const sheets = [];
  const sheetRe = new RegExp(String.raw`<${NS}sheet\b[^>]*>`, "g");
  let m;
  while ((m = sheetRe.exec(workbookXml))) {
    const name = attr(m[0], "name");
    const rid = attr(m[0], "r:id");
    if (!name || !rid) continue;
    sheets.push({
      name: decodeXml(name),
      file: idToTarget[rid],
      hidden: /state="hidden"/.test(m[0]),
    });
  }
  return sheets;
}

function headerIndex(header) {
  return Object.fromEntries(header.map((h, i) => [decodeXml(h), i]));
}

/**
 * 엑셀 셀 값을 읽어 **공백을 정리해서** 돌려준다.
 *
 * 시트에는 청크 구분용으로 두 칸씩 띄우거나 줄 끝에 공백이 남은 값이 흔하다.
 * 그대로 실으면 문장 뜻이 「당신이 기르는  애완동물들은」처럼 벌어진 채 저장된다.
 * 화면에서는 HTML이 공백을 합쳐 티가 안 나지만, 문자열 비교·정답 판정에서
 * 조용히 어긋날 수 있어 들어올 때 한 번에 정리한다.
 *
 * 청크 열의 `" / "`는 공백이 한 칸씩이라 이 정리에 영향받지 않는다.
 */
function cell(row, idx, key) {
  const i = idx[key];
  if (i === undefined) return "";
  return decodeXml(row[i] ?? "")
    .replace(/[\s ]+/g, " ")
    .trim();
}

function fillDown(prev, current) {
  return current || prev;
}

function slug(parts) {
  return parts
    .join("-")
    .replace(/\s+/g, "")
    .replace(/[^\w가-힣()-]+/g, "");
}

const shared = parseShared(
  fs.readFileSync(path.join(dest, "xl/sharedStrings.xml"), "utf8")
);
const workbookXml = fs.readFileSync(path.join(dest, "xl/workbook.xml"), "utf8");
const relsXml = fs.readFileSync(
  path.join(dest, "xl/_rels/workbook.xml.rels"),
  "utf8"
);
const sheetMeta = getSheetNames(workbookXml, relsXml);

const words = [];
const sentences = [];
const grammar = [];
/*
  「TTS」 시트 — **음성만 만들고 문제은행에는 안 싣는 문장**들.

  교과서 본문은 저작권 때문에 플랫폼이 사전 탑재하지 않고 교사가 직접 입력한다
  (수업목적 이용 + OSP 면책 구조). 그런데 교사가 치는 문장은 결국 원문 그대로라,
  음성을 미리 뽑아 두면 학생이 들을 때 Edge Function을 한 번도 안 친다.

  음성 파일 이름이 **텍스트의 해시**라 이게 성립한다 — 원문을 problem-bank.json에도
  매니페스트에도 안 적고, mp3만 갖고 있어도 교사가 같은 문장을 넣는 순간 맞아떨어진다.
  그래서 이 목록은 **임시 파일로만** 학생 리포에 넘긴다. 원문이 남는 곳은 엑셀뿐이다.
*/
const ttsOnly = [];
/*
  TTS 시트에 올라온 **단원**. 「이 단원의 본문은 음성만 갖고, 문제은행에는 안 싣는다」는
  뜻이라 아래 mergeByScope에 같이 넘긴다.

  안 넘기면: 문장을 「문장」 시트에서 빼 TTS 시트로 옮겨도, 그 단원에 새 문장이 0개라
  merge가 **손댈 게 없다고 보고 예전 문장을 그대로 남긴다.** 저작권 때문에 뺀 본문이
  조용히 살아 있게 되는 것이라, 시트를 옮긴 것만으로 지워지게 만들어 둔다.
*/
const ttsScopes = new Set();
const wordKey = (w) => `${w.grade}|${w.textbook}|${w.unit}|${w.english}`;
const seenWords = new Set();

for (const meta of sheetMeta) {
  const sheetFile = path.join(dest, "xl/worksheets", meta.file);
  if (!fs.existsSync(sheetFile)) continue;
  const rows = parseSheet(fs.readFileSync(sheetFile, "utf8"), shared);
  if (rows.length < 2) continue;
  const [header, ...dataRows] = rows;
  const idx = headerIndex(header);
  console.log("SHEET:", meta.name, meta.hidden ? "(hidden)" : "", Object.keys(idx));

  // 「TTS」가 이름에 들어간 시트는 음성 전용이다 (「TTS」, 「본문(TTS)」 …)
  if (/tts/i.test(meta.name)) {
    dataRows.forEach((r) => {
      const english =
        cell(r, idx, "영어 문장") || cell(r, idx, "문장") || cell(r, idx, "영어");
      if (!english) return;
      ttsOnly.push(english);
      const grade = sheetGradeToUi(cell(r, idx, "학년"));
      const textbook = sheetTextbookToUi(cell(r, idx, "교과서"));
      const unit = sheetUnitToUi(cell(r, idx, "단원"));
      if (grade && textbook && unit) ttsScopes.add(`${grade}|${textbook}|${unit}`);
    });
    continue;
  }

  if (meta.name === "문장") {
    dataRows.forEach((r, i) => {
      // 새 양식은 「문장」, 구 양식은 「영어 문장」
      const english = cell(r, idx, "문장") || cell(r, idx, "영어 문장");
      if (!english) return;
      const grade = sheetGradeToUi(cell(r, idx, "학년"));
      const textbook = sheetTextbookToUi(cell(r, idx, "교과서"));
      const unit = sheetUnitToUi(cell(r, idx, "단원"));
      // 새 양식은 「문장 뜻」 한 칸만 받고 청크는 앱이 만든다.
      // 구 양식(「청크(영어)」/「청크(한국어)」)도 그대로 읽어 준다.
      const korean =
        cell(r, idx, "문장 뜻") ||
        cell(r, idx, "한국어 뜻") ||
        cell(r, idx, "청크(한국어)");
      // 청크는 루프가 끝난 뒤 한꺼번에 만든다 — 숙어 목록을 「단어」시트에서 가져와야 하는데
      // 시트 처리 순서에 기대면 시트를 재배열했을 때 조용히 깨진다.
      // 청크 열은 **슬래시로 나뉜 값만** 청크로 인정한다.
      // 양식에 따라 이 칸을 공백으로 구분해 채워 오는 경우가 있는데, 그대로 실으면
      // 학생 앱이 슬래시가 없다고 보고 **어절 단위로 쪼갠다**(build-session-sections
      // 의 splitChunks). 「당신이 기르는」이 「당신이」+「기르는」으로 갈라진다.
      // 그래서 슬래시가 없으면 「안 나눈 문장」으로 보고, 아래 fillMissingChunks가
      // 앱과 같은 규칙으로 다시 나눈다.
      const chunkCell = (name) => {
        const value = cell(r, idx, name);
        return value.includes("/") ? value : "";
      };
      const chunksEn = chunkCell("청크(영어)");
      const chunksKo = chunkCell("청크(한국어)");
      sentences.push({
        id: slug(["sent", grade, textbook, unit, String(i + 1)]),
        textbook,
        grade,
        unit,
        english,
        korean,
        chunksEn,
        chunksKo,
        wrongChunks: cell(r, idx, "오답 청크"),
        hint: cell(r, idx, "힌트"),
      });
    });
    continue;
  }

  if (meta.name === "문법") {
    dataRows.forEach((r, i) => {
      const english = cell(r, idx, "영어 문장");
      if (!english) return;
      const grade = sheetGradeToUi(cell(r, idx, "학년"));
      const textbook = sheetTextbookToUi(cell(r, idx, "교과서"));
      const unit = sheetUnitToUi(cell(r, idx, "단원"));
      // Newer templates use single 「분류」; older ones use 대분류/소분류/번호/대표여부
      const major =
        cell(r, idx, "대분류") || cell(r, idx, "분류");
      grammar.push({
        id: slug(["gram", grade, textbook, unit, String(i + 1)]),
        textbook,
        grade,
        unit,
        no: cell(r, idx, "번호"),
        major,
        minor: cell(r, idx, "소분류"),
        representative: cell(r, idx, "대표여부"),
        english,
        // 양식에 따라 「O/X」이기도 하고 「OX」이기도 하다. 이 칸이 비면 학생 앱이
        // 「유효하지 않은 O/X」로 보고 그 문항을 통째로 버린다 — 둘 다 받는다.
        ox: cell(r, idx, "O/X") || cell(r, idx, "OX"),
        wrongPart: cell(r, idx, "틀린 부분"),
        korean: cell(r, idx, "한국어 뜻"),
        choices: cell(r, idx, "3지선다 선택지"),
        explanation: cell(r, idx, "해설"),
      });
    });
    continue;
  }

  // 현재 양식은 「단어(데모)」·「문장」·「문법」 3개 시트 체제다.
  // (구 「단어」 시트는 2026-08 폐기 — 이름에 '단어'가 들어가면 여기로 들어온다)
  if (meta.name.includes("단어")) {
    if (meta.hidden) continue; // 숨김 시트는 초안이 많아 스킵
    let lastTextbook = "";
    let lastGrade = "";
    let lastUnit = "";
    let lastCategory = "";
    dataRows.forEach((r, i) => {
      // 새 양식은 「단어」/「단어 뜻」, 구 양식은 「영어」/「한글」.
      // 예문 열(「예문」/「교과서 예문」)과 같은 규칙으로 양쪽 다 받는다.
      const english = cell(r, idx, "단어") || cell(r, idx, "영어");
      // 시트 아래쪽 「양식 샘플」행은 영어 칸에 O/X 같은 값만 있고 한글이 비어 있다.
      // 뜻 없는 행은 단어로 쓸 수 없으므로 둘 다 있는 행만 받는다.
      const korean = cell(r, idx, "단어 뜻") || cell(r, idx, "한글");
      if (!english || !korean) return;
      lastTextbook = fillDown(lastTextbook, cell(r, idx, "교과서"));
      lastGrade = fillDown(lastGrade, cell(r, idx, "학년"));
      lastUnit = fillDown(lastUnit, cell(r, idx, "단원"));
      lastCategory = fillDown(lastCategory, cell(r, idx, "유형"));
      const grade = sheetGradeToUi(lastGrade);
      const textbook = sheetTextbookToUi(lastTextbook);
      const unit = sheetUnitToUi(lastUnit);
      if (!/^중[123]$/.test(grade) || !textbook || !/^\d+단원$/.test(unit)) {
        return;
      }
      const item = {
        id: slug(["word", grade, textbook, unit, String(i + 1)]),
        textbook,
        grade,
        unit,
        category: lastCategory,
        isBasicWord: cell(r, idx, "기초단어 여부").toLowerCase() === "o",
        english,
        korean,
        // 예문은 자체 창작만 싣는다. 열 이름이 양식마다 다르다 — **단어 시트 안에서는**
        // 「문장」도 그 단어의 예문을 가리킨다(문장 시트의 「문장」과 이름만 같다).
        //
        // 「교과서 예문」/「한국어 뜻」은 **일부러 안 읽는다.** 이 두 열에는 실제로
        // 교과서 본문이 들어온다 — 문맥에 맞는 단어 뜻을 고를 때 참고하려고 채워 오는
        // 열이라 엑셀에는 남아도 되지만, 문제은행에 실으면 본문을 TTS 시트로 뺀 것이
        // (2026-09) 단어 예문으로 되살아난다.
        exampleEn: cell(r, idx, "예문") || cell(r, idx, "문장"),
        exampleKo: cell(r, idx, "예문 뜻") || cell(r, idx, "문장 뜻"),
      };
      const key = wordKey(item);
      if (seenWords.has(key)) {
        const existing = words.find(
          (w) => wordKey(w) === key && !w.exampleEn && item.exampleEn
        );
        if (existing) {
          existing.exampleEn = item.exampleEn;
          existing.exampleKo = item.exampleKo;
        }
        return;
      }
      seenWords.add(key);
      words.push(item);
    });
  }
}

/**
 * 비어 있는 청크를 채운다. 영어 청크는 같은 단원 어휘 중 여러 단어짜리 항목
 * (`be related to`, `On the other hand`)을 숙어로 넘겨 쪼개지지 않게 한다.
 */
function fillMissingChunks(sentenceList, wordList) {
  const idiomsByScope = new Map();
  for (const word of wordList) {
    const english = (word.english ?? "").trim();
    if (!/\s/.test(english)) continue;
    const key = `${word.grade}|${word.textbook}|${word.unit}`;
    if (!idiomsByScope.has(key)) idiomsByScope.set(key, []);
    idiomsByScope.get(key).push(english);
  }

  for (const sentence of sentenceList) {
    const idioms =
      idiomsByScope.get(
        `${sentence.grade}|${sentence.textbook}|${sentence.unit}`
      ) ?? [];
    if (!sentence.chunksEn) {
      sentence.chunksEn = formatChunkLine(
        splitEnglishChunksPhrase(sentence.english, idioms)
      );
    }
    if (!sentence.chunksKo) {
      sentence.chunksKo = formatChunkLine(
        splitKoreanChunksPhrase(sentence.korean)
      );
    }
  }
}

function mergeByScope(prev, next, alsoDrop) {
  const keys = new Set(
    next.map((item) => `${item.grade}|${item.textbook}|${item.unit}`)
  );
  // 새 항목이 0개인 단원도 「비운다」고 말할 수 있어야 한다 (TTS 시트로 옮긴 본문)
  for (const key of alsoDrop ?? []) keys.add(key);
  return [
    ...prev.filter(
      (item) => !keys.has(`${item.grade}|${item.textbook}|${item.unit}`)
    ),
    ...next,
  ];
}

let existing = { words: [], sentences: [], grammar: [] };
if (fs.existsSync(outPath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(outPath, "utf8"));
    if (Array.isArray(parsed.items)) {
      existing.words = parsed.items;
    } else {
      existing = {
        words: parsed.words ?? [],
        sentences: parsed.sentences ?? [],
        grammar: parsed.grammar ?? [],
      };
    }
  } catch {
    existing = { words: [], sentences: [], grammar: [] };
  }
}

fillMissingChunks(sentences, words);

const result = {
  words: mergeByScope(existing.words, words),
  sentences: mergeByScope(existing.sentences, sentences, ttsScopes),
  grammar: mergeByScope(existing.grammar, grammar),
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
console.log(
  `Wrote words=${result.words.length} sentences=${result.sentences.length} grammar=${result.grammar.length}` +
    (ttsOnly.length ? ` (+ 음성만 ${ttsOnly.length}문장 — 문제은행에는 안 실림)` : "")
);

/*
  **문제은행이 바뀌면 학생 앱의 미리 만든 음성도 같이 갱신한다.**

  학생 앱은 단어·문장 음성을 파일로 들고 있다(`public/assets/audio/`). 여기서 텍스트를
  바꿔 놓고 음성을 안 뽑으면, 그 항목만 예전처럼 Edge Function을 타서 첫 재생이 느려진다
  (틀린 소리가 나지는 않는다 — 파일 이름이 텍스트의 해시라 못 찾으면 폴백한다).

  잊기 쉬운 일이라 여기 붙여 둔다. 학생 리포가 없거나 네트워크가 없으면 **경고만 하고
  넘어간다** — 문제은행 자체는 이미 잘 쓰였으므로 임포트를 실패로 만들 이유가 없다.
*/
// 학생 리포 위치는 사람마다 다르다 — 형제 폴더일 수도, `projects/` 아래일 수도.
// 하나만 박아 두면 조용히 건너뛰어서 음성이 낡은 채로 남는다.
const TTS_SCRIPT_REL = "loopin-webapp/scripts/build-tts-audio.mjs";
const ttsScript =
  process.env.HAKSUP_STUDENT_TTS_SCRIPT ??
  [
    path.join(__dirname, "../..", TTS_SCRIPT_REL),
    path.join(__dirname, "../../projects", TTS_SCRIPT_REL),
  ].find((p) => fs.existsSync(p)) ??
  path.join(__dirname, "../..", TTS_SCRIPT_REL);
if (fs.existsSync(ttsScript)) {
  console.log("");
  console.log("학생 앱 음성 갱신 중…");
  // 「TTS」 시트는 임시 파일로만 넘긴다 — 두 리포 어디에도 본문 원문을 안 남기려는 것이다
  let extraFile = "";
  if (ttsOnly.length) {
    extraFile = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "tts-extra-")),
      "extra.json"
    );
    fs.writeFileSync(extraFile, JSON.stringify(ttsOnly), "utf8");
  }
  const r = spawnSync(
    process.execPath,
    [ttsScript, outPath, ...(extraFile ? [`--extra=${extraFile}`] : [])],
    { stdio: "inherit" }
  );
  if (extraFile) fs.rmSync(path.dirname(extraFile), { recursive: true, force: true });
  if (r.status !== 0) {
    console.warn(
      "음성 갱신이 끝나지 못했습니다. 학생 리포에서 `npm run tts:build`를 직접 돌려 주세요."
    );
  }
} else {
  console.log("");
  console.log(
    "(학생 앱을 찾지 못해 음성 갱신은 건너뜁니다 — 학생 리포에서 `npm run tts:build`)"
  );
}
