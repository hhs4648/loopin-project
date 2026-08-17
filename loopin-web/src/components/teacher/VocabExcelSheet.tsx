"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type UIEvent,
} from "react";

import {
  createEmptyVocabEntry,
  padVocabSheet,
  VOCAB_GRID_COLUMNS,
  VOCAB_SHEET_CHUNK,
  type VocabEntry,
} from "@/lib/vocab-workbook";

const ROW_H = 36;
const OVERSCAN = 10;
const COLS = VOCAB_GRID_COLUMNS;

type CellPos = { r: number; c: number };
type Selection = { anchor: CellPos; focus: CellPos };
type Norm = { r0: number; r1: number; c0: number; c1: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normRange(sel: Selection): Norm {
  return {
    r0: Math.min(sel.anchor.r, sel.focus.r),
    r1: Math.max(sel.anchor.r, sel.focus.r),
    c0: Math.min(sel.anchor.c, sel.focus.c),
    c1: Math.max(sel.anchor.c, sel.focus.c),
  };
}

function inNorm(r: number, c: number, n: Norm) {
  return r >= n.r0 && r <= n.r1 && c >= n.c0 && c <= n.c1;
}

function inRange(r: number, c: number, sel: Selection) {
  return inNorm(r, c, normRange(sel));
}

function getCell(entries: VocabEntry[], r: number, c: number): string {
  const row = entries[r];
  if (!row) return "";
  return row[COLS[c]!.key] ?? "";
}

function ensureRows(entries: VocabEntry[], minLen: number): VocabEntry[] {
  return padVocabSheet(
    entries.map((e) => ({ ...e })),
    Math.max(entries.length, minLen),
  );
}

function setCellValue(
  entries: VocabEntry[],
  r: number,
  c: number,
  value: string,
): VocabEntry[] {
  const next = ensureRows(entries, r + 1 + VOCAB_SHEET_CHUNK);
  while (next.length <= r) next.push(createEmptyVocabEntry());
  const row = { ...next[r]! };
  row[COLS[c]!.key] = value;
  next[r] = row;
  return next;
}

function clearRange(entries: VocabEntry[], sel: Selection): VocabEntry[] {
  const box = normRange(sel);
  const next = entries.map((e) => ({ ...e }));
  for (let r = box.r0; r <= box.r1; r += 1) {
    if (!next[r]) continue;
    const row = { ...next[r]! };
    for (let c = box.c0; c <= box.c1; c += 1) {
      row[COLS[c]!.key] = "";
    }
    next[r] = row;
  }
  return next;
}

function fillByHandle(
  entries: VocabEntry[],
  source: Selection,
  tip: CellPos,
): { entries: VocabEntry[]; selection: Selection } {
  const src = normRange(source);
  const r0 = Math.min(src.r0, tip.r);
  const r1 = Math.max(src.r1, tip.r);
  const c0 = Math.min(src.c0, tip.c);
  const c1 = Math.max(src.c1, tip.c);
  const srcH = src.r1 - src.r0 + 1;
  const srcW = src.c1 - src.c0 + 1;

  const next = ensureRows(entries, r1 + 1 + VOCAB_SHEET_CHUNK);
  while (next.length <= r1) next.push(createEmptyVocabEntry());

  for (let r = r0; r <= r1; r += 1) {
    const row = { ...next[r]! };
    for (let c = c0; c <= c1; c += 1) {
      if (inNorm(r, c, src)) continue;
      const sr = src.r0 + ((r - src.r0) % srcH + srcH) % srcH;
      const sc = src.c0 + ((c - src.c0) % srcW + srcW) % srcW;
      row[COLS[c]!.key] = getCell(entries, sr, sc);
    }
    next[r] = row;
  }

  return {
    entries: next,
    selection: { anchor: { r: r0, c: c0 }, focus: { r: r1, c: c1 } },
  };
}

function rangeToTsv(entries: VocabEntry[], sel: Selection): string {
  const { r0, r1, c0, c1 } = normRange(sel);
  const lines: string[] = [];
  for (let r = r0; r <= r1; r += 1) {
    const cells: string[] = [];
    for (let c = c0; c <= c1; c += 1) {
      const raw = getCell(entries, r, c);
      const needsQuote =
        raw.includes("\t") || raw.includes("\n") || raw.includes('"');
      cells.push(needsQuote ? `"${raw.replace(/"/g, '""')}"` : raw);
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

function parseTsv(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.map((line) => {
    if (!line.includes("\t") && !line.includes('"')) return [line];
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else inQuotes = !inQuotes;
        continue;
      }
      if (ch === "\t" && !inQuotes) {
        cells.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    cells.push(cur);
    return cells;
  });
}

function applyTsv(
  entries: VocabEntry[],
  startR: number,
  startC: number,
  grid: string[][],
): VocabEntry[] {
  let next = ensureRows(entries, startR + grid.length + VOCAB_SHEET_CHUNK);
  for (let i = 0; i < grid.length; i += 1) {
    const r = startR + i;
    while (next.length <= r) next = [...next, createEmptyVocabEntry()];
    const row = { ...next[r]! };
    const line = grid[i]!;
    for (let j = 0; j < line.length; j += 1) {
      const c = startC + j;
      if (c >= COLS.length) break;
      row[COLS[c]!.key] = line[j] ?? "";
    }
    next[r] = row;
  }
  return next;
}

type Props = {
  entries: VocabEntry[];
  onEntriesChange: (next: VocabEntry[]) => void;
  onExpandSheet: () => void;
};

/**
 * 엑셀 기본 조작 (수식 제외)
 * 클릭 후 바로 입력 · 채우기 핸들 · 복사/붙여넣기 등
 */
export function VocabExcelSheet({
  entries,
  onEntriesChange,
  onExpandSheet,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeInputRef = useRef<HTMLInputElement>(null);
  const expandLockRef = useRef(false);
  const dragModeRef = useRef<"none" | "select" | "fill">("none");
  const fillSourceRef = useRef<Selection | null>(null);
  const skipBlurRef = useRef(false);
  const editingRef = useRef(false);
  const editValueRef = useRef("");
  const undoRef = useRef<VocabEntry[][]>([]);
  const redoRef = useRef<VocabEntry[][]>([]);
  const selRef = useRef<Selection>({
    anchor: { r: 0, c: 0 },
    focus: { r: 0, c: 0 },
  });
  const entriesRef = useRef(entries);

  const [range, setRange] = useState({ start: 0, end: 40 });
  const [sel, setSel] = useState<Selection>({
    anchor: { r: 0, c: 0 },
    focus: { r: 0, c: 0 },
  });
  const [fillPreview, setFillPreview] = useState<Norm | null>(null);
  /** false = 선택 모드(화살표 이동), true = 편집 모드(캐럿 이동) */
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [editOrigin, setEditOrigin] = useState("");

  const rowCount = entries.length;
  const active = sel.focus;
  const box = normRange(sel);
  const previewOrSel = fillPreview ?? box;

  useEffect(() => {
    selRef.current = sel;
  }, [sel]);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);
  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);
  useEffect(() => {
    editValueRef.current = editValue;
  }, [editValue]);

  const focusActive = useCallback(() => {
    window.requestAnimationFrame(() => {
      const input = activeInputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      if (!editingRef.current) {
        input.select();
      }
    });
  }, []);

  const pushUndo = useCallback((snapshot: VocabEntry[]) => {
    undoRef.current = [
      ...undoRef.current.slice(-29),
      snapshot.map((e) => ({ ...e })),
    ];
    redoRef.current = [];
  }, []);

  const commitEntries = useCallback(
    (next: VocabEntry[], recordUndo = true) => {
      if (recordUndo) pushUndo(entriesRef.current);
      onEntriesChange(next);
    },
    [onEntriesChange, pushUndo],
  );

  const updateVirtual = (el: HTMLDivElement) => {
    const start = Math.max(0, Math.floor(el.scrollTop / ROW_H) - OVERSCAN);
    const visibleCount = Math.ceil(el.clientHeight / ROW_H);
    const end = Math.min(rowCount, start + visibleCount + OVERSCAN * 2);
    setRange((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end },
    );
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateVirtual(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowCount]);

  useEffect(() => {
    focusActive();
  }, [sel.focus.r, sel.focus.c, focusActive]);

  const scrollCellIntoView = (r: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const top = r * ROW_H;
    const bottom = top + ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight - ROW_H) {
      el.scrollTop = bottom - el.clientHeight + ROW_H;
    }
  };

  const moveTo = (r: number, c: number, extend: boolean) => {
    const nr = clamp(r, 0, Math.max(0, rowCount - 1));
    const nc = clamp(c, 0, COLS.length - 1);
    setSel((prev) => ({
      anchor: extend ? prev.anchor : { r: nr, c: nc },
      focus: { r: nr, c: nc },
    }));
    setEditing(false);
    scrollCellIntoView(nr);
  };

  const commitActiveIfEditing = () => {
    if (!editingRef.current) return;
    const { r, c } = selRef.current.focus;
    const next = setCellValue(
      entriesRef.current,
      r,
      c,
      editValueRef.current,
    );
    commitEntries(next);
    setEditing(false);
  };

  const startInCellEdit = () => {
    const { r, c } = selRef.current.focus;
    const v = getCell(entriesRef.current, r, c);
    setEditOrigin(v);
    setEditValue(v);
    setEditing(true);
    window.requestAnimationFrame(() => {
      activeInputRef.current?.setSelectionRange(v.length, v.length);
    });
  };

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    updateVirtual(el);
    if (
      !expandLockRef.current &&
      el.scrollTop + el.clientHeight >= el.scrollHeight - ROW_H * 12
    ) {
      expandLockRef.current = true;
      onExpandSheet();
      window.setTimeout(() => {
        expandLockRef.current = false;
      }, 120);
    }
  };

  const copySelection = async () => {
    try {
      await navigator.clipboard.writeText(
        rangeToTsv(entriesRef.current, selRef.current),
      );
    } catch {
      /* ignore */
    }
  };

  const tipFromPoint = (clientX: number, clientY: number): CellPos | null => {
    const els = document.elementsFromPoint(clientX, clientY);
    let r: number | null = null;
    let c: number | null = null;
    for (const el of els) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.dataset.row != null) r = Number(el.dataset.row);
      if (el.dataset.col != null) c = Number(el.dataset.col);
      if (r != null && c != null) break;
    }
    if (r == null || c == null || Number.isNaN(r) || Number.isNaN(c)) {
      return null;
    }
    return {
      r: clamp(r, 0, Math.max(0, rowCount - 1)),
      c: clamp(c, 0, COLS.length - 1),
    };
  };

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (dragModeRef.current === "none") return;
      const tip = tipFromPoint(event.clientX, event.clientY);
      if (!tip) return;
      if (dragModeRef.current === "select") {
        setSel((prev) => ({ ...prev, focus: tip }));
        scrollCellIntoView(tip.r);
        return;
      }
      if (dragModeRef.current === "fill" && fillSourceRef.current) {
        const src = normRange(fillSourceRef.current);
        setFillPreview({
          r0: Math.min(src.r0, tip.r),
          r1: Math.max(src.r1, tip.r),
          c0: Math.min(src.c0, tip.c),
          c1: Math.max(src.c1, tip.c),
        });
        if (tip.r >= rowCount - 3) onExpandSheet();
        scrollCellIntoView(tip.r);
      }
    };

    const onUp = (event: MouseEvent) => {
      if (dragModeRef.current === "fill" && fillSourceRef.current) {
        const tip = tipFromPoint(event.clientX, event.clientY);
        if (tip) {
          const result = fillByHandle(
            entriesRef.current,
            fillSourceRef.current,
            tip,
          );
          commitEntries(result.entries);
          setSel(result.selection);
          setEditing(false);
        }
      }
      dragModeRef.current = "none";
      fillSourceRef.current = null;
      setFillPreview(null);
      focusActive();
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowCount, commitEntries, onExpandSheet, focusActive]);

  const displayValue = (r: number, c: number) => {
    if (editing && active.r === r && active.c === c) return editValue;
    return getCell(entries, r, c);
  };

  const onActiveKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const meta = event.ctrlKey || event.metaKey;
    const { key } = event;

    if (meta && key.toLowerCase() === "z" && !event.shiftKey) {
      event.preventDefault();
      const prev = undoRef.current.pop();
      if (!prev) return;
      redoRef.current.push(entriesRef.current.map((e) => ({ ...e })));
      onEntriesChange(prev);
      setEditing(false);
      return;
    }
    if (
      meta &&
      (key.toLowerCase() === "y" ||
        (key.toLowerCase() === "z" && event.shiftKey))
    ) {
      event.preventDefault();
      const next = redoRef.current.pop();
      if (!next) return;
      undoRef.current.push(entriesRef.current.map((e) => ({ ...e })));
      onEntriesChange(next);
      setEditing(false);
      return;
    }
    if (meta && key.toLowerCase() === "c") {
      event.preventDefault();
      void copySelection();
      return;
    }
    if (meta && key.toLowerCase() === "x") {
      event.preventDefault();
      void copySelection();
      commitEntries(clearRange(entriesRef.current, selRef.current));
      setEditing(false);
      setEditValue("");
      return;
    }
    if (meta && key.toLowerCase() === "a") {
      event.preventDefault();
      setSel({
        anchor: { r: 0, c: 0 },
        focus: { r: Math.max(0, rowCount - 1), c: COLS.length - 1 },
      });
      setEditing(false);
      return;
    }

    // 선택 모드: 화살표로 셀 이동
    if (!editing) {
      if (key === "ArrowUp") {
        event.preventDefault();
        moveTo(active.r - 1, active.c, event.shiftKey);
        return;
      }
      if (key === "ArrowDown") {
        event.preventDefault();
        moveTo(active.r + 1, active.c, event.shiftKey);
        return;
      }
      if (key === "ArrowLeft") {
        event.preventDefault();
        moveTo(active.r, active.c - 1, event.shiftKey);
        return;
      }
      if (key === "ArrowRight") {
        event.preventDefault();
        moveTo(active.r, active.c + 1, event.shiftKey);
        return;
      }
      if (key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) moveTo(active.r - 1, active.c, false);
        else startInCellEdit();
        return;
      }
      if (key === "F2") {
        event.preventDefault();
        startInCellEdit();
        return;
      }
      if (key === "Tab") {
        event.preventDefault();
        moveTo(active.r, active.c + (event.shiftKey ? -1 : 1), false);
        return;
      }
      if (key === "Delete") {
        event.preventDefault();
        commitEntries(clearRange(entriesRef.current, selRef.current));
        setEditValue("");
        return;
      }
      if (key === "Backspace") {
        event.preventDefault();
        setEditOrigin(getCell(entriesRef.current, active.r, active.c));
        setEditValue("");
        setEditing(true);
        return;
      }
      if (key === "Home") {
        event.preventDefault();
        moveTo(active.r, 0, event.shiftKey);
        return;
      }
      if (key === "End") {
        event.preventDefault();
        moveTo(active.r, COLS.length - 1, event.shiftKey);
        return;
      }
      // 바로 타이핑 → 덮어쓰기 (영문/숫자)
      if (!meta && !event.altKey && key.length === 1) {
        event.preventDefault();
        setEditOrigin(getCell(entriesRef.current, active.r, active.c));
        setEditValue(key);
        setEditing(true);
        return;
      }
      // 한글 등 IME — composition이 이어지도록 편집 모드만 켜기
      if (!meta && key === "Process") {
        setEditOrigin(getCell(entriesRef.current, active.r, active.c));
        setEditValue("");
        setEditing(true);
      }
      return;
    }

    // 편집 모드
    if (key === "Escape") {
      event.preventDefault();
      setEditValue(editOrigin);
      setEditing(false);
      return;
    }
    if (key === "Enter") {
      event.preventDefault();
      skipBlurRef.current = true;
      commitEntries(
        setCellValue(entriesRef.current, active.r, active.c, editValue),
      );
      setEditing(false);
      moveTo(active.r + (event.shiftKey ? -1 : 1), active.c, false);
      return;
    }
    if (key === "Tab") {
      event.preventDefault();
      skipBlurRef.current = true;
      commitEntries(
        setCellValue(entriesRef.current, active.r, active.c, editValue),
      );
      setEditing(false);
      moveTo(active.r, active.c + (event.shiftKey ? -1 : 1), false);
    }
  };

  const onActiveChange = (value: string) => {
    if (!editing) {
      setEditOrigin(getCell(entriesRef.current, active.r, active.c));
      setEditing(true);
    }
    setEditValue(value);
  };

  const onActiveCompositionStart = () => {
    if (editingRef.current) return;
    setEditOrigin(getCell(entriesRef.current, active.r, active.c));
    setEditValue("");
    setEditing(true);
  };

  const onActivePaste = (event: ReactClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (!text) return;
    if (text.includes("\t") || text.includes("\n")) {
      event.preventDefault();
      const grid = parseTsv(text);
      const { r, c } = selRef.current.focus;
      commitEntries(applyTsv(entriesRef.current, r, c, grid));
      setEditing(false);
      const maxCols = grid.reduce((m, line) => Math.max(m, line.length), 0);
      setSel({
        anchor: { r, c },
        focus: {
          r: r + grid.length - 1,
          c: clamp(c + Math.max(maxCols, 1) - 1, 0, COLS.length - 1),
        },
      });
    }
  };

  const onCellMouseDown = (r: number, c: number, event: ReactMouseEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    commitActiveIfEditing();
    dragModeRef.current = "select";
    setFillPreview(null);
    setEditing(false);
    if (event.shiftKey) {
      setSel((prev) => ({ ...prev, focus: { r, c } }));
    } else {
      setSel({ anchor: { r, c }, focus: { r, c } });
    }
  };

  const onFillHandleMouseDown = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    commitActiveIfEditing();
    dragModeRef.current = "fill";
    fillSourceRef.current = { ...selRef.current };
    setFillPreview(normRange(selRef.current));
  };

  const topPad = range.start * ROW_H;
  const bottomPad = Math.max(0, (rowCount - range.end) * ROW_H);
  const handleR = previewOrSel.r1;
  const handleC = previewOrSel.c1;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto"
        onScroll={onScroll}
      >
        <table className="w-full min-w-[860px] table-fixed border-collapse select-none">
          <colgroup>
            <col className="w-10" />
            {COLS.map((col) => (
              <col key={col.key} style={{ width: `${col.width}px` }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-[1]">
            <tr className="bg-[#F3F4F6]">
              <th className="w-10 border-b border-r border-[#E5E7EB] px-1 py-2.5 text-center text-[11px] font-bold text-[#9CA3AF]">
                #
              </th>
              {COLS.map((col) => (
                <th
                  key={col.key}
                  className="border-b border-r border-[#E5E7EB] px-2 py-2.5 text-left text-[11px] font-bold tracking-[0.04em] text-[#6B7280]"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topPad > 0 ? (
              <tr aria-hidden>
                <td
                  colSpan={COLS.length + 1}
                  style={{ height: topPad, padding: 0, border: "none" }}
                />
              </tr>
            ) : null}
            {entries.slice(range.start, range.end).map((row, i) => {
              const r = range.start + i;
              return (
                <tr key={row.id} style={{ height: ROW_H }}>
                  <td className="border-b border-r border-[#F0F1F3] bg-[#FAFBFC] px-1 text-center text-[11px] font-semibold text-[#C3C7CD]">
                    {r + 1}
                  </td>
                  {COLS.map((col, c) => {
                    const selected = inNorm(r, c, previewOrSel);
                    const inSource =
                      fillPreview != null && inRange(r, c, sel);
                    const isActive = active.r === r && active.c === c;
                    const showHandle =
                      !editing && r === handleR && c === handleC;

                    return (
                      <td
                        key={col.key}
                        data-row={r}
                        data-col={c}
                        className="relative border-b border-r border-[#F0F1F3] p-0"
                        onMouseDown={(e) => onCellMouseDown(r, c, e)}
                        onDoubleClick={() => {
                          setSel({ anchor: { r, c }, focus: { r, c } });
                          startInCellEdit();
                        }}
                      >
                        {isActive ? (
                          <input
                            ref={activeInputRef}
                            value={displayValue(r, c)}
                            onChange={(e) => onActiveChange(e.target.value)}
                            onCompositionStart={onActiveCompositionStart}
                            onKeyDown={onActiveKeyDown}
                            onPaste={onActivePaste}
                            onBlur={() => {
                              if (skipBlurRef.current) {
                                skipBlurRef.current = false;
                                return;
                              }
                              if (
                                editingRef.current &&
                                editValueRef.current !== editOrigin
                              ) {
                                commitEntries(
                                  setCellValue(
                                    entriesRef.current,
                                    r,
                                    c,
                                    editValueRef.current,
                                  ),
                                );
                              }
                              setEditing(false);
                            }}
                            className={`h-9 w-full px-2 text-[13px] font-medium text-[#15171A] outline outline-2 outline-[#1AA7F2] ${
                              selected ? "bg-[#DFF2FC]" : "bg-white"
                            }`}
                          />
                        ) : (
                          <div
                            className={`flex h-9 items-center overflow-hidden px-2 text-[13px] font-medium text-[#15171A] ${
                              selected
                                ? fillPreview && !inSource
                                  ? "bg-[#B8E0F5]"
                                  : "bg-[#DFF2FC]"
                                : "bg-white"
                            }`}
                          >
                            <span className="truncate">
                              {getCell(entries, r, c)}
                            </span>
                          </div>
                        )}
                        {showHandle ? (
                          <button
                            type="button"
                            aria-label="채우기 핸들"
                            title="끌어다 채우기"
                            onMouseDown={onFillHandleMouseDown}
                            className="absolute -bottom-[4px] -right-[4px] z-[3] h-[9px] w-[9px] cursor-crosshair border-2 border-white bg-[#1AA7F2] p-0 shadow-sm"
                          />
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {bottomPad > 0 ? (
              <tr aria-hidden>
                <td
                  colSpan={COLS.length + 1}
                  style={{ height: bottomPad, padding: 0, border: "none" }}
                />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="shrink-0 border-t border-[#F0F1F3] px-3 py-1.5 text-[11px] font-medium text-[#9CA3AF]">
        클릭 후 바로 입력 · 선택 후 우하단 ■ 끌어서 채우기 · Ctrl+C/V ·
        Delete · Ctrl+Z
      </div>
    </div>
  );
}
