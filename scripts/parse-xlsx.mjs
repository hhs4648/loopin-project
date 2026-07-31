import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

const xlsxPath = process.argv[2];
if (!xlsxPath) {
  console.error("Usage: node parse-xlsx.mjs <path>");
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xlsx-"));
const dest = tmp.replace(/\\/g, "/");
execSync(
  `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${xlsxPath.replace(/'/g, "''")}' -DestinationPath '${dest}' -Force"`,
  { stdio: "pipe" }
);

const sharedPath = path.join(tmp, "xl", "sharedStrings.xml");
const sheetPath = path.join(tmp, "xl", "worksheets", "sheet1.xml");

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

const shared = parseShared(fs.readFileSync(sharedPath, "utf8"));
const rows = parseSheet(fs.readFileSync(sheetPath, "utf8"), shared);
console.log("ROWS", rows.length);
rows.forEach((r, i) => console.log(i, JSON.stringify(r)));
