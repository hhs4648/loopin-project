/**
 * scripts/idiom-source.xlsx → loopin-web/src/lib/ai/idiom-meanings.data.ts
 *
 * 숙어 사전의 **유일한 소스는 엑셀**이다. 엑셀을 고치고 이 스크립트를 돌리면
 * 코드가 갱신된다. 생성 대상 파일은 직접 고치지 말 것 — 다음 실행에서 덮인다.
 *
 * 조회 로직(`lookupIdiomMeaning` 등)은 `idiom-meanings.ts`에 손으로 두고,
 * 여기서는 데이터만 만든다. 그래야 생성이 로직을 덮어쓸 일이 없다.
 *
 *   node scripts/import-idioms.mjs [엑셀경로] [출력경로]
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const xlsxPath = process.argv[2] ?? path.join(__dirname, "idiom-source.xlsx");
const outPath =
  process.argv[3] ??
  path.join(__dirname, "../loopin-web/src/lib/ai/idiom-meanings.data.ts");

if (!fs.existsSync(xlsxPath)) {
  console.error(`엑셀을 찾을 수 없습니다: ${xlsxPath}`);
  process.exit(1);
}

/* ---------- xlsx 읽기 (import-problem-bank.mjs 와 같은 방식) ---------- */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "idioms-"));
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
    // 빈 셀은 self-closing 이라 `</c>` 를 강제하면 뒤 셀을 삼켜 열이 밀린다
    const cRe = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cRe.exec(rm[1]))) {
      const col = colToIndex(cm[1]);
      const attrs = cm[3];
      const inner = cm[4] ?? "";
      let val = "";
      // 엑셀은 문자열을 sharedStrings 참조(t="s")로 쓰지만, 라이브러리로 만든
      // 파일은 셀에 그대로 박아 넣기도 한다(t="inlineStr") — 둘 다 받는다
      const inline = inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/);
      if (inline) {
        val = inline[1];
      } else {
        const v = inner.match(/<v>([\s\S]*?)<\/v>/);
        if (v) {
          val = v[1];
          if (/t="s"/.test(attrs)) val = shared[Number(val)] ?? val;
        }
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

const decode = (s) =>
  String(s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

// 인라인 문자열만 쓰는 파일에는 sharedStrings.xml 이 아예 없다
const sharedPath = path.join(dest, "xl/sharedStrings.xml");
const shared = fs.existsSync(sharedPath)
  ? parseShared(fs.readFileSync(sharedPath, "utf8"))
  : [];
const sheetFiles = fs
  .readdirSync(path.join(dest, "xl/worksheets"))
  .filter((f) => f.endsWith(".xml"))
  .sort();
const rows = parseSheet(
  fs.readFileSync(path.join(dest, "xl/worksheets", sheetFiles[0]), "utf8"),
  shared
);

const [header, ...dataRows] = rows;
const idx = Object.fromEntries(header.map((h, i) => [decode(h), i]));
const cell = (row, key) => decode(row[idx[key]] ?? "");

/* ---------- 분류 ---------- */

/**
 * 빈칸 표시(`...`, `A`/`B`, `-ing`)가 있으면 문장에 그 형태로 나타나지 않아
 * 표면형 조회로는 절대 찾을 수 없다 → 구문 패턴으로 따로 담는다.
 */
function isPattern(expression) {
  return (
    expression.includes("...") ||
    expression.includes("-ing") ||
    /\b[AB]\b/.test(expression)
  );
}

const CATEGORY_ORDER = ["동사+전치사", "구동사", "숙어", "표현", "구문"];

const meanings = new Map();
const patterns = new Map();
const seen = new Set();
let skipped = 0;

for (const row of dataRows) {
  const expression = cell(row, "숙어/표현");
  const meaning = cell(row, "뜻");
  if (!expression || !meaning) {
    if (expression || meaning) skipped += 1;
    continue;
  }
  const category = cell(row, "분류") || "숙어";
  if (isPattern(expression)) {
    patterns.set(expression, meaning);
    continue;
  }
  const key = expression.toLowerCase();
  if (seen.has(key)) {
    console.warn(`  중복 표제어 무시: ${expression}`);
    continue;
  }
  seen.add(key);
  if (!meanings.has(category)) meanings.set(category, []);
  meanings.get(category).push([key, meaning]);
}

/* ---------- 파일 쓰기 ---------- */

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const lines = [
  "// 이 파일은 `scripts/import-idioms.mjs`가 만듭니다 — 직접 고치지 마세요.",
  "// 숙어를 추가·수정하려면 `scripts/idiom-source.xlsx`를 고치고 다시 실행하세요.",
  "//",
  "//   node scripts/import-idioms.mjs",
  "",
  "/** 표제어는 기본형. 굴절형·소유격은 `idiomLookupKeys`가 되돌린다. */",
  "export const IDIOM_MEANINGS: Record<string, string> = {",
];

const categories = [
  ...CATEGORY_ORDER.filter((c) => meanings.has(c)),
  ...[...meanings.keys()].filter((c) => !CATEGORY_ORDER.includes(c)),
];
let total = 0;
for (const category of categories) {
  const entries = meanings.get(category).sort((a, b) => a[0].localeCompare(b[0]));
  lines.push(`  // ── ${category} ──`);
  for (const [key, meaning] of entries) {
    lines.push(`  "${esc(key)}": "${esc(meaning)}",`);
    total += 1;
  }
  lines.push("");
}
lines.push("};", "");
lines.push("/**");
lines.push(" * `too ... to` 처럼 빈칸이 있는 구문 패턴.");
lines.push(" * 표면형이 그대로 나타나지 않아 `lookupIdiomMeaning`으로는 찾을 수 없다 —");
lines.push(" * 구문 학습 기능을 붙일 때 쓰려고 원본 그대로 남겨 둔다.");
lines.push(" */");
lines.push("export const IDIOM_PATTERNS: Record<string, string> = {");
for (const [expression, meaning] of patterns) {
  lines.push(`  "${esc(expression)}": "${esc(meaning)}",`);
}
lines.push("};", "");

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, lines.join("\n"), "utf8");
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`Wrote idioms=${total} patterns=${patterns.size} → ${path.relative(process.cwd(), outPath)}`);
if (skipped) console.warn(`  표현/뜻 중 하나가 비어 건너뛴 행: ${skipped}개`);
