/**
 * HWPX 생성 검증용 스크립트.
 * `npx tsx scripts/check-hwpx.mts` — out/check.hwpx 와 out/xml/*.xml 을 만든다.
 */
import fs from "node:fs";
import path from "node:path";

import {
  buildHwpxEntries,
  createHwpxZip,
  type HwpxDocumentPage,
} from "../src/lib/hwpx-writer";

const pages: HwpxDocumentPage[] = [
  {
    paragraphs: [
      { style: "meta", text: "2026.07.25   중2 A반   김선생 선생님   이름: 김민지" },
      { style: "meta", text: "교과서: 중2 · NE능률(김) · 3단원   수업일: 7월 24일" },
      { style: "title", text: "3단원 단어 과제 · 오답 시험지" },
      { style: "heading", text: "단어 테스트" },
      { style: "instruction", text: "* 다음 단어의 뜻을 쓰세요." },
      { style: "body", text: "1. [3지선다] achieve" },
      { style: "body", text: "    1) 이루다" },
      { style: "spacer", text: "" },
      { style: "heading", text: "정답" },
      { style: "body", text: "1. [단어 · 3지선다] 이루다 <&\"'> 특수문자" },
    ],
  },
  {
    paragraphs: [
      { style: "meta", text: "2026.07.25   중2 A반   김선생 선생님   이름: 박준호" },
      { style: "title", text: "3단원 단어 과제 · 오답 시험지" },
      { style: "body", text: "오답이 없습니다. 잘했어요!" },
    ],
  },
];

const entries = buildHwpxEntries(pages, "오답 시험지");
const outDir = path.join(process.cwd(), "out");
const xmlDir = path.join(outDir, "xml");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(xmlDir, { recursive: true });

for (const entry of entries) {
  const flat = entry.path.replace(/[\\/]/g, "__");
  fs.writeFileSync(path.join(xmlDir, flat), entry.content, "utf8");
}

const zip = createHwpxZip(entries);
const buffer = await zip.generateAsync({ type: "nodebuffer" });
fs.writeFileSync(path.join(outDir, "check.hwpx"), buffer);

console.log("entries:", entries.map((e) => e.path).join(", "));
console.log("bytes:", buffer.length);
