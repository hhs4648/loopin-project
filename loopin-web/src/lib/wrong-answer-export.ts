import { buildHwpxBlob, type HwpxDocumentPage } from "@/lib/hwpx-writer";
import {
  groupWorksheetItems,
  worksheetAnswerBlocks,
  worksheetQuestionBlocks,
  type WrongAnswerWorksheet,
} from "@/lib/wrong-answer-worksheet";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** `____` 연속 밑줄을 끊기지 않는 실선 스팬으로 바꿉니다. */
function formatPromptLineHtml(line: string): string {
  return line
    .split(/(_{2,})/)
    .map((part) => {
      if (/^_{2,}$/.test(part)) {
        const em = Math.min(28, Math.max(3, Math.round(part.length * 0.55)));
        return `<span class="ws-blank" style="width:${em}em"></span>`;
      }
      return escapeHtml(part);
    })
    .join("");
}

function renderWorksheetHeader(sheet: WrongAnswerWorksheet): string {
  return `
    <div class="ws-header">
      <div class="ws-meta">
        <span>${escapeHtml(sheet.generatedAtLabel)}</span>
        <span>${escapeHtml(sheet.className)}</span>
        <span>${escapeHtml(sheet.teacherName)} 선생님</span>
        <span class="ws-name">이름: ${escapeHtml(sheet.studentName)}</span>
      </div>
      <div class="ws-sub">
        교과서: ${escapeHtml(sheet.textbookLine)}
        ${sheet.lessonDateLabel ? ` · 수업일: ${escapeHtml(sheet.lessonDateLabel)}` : ""}
      </div>
      <div class="ws-title">${escapeHtml(sheet.assignmentTitle)} · 오답 시험지</div>
    </div>
  `;
}

function renderWorksheetQuestionsHtml(sheet: WrongAnswerWorksheet): string {
  const header = renderWorksheetHeader(sheet);

  if (sheet.items.length === 0) {
    return `${header}<p class="ws-empty">오답이 없습니다. 잘했어요!</p>`;
  }

  let n = 1;
  const sections = groupWorksheetItems(sheet.items)
    .map((group) => {
      const questions = group.items
        .map((item) => {
          const body = item.promptLines
            .map((line, i) =>
              i === 0
                ? `<p class="ws-q"><span class="ws-num">${n}.</span> ${formatPromptLineHtml(line)}</p>`
                : `<p class="ws-q-sub">${formatPromptLineHtml(line)}</p>`,
            )
            .join("");
          n += 1;
          return `<div class="ws-item">${body}</div>`;
        })
        .join("");
      return `
        <section class="ws-section">
          <h2>${escapeHtml(group.category)} 테스트</h2>
          <p class="ws-inst">* ${escapeHtml(group.instruction)}</p>
          ${questions}
        </section>
      `;
    })
    .join("");

  return `${header}${sections}`;
}

function renderWorksheetAnswersHtml(sheet: WrongAnswerWorksheet): string | null {
  if (sheet.items.length === 0) return null;

  let a = 1;
  const answers = sheet.items
    .map((item) => {
      const line = `<p class="ws-ans">${a}. ${escapeHtml(item.answerKey)}</p>`;
      a += 1;
      return line;
    })
    .join("");

  return `
    <div class="ws-header">
      <div class="ws-meta">
        <span>${escapeHtml(sheet.className)}</span>
        <span class="ws-name">이름: ${escapeHtml(sheet.studentName)}</span>
      </div>
      <div class="ws-title">${escapeHtml(sheet.assignmentTitle)} · 정답</div>
    </div>
    <section class="ws-answers">
      <h2>정답</h2>
      ${answers}
    </section>
  `;
}

const WORKSHEET_CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Malgun Gothic", "Apple SD Gothic Neo", Pretendard, sans-serif;
    color: #111;
    font-size: 13px;
    line-height: 1.55;
  }
  .ws-page {
    width: 210mm;
    min-height: 297mm;
    padding: 18mm 16mm 20mm;
    margin: 0 auto;
    background: #fff;
  }
  .ws-page + .ws-page {
    page-break-before: always;
    border-top: 1px dashed #d1d5db;
    margin-top: 24px;
    padding-top: 24px;
  }
  .ws-header { margin-bottom: 14px; }
  .ws-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 18px;
    font-size: 12px;
    font-weight: 700;
  }
  .ws-name { margin-left: auto; }
  .ws-sub { margin-top: 6px; font-size: 12px; color: #4b5563; }
  .ws-title {
    margin-top: 10px;
    padding-bottom: 8px;
    border-bottom: 2px solid #111;
    font-size: 16px;
    font-weight: 800;
  }
  .ws-section { margin-top: 18px; }
  .ws-section h2 {
    margin: 0 0 4px;
    font-size: 14px;
    font-weight: 800;
  }
  .ws-inst { margin: 0 0 10px; font-size: 12px; color: #374151; }
  .ws-item { margin-bottom: 12px; }
  .ws-q, .ws-q-sub, .ws-ans { margin: 0 0 2px; white-space: pre-wrap; }
  .ws-q-sub { padding-left: 1.4em; color: #1f2937; }
  .ws-num { font-weight: 700; margin-right: 4px; }
  .ws-blank {
    display: inline-block;
    height: 1.05em;
    border-bottom: 1.25px solid #111;
    vertical-align: baseline;
    margin: 0 0.12em;
  }
  .ws-answers h2 { margin: 0 0 8px; font-size: 14px; font-weight: 800; }
  .ws-empty {
    margin-top: 40px;
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    color: #374151;
  }
  @media print {
    body { background: #fff; }
    .ws-page + .ws-page { border-top: none; margin-top: 0; padding-top: 18mm; }
    .no-print { display: none !important; }
  }
`;

export function buildWorksheetsDocumentHtml(
  sheets: WrongAnswerWorksheet[],
  opts?: { forPrint?: boolean },
): string {
  const pages = sheets
    .flatMap((sheet) => {
      const questionPage = `<article class="ws-page">${renderWorksheetQuestionsHtml(sheet)}</article>`;
      const answersHtml = renderWorksheetAnswersHtml(sheet);
      if (!answersHtml) return [questionPage];
      return [
        questionPage,
        `<article class="ws-page">${answersHtml}</article>`,
      ];
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>오답 시험지</title>
  <style>${WORKSHEET_CSS}</style>
</head>
<body${opts?.forPrint ? ' onload="window.print()"' : ""}>
  ${pages}
</body>
</html>`;
}

export function openWorksheetsPrintWindow(
  sheets: WrongAnswerWorksheet[],
): void {
  const html = buildWorksheetsDocumentHtml(sheets, { forPrint: true });
  // Edge는 window.open 옵션에 noopener를 넣으면 새 창은 열면서도
  // WindowProxy를 null로 반환해 about:blank에 내용을 쓸 수 없다.
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) {
    throw new Error("팝업이 차단되었어요. 브라우저에서 팝업을 허용해 주세요.");
  }
  try {
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.opener = null;
    win.focus();
  } catch (error) {
    win.close();
    throw error;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildWorksheetHwpxPages(
  sheets: WrongAnswerWorksheet[],
): HwpxDocumentPage[] {
  return sheets.flatMap((sheet) => {
    const pages: HwpxDocumentPage[] = [
      { paragraphs: worksheetQuestionBlocks(sheet) },
    ];
    const answers = worksheetAnswerBlocks(sheet);
    if (answers) pages.push({ paragraphs: answers });
    return pages;
  });
}

export async function downloadWorksheetsAsHwpx(
  sheets: WrongAnswerWorksheet[],
  filename: string,
): Promise<void> {
  const blob = await buildHwpxBlob(
    buildWorksheetHwpxPages(sheets),
    sheets.length === 1
      ? `${sheets[0]!.studentName} 오답 시험지`
      : "오답 시험지",
  );
  downloadBlob(blob, filename.endsWith(".hwpx") ? filename : `${filename}.hwpx`);
}

export function suggestExportFilename(
  sheets: WrongAnswerWorksheet[],
  ext: "pdf" | "hwpx",
): string {
  if (sheets.length === 1) {
    return `오답시험지_${sheets[0]!.studentName}.${ext}`;
  }
  return `오답시험지_일괄_${sheets.length}명.${ext}`;
}
