"use client";

import { useMemo, useState, type ClipboardEvent } from "react";
import {
  formatChunkLine,
  splitEnglishChunksPhrase,
  splitKoreanChunksPhrase,
} from "@/lib/ai/phrase-chunks";
import { applyCustomSentenceRows } from "@/lib/custom-problem-bank";
import { getUnitIdioms, type ProblemSentence } from "@/lib/problem-bank";
import { useUnitBank } from "@/lib/use-unit-bank";
import { isMultiCellGrid, parseSheetClipboard } from "@/lib/sheet-clipboard";
import { validateProblemItemInput } from "@/lib/validate-problem-item";

const TAIL_EMPTY = 1;
const SCROLL_BUFFER = 8;

type SheetRow = {
  key: string;
  source?: ProblemSentence;
  english: string;
  korean: string;
  chunksEn: string;
  chunksKo: string;
  hint: string;
};

type Scope = {
  grade: string;
  textbook: string;
  unit: string;
};

type SentenceAddSheetProps = {
  scope: Scope;
  existingSentences: ProblemSentence[];
  onClose: () => void;
  onApplied: (createdIds: string[]) => void;
};

const COLUMNS = [
  { key: "english", label: "영어" },
  { key: "korean", label: "한글 뜻" },
  { key: "chunksEn", label: "영어 청크" },
  { key: "chunksKo", label: "한글 청크" },
  { key: "hint", label: "영작 힌트" },
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];

const cellClass =
  "min-h-[42px] w-full min-w-0 resize-none border-0 bg-transparent px-2 py-1.5 text-[13px] font-medium leading-snug text-[#15171A] outline-none focus:bg-[#EAF6FE]";

function rowFromSentence(item: ProblemSentence): SheetRow {
  return {
    key: item.id,
    source: item,
    english: item.english,
    korean: item.korean,
    chunksEn: item.chunksEn ?? "",
    chunksKo: item.chunksKo ?? "",
    hint: item.hint ?? "",
  };
}

function emptyRow(index: number): SheetRow {
  return {
    key: `new-${index}-${Math.random().toString(36).slice(2, 7)}`,
    english: "",
    korean: "",
    chunksEn: "",
    chunksKo: "",
    hint: "",
  };
}

function isBlankRow(row: SheetRow): boolean {
  return (
    !row.english.trim() &&
    !row.korean.trim() &&
    !row.chunksEn.trim() &&
    !row.chunksKo.trim() &&
    !row.hint.trim()
  );
}

function rowUnchanged(row: SheetRow): boolean {
  if (!row.source) return false;
  return (
    row.english.trim() === row.source.english.trim() &&
    row.korean.trim() === row.source.korean.trim() &&
    row.chunksEn.trim() === (row.source.chunksEn ?? "").trim() &&
    row.chunksKo.trim() === (row.source.chunksKo ?? "").trim() &&
    row.hint.trim() === (row.source.hint ?? "").trim()
  );
}

function trailingBlankCount(rows: SheetRow[]): number {
  let count = 0;
  for (let i = rows.length - 1; i >= 0 && isBlankRow(rows[i]!); i -= 1) {
    count += 1;
  }
  return count;
}

function ensureTrailingEmpty(rows: SheetRow[], min = TAIL_EMPTY): SheetRow[] {
  const trailing = trailingBlankCount(rows);
  if (trailing >= min) return rows;
  const add = min - trailing;
  return [
    ...rows,
    ...Array.from({ length: add }, (_, index) => emptyRow(rows.length + index)),
  ];
}

function applyPasteGrid(
  rows: SheetRow[],
  startRow: number,
  startCol: number,
  grid: string[][],
): SheetRow[] {
  const needed = startRow + grid.length;
  const next = rows.slice();
  while (next.length < needed) {
    next.push(emptyRow(next.length));
  }

  for (let r = 0; r < grid.length; r += 1) {
    const current = next[startRow + r];
    if (!current) continue;
    const patched: SheetRow = { ...current };
    const line = grid[r] ?? [];
    for (let c = 0; c < line.length; c += 1) {
      const col = startCol + c;
      if (col < COLUMNS.length) {
        patched[COLUMNS[col]!.key] = line[c] ?? "";
      }
    }
    next[startRow + r] = patched;
  }

  return ensureTrailingEmpty(next);
}

function splitEnglish(english: string, idioms: string[]): string {
  return formatChunkLine(splitEnglishChunksPhrase(english.trim(), idioms));
}

function splitKorean(korean: string): string {
  return formatChunkLine(splitKoreanChunksPhrase(korean.trim()));
}

export function SentenceAddSheet({
  scope,
  existingSentences,
  onClose,
  onApplied,
}: SentenceAddSheetProps) {
  const [rows, setRows] = useState<SheetRow[]>(() =>
    ensureTrailingEmpty(existingSentences.map(rowFromSentence)),
  );
  const [error, setError] = useState("");
  /* 이 단원 교과서 조각이 와야 숙어 목록이 채워진다 */
  const bankReady = useUnitBank(scope);
  const idioms = useMemo(() => getUnitIdioms(scope), [scope, bankReady]);

  const filledCount = useMemo(
    () => rows.filter((row) => !isBlankRow(row)).length,
    [rows],
  );

  function patchRow(key: string, field: ColKey, value: string) {
    setRows((prev) =>
      ensureTrailingEmpty(
        prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
      ),
    );
    if (error) setError("");
  }

  function growFromScroll(container: HTMLElement) {
    if (container.scrollHeight - container.scrollTop - container.clientHeight > 40) {
      return;
    }
    setRows((prev) => {
      const trailing = trailingBlankCount(prev);
      if (trailing >= SCROLL_BUFFER) return prev;
      return [
        ...prev,
        ...Array.from({ length: SCROLL_BUFFER - trailing }, (_, index) =>
          emptyRow(prev.length + index),
        ),
      ];
    });
  }

  function handlePaste(
    rowIndex: number,
    colIndex: number,
    event: ClipboardEvent<HTMLTextAreaElement>,
  ) {
    const text = event.clipboardData.getData("text/plain");
    const grid = parseSheetClipboard(text);
    if (!isMultiCellGrid(grid)) return;
    event.preventDefault();
    setRows((prev) => applyPasteGrid(prev, rowIndex, colIndex, grid));
    if (error) setError("");
  }

  function autoSplit(target: "en" | "ko" | "both") {
    setRows((prev) => {
      const next = prev.map((row) => {
        const patched = { ...row };
        if ((target === "en" || target === "both") && row.english.trim()) {
          patched.chunksEn = splitEnglish(row.english, idioms);
        }
        if ((target === "ko" || target === "both") && row.korean.trim()) {
          patched.chunksKo = splitKorean(row.korean);
        }
        return patched;
      });
      const changed = next.some((row, index) => {
        const before = prev[index];
        return (
          row.chunksEn !== before?.chunksEn || row.chunksKo !== before?.chunksKo
        );
      });
      if (!changed) {
        setError(
          target === "ko"
            ? "한글 뜻을 먼저 입력해 주세요."
            : target === "en"
              ? "영어를 먼저 입력해 주세요."
              : "영어나 한글 뜻을 먼저 입력해 주세요.",
        );
        return prev;
      }
      if (error) setError("");
      return ensureTrailingEmpty(next);
    });
  }

  function apply() {
    const pending = rows.filter((row) => !isBlankRow(row) && !rowUnchanged(row));
    if (pending.length === 0) {
      onClose();
      return;
    }

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row || isBlankRow(row) || rowUnchanged(row)) continue;
      const reason = validateProblemItemInput({
        kind: "sentence",
        english: row.english,
        korean: row.korean,
        chunksEn: row.chunksEn,
        chunksKo: row.chunksKo,
      });
      if (reason) {
        setError(`${i + 1}번째 줄 · ${reason}`);
        return;
      }
    }

    const { createdIds } = applyCustomSentenceRows(
      pending.map((row) => ({
        source: row.source,
        input: {
          ...scope,
          english: row.english,
          korean: row.korean,
          chunksEn: row.chunksEn,
          chunksKo: row.chunksKo,
          hint: row.hint,
        },
      })),
    );
    onApplied(createdIds);
    onClose();
  }

  return (
    <>
      <div
        className="min-h-0 flex-1 overflow-auto px-4 py-3"
        onScroll={(event) => growFromScroll(event.currentTarget)}
      >
        <div className="overflow-hidden rounded-[12px] border border-[#D1D5DB]">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-[#F3F4F6]">
                <th className="w-10 border-b border-r border-[#E5E7EB] px-2 py-2 text-center text-[11px] font-bold text-[#6B7280]">
                  #
                </th>
                {COLUMNS.map((col, index) => (
                  <th
                    key={col.key}
                    className={`border-b border-[#E5E7EB] px-2 py-2 text-[12px] font-bold tracking-[0.02em] text-[#374151] ${
                      index < COLUMNS.length - 1 ? "border-r" : ""
                    }`}
                  >
                    {col.key === "chunksEn" || col.key === "chunksKo" ? (
                      <div className="flex items-center justify-between gap-2">
                        <span>{col.label}</span>
                        <button
                          type="button"
                          onClick={() =>
                            autoSplit(col.key === "chunksEn" ? "en" : "ko")
                          }
                          className="shrink-0 rounded-[7px] border border-[#BAE6FD] bg-[#F0F9FF] px-2 py-0.5 text-[11px] font-semibold text-[#1274A9] hover:border-[#1AA7F2] hover:bg-[#E0F2FE]"
                        >
                          자동 나눔
                        </button>
                      </div>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.key} className="odd:bg-white even:bg-[#FAFBFC]">
                  <td className="border-t border-r border-[#E5E7EB] px-2 text-center text-[11px] font-semibold tabular-nums text-[#9CA3AF]">
                    {rowIndex + 1}
                  </td>
                  {COLUMNS.map((col, index) => (
                    <td
                      key={col.key}
                      className={`border-t border-[#E5E7EB] align-top ${
                        index < COLUMNS.length - 1 ? "border-r" : ""
                      }`}
                    >
                      <textarea
                        value={row[col.key]}
                        rows={2}
                        onChange={(event) =>
                          patchRow(row.key, col.key, event.target.value)
                        }
                        onPaste={(event) => handlePaste(rowIndex, index, event)}
                        className={cellClass}
                        aria-label={`${rowIndex + 1}번째 ${col.label}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error ? (
          <div
            role="alert"
            className="mt-3 rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-3 py-2.5"
          >
            <p className="text-[12px] font-bold text-[#B91C1C]">
              형식이 올바르지 않아 적용할 수 없어요
            </p>
            <p className="mt-1 text-[12px] font-medium leading-snug text-[#C52B2B]">
              {error}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#F0F1F3] px-5 py-3.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="text-[12px] font-medium text-[#9CA3AF]">
            {filledCount}문장 · 청크가 비어 있으면 적용할 때 같은 규칙으로 나눠요
          </p>
          <button
            type="button"
            onClick={() => autoSplit("both")}
            className="h-8 rounded-[8px] border border-[#BAE6FD] bg-[#F0F9FF] px-2.5 text-[12px] font-semibold text-[#1274A9] hover:border-[#1AA7F2] hover:bg-[#E0F2FE]"
          >
            청크 자동 나누기
          </button>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-[10px] border border-[#E5E7EB] bg-white px-4 text-[13px] font-semibold text-[#4B5563] hover:bg-[#F9FAFB]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={apply}
            className="h-10 rounded-[10px] bg-[#1AA7F2] px-4 text-[13px] font-bold text-white hover:bg-[#1596DA]"
          >
            적용
          </button>
        </div>
      </div>
    </>
  );
}
