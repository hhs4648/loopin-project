/**
 * out/xml 의 header.xml · section0.xml 정합성 검사.
 * itemCnt 선언값과 실제 개수, section에서 참조하는 id 존재 여부를 확인한다.
 * 사용: node scripts/verify-hwpx.mjs [xmlDir]
 */
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? path.join(process.cwd(), "out", "xml");
const header = fs.readFileSync(path.join(dir, "Contents__header.xml"), "utf8");
const section = fs.readFileSync(path.join(dir, "Contents__section0.xml"), "utf8");

const ids = (re, src) => new Set([...src.matchAll(re)].map((m) => m[1]));

const charIds = ids(/<hh:charPr id="(\d+)"/g, header);
const paraIds = ids(/<hh:paraPr id="(\d+)"/g, header);
const styleIds = ids(/<hh:style id="(\d+)"/g, header);
const borderIds = ids(/<hh:borderFill id="(\d+)"/g, header);

const declared = {};
for (const [, name, count] of header.matchAll(
  /<hh:(fontfaces|borderFills|charProperties|tabProperties|numberings|paraProperties|styles) itemCnt="(\d+)"/g,
)) {
  declared[name] = Number(count);
}

const actual = {
  fontfaces: (header.match(/<hh:fontface /g) ?? []).length,
  borderFills: borderIds.size,
  charProperties: charIds.size,
  tabProperties: (header.match(/<hh:tabPr /g) ?? []).length,
  numberings: (header.match(/<hh:numbering /g) ?? []).length,
  paraProperties: paraIds.size,
  styles: styleIds.size,
};

const mismatch = Object.keys(declared).filter(
  (key) => declared[key] !== actual[key],
);

const dangling = [];
const check = (re, pool, label) => {
  for (const value of ids(re, section)) {
    if (!pool.has(value)) dangling.push(`${label} ${value}`);
  }
};
check(/charPrIDRef="(\d+)"/g, charIds, "charPr");
check(/paraPrIDRef="(\d+)"/g, paraIds, "paraPr");
check(/styleIDRef="(\d+)"/g, styleIds, "style");
check(/borderFillIDRef="(\d+)"/g, borderIds, "borderFill");

const hasSecPr = section.includes("<hp:secPr");
const paraCount = (section.match(/<hp:p /g) ?? []).length;

console.log("declared:", declared);
console.log("actual  :", actual);
console.log("itemCnt mismatch:", mismatch.length ? mismatch : "none");
console.log("dangling refs   :", dangling.length ? dangling : "none");
console.log("secPr present   :", hasSecPr);
console.log("paragraphs      :", paraCount);

if (mismatch.length || dangling.length || !hasSecPr) {
  process.exitCode = 1;
}
