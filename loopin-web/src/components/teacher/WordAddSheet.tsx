"use client";

import { useMemo, useState, type ClipboardEvent } from "react";
import { applyCustomWordRows } from "@/lib/custom-problem-bank";
import type { ProblemWord } from "@/lib/problem-bank";
import { isMultiCellGrid, parseSheetClipboard } from "@/lib/sheet-clipboard";
import { validateProblemItemInput } from "@/lib/validate-problem-item";
import { ensureWordCloze } from "@/lib/word-cloze";

const TAIL_EMPTY = 1;
const SCROLL_BUFFER = 8;

type SheetRow = {
  key: string;
  source?: ProblemWord;
  english: string;
  korean: string;
  exampleEn: string;
  exampleKo: string;
  isBasicWord: boolean;
};

type Scope = {
  grade: string;
  textbook: string;
  unit: string;
};

type WordAddSheetProps = {
  scope: Scope;
  existingWords: ProblemWord[];
  onClose: () => void;
  onApplied: (createdIds: string[]) => void;
};

const COLUMNS = [
  { key: "english", label: "단어" },
  { key: "korean", label: "단어 뜻" },
  { key: "exampleEn", label: "예문" },
  { key: "exampleKo", label: "예문 뜻" },
] as const;

type ColKey = (typeof COLUMNS)[number]["key"];

const cellClass =
  "h-9 w-full min-w-0 border-0 bg-transparent px-2 text-[13px] font-medium text-[#15171A] outline-none focus:bg-[#EAF6FE]";

function rowFromWord(word: ProblemWord): SheetRow {
  return {
    key: word.id,
    source: word,
    english: word.english,
    korean: word.korean,
    exampleEn:
      ensureWordCloze(word.exampleEn, word.english) ?? word.exampleEn ?? "",
    exampleKo: word.exampleKo ?? "",
    isBasicWord: word.isBasicWord === true,
  };
}

function emptyRow(index: number): SheetRow {
  return {
    key: `new-${index}-${Math.random().toString(36).slice(2, 7)}`,
    english: "",
    korean: "",
    exampleEn: "",
    exampleKo: "",
    isBasicWord: false,
  };
}

function isBlankRow(row: SheetRow): boolean {
  return (
    !row.english.trim() &&
    !row.korean.trim() &&
    !row.exampleEn.trim() &&
    !row.exampleKo.trim()
  );
}

function rowUnchanged(row: SheetRow): boolean {
  if (!row.source) return false;
  return (
    row.english.trim() === row.source.english.trim() &&
    row.korean.trim() === row.source.korean.trim() &&
    row.exampleEn.trim() === (row.source.exampleEn ?? "").trim() &&
    row.exampleKo.trim() === (row.source.exampleKo ?? "").trim() &&
    row.isBasicWord === (row.source.isBasicWord === true)
  );
}

function parseBasicFlag(raw: string): boolean | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (
    value === "o" ||
    value === "1" ||
    value === "y" ||
    value === "yes" ||
    value === "true" ||
    value === "기초" ||
    value === "기초단어" ||
    value === "v" ||
    value === "✓" ||
    value === "ㅇ"
  ) {
    return true;
  }
  if (
    value === "x" ||
    value === "0" ||
    value === "n" ||
    value === "no" ||
    value === "false" ||
    value === "-" ||
    value === "일반"
  ) {
    return false;
  }
  return null;
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
        continue;
      }
      if (col === COLUMNS.length) {
        const flag = parseBasicFlag(line[c] ?? "");
        if (flag !== null) patched.isBasicWord = flag;
      }
    }
    next[startRow + r] = patched;
  }

  return ensureTrailingEmpty(next);
}

export function WordAddSheet({
  scope,
  existingWords,
  onClose,
  onApplied,
}: WordAddSheetProps) {
  const [rows, setRows] = useState<SheetRow[]>(() =>
    ensureTrailingEmpty(existingWords.map(rowFromWord)),
  );
  const [error, setError] = useState("");

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

  function patchBasic(key: string, isBasicWord: boolean) {
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, isBasicWord } : row)),
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
    event: ClipboardEvent<HTMLInputElement>,
  ) {
    const text = event.clipboardData.getData("text/plain");
    const grid = parseSheetClipboard(text);
    if (!isMultiCellGrid(grid)) return;
    event.preventDefault();
    setRows((prev) => applyPasteGrid(prev, rowIndex, colIndex, grid));
    if (error) setError("");
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
        kind: "word",
        english: row.english,
        korean: row.korean,
        exampleEn: row.exampleEn,
        exampleKo: row.exampleKo,
      });
      if (reason) {
        setError(`${i + 1}번째 줄 · ${reason}`);
        return;
      }
    }

    const { createdIds } = applyCustomWordRows(
      pending.map((row) => ({
        source: row.source,
        input: {
          ...scope,
          english: row.english,
          korean: row.korean,
          exampleEn:
            ensureWordCloze(row.exampleEn, row.english) ?? row.exampleEn,
          exampleKo: row.exampleKo,
          isBasicWord: row.isBasicWord,
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
                <th className="w-12 border-b border-r border-[#E5E7EB] px-1 py-2 text-center text-[11px] font-bold text-[#374151]">
                  기초
                </th>
                {COLUMNS.map((col, index) => (
                  <th
                    key={col.key}
                    className={`border-b border-[#E5E7EB] px-2 py-2 text-[12px] font-bold tracking-[0.02em] text-[#374151] ${
                      index < COLUMNS.length - 1 ? "border-r" : ""
                    }`}
                  >
                    {col.label}
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
                  <td className="border-t border-r border-[#E5E7EB] text-center">
                    <input
                      type="checkbox"
                      checked={row.isBasicWord}
                      onChange={(event) =>
                        patchBasic(row.key, event.target.checked)
                      }
                      aria-label={`${rowIndex + 1}번째 기초단어`}
                      className="h-4 w-4 accent-[#1AA7F2]"
                    />
                  </td>
                  {COLUMNS.map((col, index) => (
                    <td
                      key={col.key}
                      className={`border-t border-[#E5E7EB] ${
                        index < COLUMNS.length - 1 ? "border-r" : ""
                      }`}
                    >
                      <input
                        value={row[col.key]}
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
        <p className="text-[12px] font-medium text-[#9CA3AF]">
          {filledCount}개 단어 · 기초에 체크하면 기초단어로 저장돼요
        </p>
        <div className="flex gap-2">
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
