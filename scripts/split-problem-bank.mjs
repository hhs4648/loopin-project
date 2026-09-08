/**
 * `problem-bank.json`을 **교과서 단위 조각**으로 쪼갠다.
 *
 * 왜: 단어가 9,590개가 되면서 문제은행 JSON이 2.9MB가 됐다. 이 파일을 교사 웹의
 * 클라이언트 컴포넌트가 그대로 import하면 **문제 출제 화면을 열 때마다 2.9MB를 통째로**
 * 받는다. 선생님 한 분이 쓰는 건 자기 교과서 한 종뿐이다.
 *
 * 그래서 `(학년·교과서)` 단위로 잘라 `public/problem-bank/bNN.json`에 두고, 앱은 고른
 * 교과서 조각만 받아 쓴다(조각 하나 50~150KB). 번들에 남는 건 목록·개수·숙어뿐인
 * `src/data/problem-bank-index.json` 하나다.
 *
 *   node scripts/split-problem-bank.mjs [problem-bank.json 경로]
 *
 * `import-problem-bank.mjs`가 끝나면서 자동으로 부르므로 보통 직접 돌릴 일은 없다.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(__dirname, "../loopin-web");
const bankPath = process.argv[2] ?? path.join(WEB, "src/data/problem-bank.json");
const chunkDir = path.join(WEB, "public/problem-bank");
const indexPath = path.join(WEB, "src/data/problem-bank-index.json");

if (!fs.existsSync(bankPath)) {
  console.error(`문제은행이 없습니다: ${bankPath}`);
  process.exit(1);
}

const bank = JSON.parse(fs.readFileSync(bankPath, "utf8"));
const words = bank.words ?? bank.items ?? [];
const sentences = bank.sentences ?? [];
const grammar = bank.grammar ?? [];

/** 조각 키 = 학년|교과서. 단원까지 쪼개면 조각이 144개라 오히려 요청이 잦아진다. */
const chunkKey = (item) => `${item.grade}|${item.textbook}`;
const scopeKey = (item) => `${item.grade}|${item.textbook}|${item.unit}`;

const buckets = new Map();
const bucketOf = (key) => {
  let b = buckets.get(key);
  if (!b) {
    b = { words: [], sentences: [], grammar: [] };
    buckets.set(key, b);
  }
  return b;
};
for (const w of words) bucketOf(chunkKey(w)).words.push(w);
for (const s of sentences) bucketOf(chunkKey(s)).sentences.push(s);
for (const g of grammar) bucketOf(chunkKey(g)).grammar.push(g);

/* 조각 이름은 학년·교과서 이름(한글·괄호)을 URL에 담지 않으려고 번호로 쓴다.
   키를 정렬해서 번호를 매기므로 같은 데이터면 항상 같은 번호가 나온다. */
const keys = [...buckets.keys()].sort();
const chunks = {};
keys.forEach((key, i) => {
  chunks[key] = `b${String(i + 1).padStart(2, "0")}`;
});

/* 예전 조각이 남아 있으면 지운다 — 교과서가 빠졌는데 파일만 남는 일을 막는다. */
fs.rmSync(chunkDir, { recursive: true, force: true });
fs.mkdirSync(chunkDir, { recursive: true });

let bytes = 0;
for (const key of keys) {
  const file = path.join(chunkDir, `${chunks[key]}.json`);
  const json = JSON.stringify(buckets.get(key));
  fs.writeFileSync(file, json, "utf8");
  bytes += json.length;
}

/* 단원별 개수 — 「학습 제공 단어장」 목록이 조각을 안 받고도 그릴 수 있어야 한다. */
const scopeMap = new Map();
const countInto = (item, field) => {
  const key = scopeKey(item);
  let s = scopeMap.get(key);
  if (!s) {
    s = {
      grade: item.grade,
      textbook: item.textbook,
      unit: item.unit,
      words: 0,
      sentences: 0,
      grammar: 0,
    };
    scopeMap.set(key, s);
  }
  s[field] += 1;
};
for (const w of words) countInto(w, "words");
for (const s of sentences) countInto(s, "sentences");
for (const g of grammar) countInto(g, "grammar");

/* 숙어(여러 단어짜리 항목)는 단원과 무관하게 전부 필요하다(본문 붙여넣기 분석).
   9,590개 중 902개뿐이라 이건 번들에 그대로 둔다. */
const idioms = [
  ...new Set(
    words
      .map((w) => String(w.english ?? "").trim())
      .filter((english) => /\s/.test(english)),
  ),
].sort();

const index = {
  chunks,
  scopes: [...scopeMap.values()].sort(
    (a, b) =>
      a.grade.localeCompare(b.grade, "ko") ||
      a.textbook.localeCompare(b.textbook, "ko") ||
      a.unit.localeCompare(b.unit, "ko", { numeric: true }),
  ),
  idioms,
};
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");

const indexBytes = fs.statSync(indexPath).size;
console.log(
  `조각 ${keys.length}개 (${(bytes / 1024).toFixed(0)}KB, 평균 ${(bytes / keys.length / 1024).toFixed(0)}KB)` +
    ` · 인덱스 ${(indexBytes / 1024).toFixed(0)}KB (단원 ${index.scopes.length} · 숙어 ${idioms.length})`,
);
