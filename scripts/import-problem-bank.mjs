import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

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

function parseShared(xml) {
  const shared = [];
  const siRe = /<si[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
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
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const map = {};
    let max = -1;
    const cRe = /<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
    let cm;
    while ((cm = cRe.exec(rm[1]))) {
      const col = colToIndex(cm[1]);
      const attrs = cm[3];
      const inner = cm[4];
      let val = "";
      const v = inner.match(/<v>([\s\S]*?)<\/v>/);
      if (v) {
        val = v[1];
        if (/t="s"/.test(attrs)) val = shared[Number(val)] ?? val;
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

function getSheetNames(workbookXml, relsXml) {
  const idToTarget = {};
  const relRe =
    /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/g;
  let rm;
  while ((rm = relRe.exec(relsXml))) {
    idToTarget[rm[1]] = rm[2].replace(/^.*\//, "");
  }
  const sheets = [];
  const sheetRe =
    /<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/?>/g;
  let m;
  while ((m = sheetRe.exec(workbookXml))) {
    sheets.push({
      name: decodeXml(m[1]),
      file: idToTarget[m[2]],
      hidden: /state="hidden"/.test(m[0]),
    });
  }
  return sheets;
}

function headerIndex(header) {
  return Object.fromEntries(header.map((h, i) => [decodeXml(h), i]));
}

function cell(row, idx, key) {
  const i = idx[key];
  if (i === undefined) return "";
  return decodeXml(row[i] ?? "");
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

  if (meta.name === "문장") {
    dataRows.forEach((r, i) => {
      const english = cell(r, idx, "영어 문장");
      if (!english) return;
      const grade = sheetGradeToUi(cell(r, idx, "학년"));
      const textbook = cell(r, idx, "교과서");
      const unit = sheetUnitToUi(cell(r, idx, "단원"));
      sentences.push({
        id: slug(["sent", grade, textbook, unit, String(i + 1)]),
        textbook,
        grade,
        unit,
        english,
        korean: cell(r, idx, "청크(한국어)"),
        chunksEn: cell(r, idx, "청크(영어)"),
        chunksKo: cell(r, idx, "청크(한국어)"),
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
      const textbook = cell(r, idx, "교과서");
      const unit = sheetUnitToUi(cell(r, idx, "단원"));
      grammar.push({
        id: slug(["gram", grade, textbook, unit, String(i + 1)]),
        textbook,
        grade,
        unit,
        no: cell(r, idx, "번호"),
        major: cell(r, idx, "대분류"),
        minor: cell(r, idx, "소분류"),
        representative: cell(r, idx, "대표여부"),
        english,
        ox: cell(r, idx, "O/X"),
        wrongPart: cell(r, idx, "틀린 부분"),
        korean: cell(r, idx, "한국어 뜻"),
        choices: cell(r, idx, "3지선다 선택지"),
        explanation: cell(r, idx, "해설"),
      });
    });
    continue;
  }

  if (meta.name.includes("단어")) {
    if (meta.hidden) continue; // 숨김 「단어」시트는 초안/깨진 행이 많아 스킵
    let lastTextbook = "";
    let lastGrade = "";
    let lastUnit = "";
    let lastCategory = "";
    dataRows.forEach((r, i) => {
      const english = cell(r, idx, "영어");
      if (!english) return;
      lastTextbook = fillDown(lastTextbook, cell(r, idx, "교과서"));
      lastGrade = fillDown(lastGrade, cell(r, idx, "학년"));
      lastUnit = fillDown(lastUnit, cell(r, idx, "단원"));
      lastCategory = fillDown(lastCategory, cell(r, idx, "유형"));
      const grade = sheetGradeToUi(lastGrade);
      const textbook = lastTextbook;
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
        korean: cell(r, idx, "한글"),
        exampleEn: cell(r, idx, "교과서 예문"),
        exampleKo: cell(r, idx, "한국어 뜻"),
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

function mergeByScope(prev, next) {
  const keys = new Set(
    next.map((item) => `${item.grade}|${item.textbook}|${item.unit}`)
  );
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

const result = {
  words: mergeByScope(existing.words, words),
  sentences: mergeByScope(existing.sentences, sentences),
  grammar: mergeByScope(existing.grammar, grammar),
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
console.log(
  `Wrote words=${result.words.length} sentences=${result.sentences.length} grammar=${result.grammar.length}`
);
