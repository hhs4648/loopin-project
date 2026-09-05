"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  VocabPracticeSession,
  type VocabPracticeMode,
} from "@/components/teacher/VocabPracticeSession";
import { VocabExcelSheet } from "@/components/teacher/VocabExcelSheet";
import { CLASS_LAYOUT } from "@/lib/class-layout";
import {
  buildVocabSetFromCatalog,
  listHaksupVocabSets,
  type HaksupVocabSetInfo,
} from "@/lib/haksup-vocab-catalog";
import {
  applyVocabPartsByDay,
  compactVocabEntries,
  createEmptyVocabEntries,
  createEmptyVocabSet,
  expandVocabSheet,
  formatVocabDate,
  listVocabUnits,
  loadVocabSets,
  normalizeWordsPerDay,
  padVocabSheet,
  removeVocabSets,
  upsertVocabSet,
  VOCAB_SHEET_CHUNK,
  VOCAB_SHEET_INITIAL,
  vocabSetWordCount,
  type VocabEntry,
  type VocabSet,
} from "@/lib/vocab-workbook";

const AREA_LEFT = CLASS_LAYOUT.sidebarWidth;
const AREA_RIGHT = 1557;
const AREA_HEIGHT = 973;

type View = "hub" | "editor";

/**
 * 단어장 — 보관함 홈 / 엑셀형 편집 · 연습
 */
export function VocabBuilderPanel() {
  const [view, setView] = useState<View>("hub");
  const [sets, setSets] = useState<VocabSet[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [archiveChecked, setArchiveChecked] = useState<Set<string>>(
    () => new Set(),
  );

  const [draft, setDraft] = useState<VocabSet | null>(null);
  const [unitFilter, setUnitFilter] = useState<string | "all">("all");
  const [practiceMode, setPracticeMode] = useState<VocabPracticeMode | null>(
    null,
  );
  const [saveFlash, setSaveFlash] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  useEffect(() => {
    const loaded = loadVocabSets();
    setSets(loaded);
    if (loaded[0]) setSelectedId(loaded[0].id);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const onChange = () => setSets(loadVocabSets());
    window.addEventListener("haksup-vocab-sets-changed", onChange);
    return () =>
      window.removeEventListener("haksup-vocab-sets-changed", onChange);
  }, [hydrated]);

  const entries = draft?.entries ?? [];
  const filledEntries = useMemo(() => compactVocabEntries(entries), [entries]);
  const units = useMemo(() => listVocabUnits(filledEntries), [filledEntries]);
  const practicePool = filledEntries.filter(
    (item) =>
      (unitFilter === "all" ||
        (item.unit.trim() || "단원 없음") === unitFilter) &&
      item.word.trim() &&
      item.meaning.trim(),
  );

  const openNewEditor = () => {
    const empty = createEmptyVocabSet("새 단어장");
    setDraft(empty);
    setSelectedId(empty.id);
    setUnitFilter("all");
    setView("editor");
  };

  /** 학습 제공 단어장 담기 — 복사본을 바로 편집기로 연다(저장은 교사가 확인 후) */
  const pickHaksupCatalogSet = (info: HaksupVocabSetInfo) => {
    const copied = buildVocabSetFromCatalog(info);
    setCatalogOpen(false);
    setDraft(copied);
    setSelectedId(copied.id);
    setUnitFilter("all");
    setView("editor");
  };

  const openEditorForSet = (set: VocabSet) => {
    const wordsPerDay = normalizeWordsPerDay(set.wordsPerDay);
    const cloned = applyVocabPartsByDay(
      set.entries.map((e) => ({ ...e })),
      wordsPerDay,
    );
    setDraft({
      ...set,
      wordsPerDay,
      entries: padVocabSheet(
        cloned,
        Math.max(VOCAB_SHEET_INITIAL, cloned.length + VOCAB_SHEET_CHUNK),
      ),
    });
    setSelectedId(set.id);
    setUnitFilter("all");
    setView("editor");
  };

  const goHome = () => {
    setView("hub");
    setDraft(null);
    setPracticeMode(null);
    setSaveFlash(false);
  };

  const saveDraft = () => {
    if (!draft) return;
    const compacted = {
      ...draft,
      entries: compactVocabEntries(draft.entries),
    };
    const next = upsertVocabSet(sets, compacted);
    setSets(next);
    setSelectedId(draft.id);
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            name: prev.name.trim() || "이름 없는 단어장",
            groupName: prev.groupName?.trim() || undefined,
            updatedAt: new Date().toISOString(),
            entries: padVocabSheet(
              compactVocabEntries(prev.entries),
              VOCAB_SHEET_INITIAL,
            ),
          }
        : prev,
    );
    setSaveFlash(true);
    window.setTimeout(() => setSaveFlash(false), 1600);
  };

  const deleteChecked = () => {
    if (archiveChecked.size === 0) return;
    if (
      !window.confirm(
        `선택한 단어장 ${archiveChecked.size}개를 삭제할까요?`,
      )
    ) {
      return;
    }
    const ids = [...archiveChecked];
    const next = removeVocabSets(sets, ids);
    setSets(next);
    setArchiveChecked(new Set());
    if (selectedId && ids.includes(selectedId)) {
      setSelectedId(next[0]?.id ?? null);
    }
  };

  const expandSheet = () => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, entries: expandVocabSheet(prev.entries) };
    });
  };

  const clearAll = () => {
    if (!window.confirm("이 단어장의 단어를 모두 지울까요?")) return;
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            entries: createEmptyVocabEntries(VOCAB_SHEET_INITIAL),
          }
        : prev,
    );
    setUnitFilter("all");
  };

  const setDraftEntries = (next: VocabEntry[]) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const wordsPerDay = normalizeWordsPerDay(prev.wordsPerDay);
      return {
        ...prev,
        entries: applyVocabPartsByDay(next, wordsPerDay),
      };
    });
  };

  const setWordsPerDay = (raw: number) => {
    const wordsPerDay = normalizeWordsPerDay(raw);
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        wordsPerDay,
        entries: applyVocabPartsByDay(prev.entries, wordsPerDay),
      };
    });
  };

  const toggleArchive = (id: string) => {
    setArchiveChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleArchiveAll = () => {
    if (archiveChecked.size === sets.length) {
      setArchiveChecked(new Set());
    } else {
      setArchiveChecked(new Set(sets.map((s) => s.id)));
    }
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[22]"
      aria-label="단어장"
    >
      <div
        className="pointer-events-none absolute"
        style={{
          left: AREA_LEFT,
          top: 0,
          width: AREA_RIGHT - AREA_LEFT,
          height: AREA_HEIGHT,
          background: "#F3F4F5",
        }}
        aria-hidden
      />

      <div
        className="pointer-events-auto absolute flex flex-col overflow-hidden"
        style={{
          left: CLASS_LAYOUT.contentLeft,
          top: 36,
          width: CLASS_LAYOUT.contentRight - CLASS_LAYOUT.contentLeft,
          height: AREA_HEIGHT - 52,
        }}
      >
        {view === "hub" ? (
          <HubView
            sets={sets}
            archiveChecked={archiveChecked}
            onNew={openNewEditor}
            onOpenHaksupCatalog={() => setCatalogOpen(true)}
            onToggleArchive={toggleArchive}
            onToggleArchiveAll={toggleArchiveAll}
            onDeleteChecked={deleteChecked}
            onOpenSet={openEditorForSet}
          />
        ) : draft ? (
          <EditorView
            draft={draft}
            units={units}
            filledCount={filledEntries.length}
            practicePoolCount={practicePool.length}
            unitFilter={unitFilter}
            saveFlash={saveFlash}
            onChangeName={(name) =>
              setDraft((prev) => (prev ? { ...prev, name } : prev))
            }
            onWordsPerDay={setWordsPerDay}
            onUnitFilter={setUnitFilter}
            onSave={saveDraft}
            onHome={goHome}
            onClearAll={clearAll}
            onEntriesChange={setDraftEntries}
            onExpandSheet={expandSheet}
            onPractice={(mode) => setPracticeMode(mode)}
          />
        ) : null}
      </div>

      <HaksupCatalogModal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onPick={pickHaksupCatalogSet}
      />

      {practiceMode && draft ? (
        <VocabPracticeSession
          entries={practicePool}
          mode={practiceMode}
          onClose={() => setPracticeMode(null)}
        />
      ) : null}
    </div>
  );
}

function HubView({
  sets,
  archiveChecked,
  onNew,
  onOpenHaksupCatalog,
  onToggleArchive,
  onToggleArchiveAll,
  onDeleteChecked,
  onOpenSet,
}: {
  sets: VocabSet[];
  archiveChecked: Set<string>;
  onNew: () => void;
  onOpenHaksupCatalog: () => void;
  onToggleArchive: (id: string) => void;
  onToggleArchiveAll: () => void;
  onDeleteChecked: () => void;
  onOpenSet: (set: VocabSet) => void;
}) {
  const checkedCount = archiveChecked.size;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold tracking-[-0.03em] text-[#15171A]">
            단어장
          </h1>
          <p className="mt-1.5 text-[13px] font-medium leading-[1.55] tracking-[-0.01em] text-[#8B8F96]">
            엑셀처럼 표를 채워 단어장을 만들고, 짝맞추기·뜻 고르기로 연습하세요.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenHaksupCatalog}
            className="h-10 rounded-[10px] border border-[#BAE6FD] bg-[#F0F9FF] px-4 text-[13px] font-bold text-[#1274A9] transition-colors hover:border-[#1AA7F2] hover:bg-[#E0F2FE]"
          >
            + 학습 단어장
          </button>
          <button
            type="button"
            onClick={onNew}
            className="h-10 rounded-[10px] bg-[#1AA7F2] px-4 text-[13px] font-bold text-white hover:bg-[#1596d9]"
          >
            + 새 단어장
          </button>
        </div>
      </div>

      <section className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-[#E8EAED] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {sets.length === 0 ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-6 text-center">
            <p className="text-[16px] font-bold tracking-[-0.02em] text-[#15171A]">
              아직 단어장이 없어요
            </p>
            <p className="mt-2 max-w-[360px] text-[13px] font-medium leading-[1.55] text-[#9CA3AF]">
              새 단어장을 만든 뒤 표에 단어를 입력하거나
              <br />
              엑셀에서 복사해 붙여넣으세요.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={onNew}
                className="h-10 rounded-[10px] bg-[#1AA7F2] px-4 text-[13px] font-bold text-white hover:bg-[#1596d9]"
              >
                새 단어장 만들기
              </button>
              <button
                type="button"
                onClick={onOpenHaksupCatalog}
                className="h-10 rounded-[10px] border border-[#BAE6FD] bg-[#F0F9FF] px-4 text-[13px] font-bold text-[#1274A9] transition-colors hover:border-[#1AA7F2] hover:bg-[#E0F2FE]"
              >
                학습 제공 단어장
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#F0F1F3] px-5 py-3.5">
              <p className="text-[13px] font-semibold text-[#6B7280]">
                {sets.length}개
                {checkedCount > 0 ? (
                  <span className="ml-2 font-medium text-[#1AA7F2]">
                    · {checkedCount}개 선택
                  </span>
                ) : null}
              </p>
              <button
                type="button"
                disabled={checkedCount === 0}
                onClick={onDeleteChecked}
                className="h-9 rounded-[8px] border border-[#E5E7EB] px-3 text-[12px] font-bold text-[#6B7280] hover:bg-[#FEF2F2] hover:text-[#DC2626] disabled:cursor-not-allowed disabled:opacity-40"
              >
                선택 삭제
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[640px] table-fixed border-collapse">
                <thead className="sticky top-0 bg-[#FAFBFC]">
                  <tr className="border-b border-[#F0F1F3]">
                    <th className="w-12 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={archiveChecked.size === sets.length}
                        onChange={onToggleArchiveAll}
                        aria-label="전체 선택"
                        className="h-4 w-4 accent-[#1AA7F2]"
                      />
                    </th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold tracking-[0.04em] text-[#9CA3AF]">
                      그룹
                    </th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold tracking-[0.04em] text-[#9CA3AF]">
                      단어장
                    </th>
                    <th className="w-[100px] px-3 py-2.5 text-left text-[11px] font-bold tracking-[0.04em] text-[#9CA3AF]">
                      단어 수
                    </th>
                    <th className="w-[120px] px-3 py-2.5 text-left text-[11px] font-bold tracking-[0.04em] text-[#9CA3AF]">
                      생성일
                    </th>
                    <th className="w-[88px] px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {sets.map((set) => (
                    <tr
                      key={set.id}
                      className="border-b border-[#F3F4F6] last:border-b-0 hover:bg-[#F9FAFB]"
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={archiveChecked.has(set.id)}
                          onChange={() => onToggleArchive(set.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`${set.name} 선택`}
                          className="h-4 w-4 accent-[#1AA7F2]"
                        />
                      </td>
                      <td className="px-3 py-3 text-[13px] font-medium text-[#6B7280]">
                        {set.groupName?.trim() || "—"}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onOpenSet(set)}
                          className="text-left text-[13px] font-bold text-[#15171A] hover:text-[#1AA7F2]"
                        >
                          {set.name}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-[13px] font-semibold text-[#4B5563]">
                        {vocabSetWordCount(set)}
                      </td>
                      <td className="px-3 py-3 text-[13px] font-medium text-[#8B8F96]">
                        {formatVocabDate(set.createdAt)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenSet(set)}
                          className="h-8 rounded-[8px] px-2.5 text-[12px] font-bold text-[#1AA7F2] hover:bg-[#F0F9FF]"
                        >
                          열기
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/** 하루에 외울 단어수 — 시트 열이 아니라 세트 메타(`wordsPerDay`). −/+ 스텝 + 직접 입력. */
function WordsPerDayField({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setText(String(value));
  }, [value]);

  const commitFromText = (raw: string) => {
    const n = normalizeWordsPerDay(raw === "" ? value : Number(raw));
    setText(String(n));
    if (n !== value) onCommit(n);
  };

  const stepBy = (delta: number) => {
    const next = normalizeWordsPerDay(value + delta);
    setText(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label="하루에 외울 단어수 줄이기"
        disabled={value <= 1}
        onClick={() => stepBy(-1)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-[#E5E7EB] bg-[#F9FAFB] text-[15px] font-bold text-[#374151] hover:bg-[#F3F4F6] disabled:cursor-not-allowed disabled:opacity-40"
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label="하루에 외울 단어수"
        value={text}
        onFocus={(e) => {
          focusedRef.current = true;
          e.currentTarget.select();
        }}
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d]/g, "");
          setText(next);
          if (next === "") return;
          const n = Number(next);
          if (!Number.isFinite(n) || n < 1) return;
          const clamped = normalizeWordsPerDay(n);
          if (clamped !== value) onCommit(clamped);
        }}
        onBlur={() => {
          focusedRef.current = false;
          commitFromText(text);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            stepBy(1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            stepBy(-1);
          }
        }}
        className="h-7 w-[48px] rounded-[6px] border border-[#E5E7EB] bg-white px-1 text-center text-[15px] font-bold text-[#15171A] outline-none focus:border-[#1AA7F2]"
      />
      <button
        type="button"
        aria-label="하루에 외울 단어수 늘리기"
        disabled={value >= 500}
        onClick={() => stepBy(1)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-[#E5E7EB] bg-[#F9FAFB] text-[15px] font-bold text-[#374151] hover:bg-[#F3F4F6] disabled:cursor-not-allowed disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

function EditorView({
  draft,
  units,
  filledCount,
  practicePoolCount,
  unitFilter,
  saveFlash,
  onChangeName,
  onWordsPerDay,
  onUnitFilter,
  onSave,
  onHome,
  onClearAll,
  onEntriesChange,
  onExpandSheet,
  onPractice,
}: {
  draft: VocabSet;
  units: string[];
  filledCount: number;
  practicePoolCount: number;
  unitFilter: string | "all";
  saveFlash: boolean;
  onChangeName: (name: string) => void;
  onWordsPerDay: (n: number) => void;
  onUnitFilter: (unit: string | "all") => void;
  onSave: () => void;
  onHome: () => void;
  onClearAll: () => void;
  onEntriesChange: (next: VocabEntry[]) => void;
  onExpandSheet: () => void;
  onPractice: (mode: VocabPracticeMode) => void;
}) {
  const wordsPerDay = normalizeWordsPerDay(draft.wordsPerDay);
  const partCount =
    filledCount === 0 ? 0 : Math.ceil(filledCount / wordsPerDay);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onHome}
              className="h-9 rounded-[8px] px-2.5 text-[13px] font-bold text-[#6B7280] hover:bg-[#F3F4F6]"
            >
              ← 홈으로
            </button>
            {saveFlash ? (
              <span className="text-[12px] font-semibold text-[#1AA7F2]">
                보관함에 저장했어요
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={draft.name}
              onChange={(e) => onChangeName(e.target.value)}
              placeholder="단어장 이름"
              aria-label="단어장 이름"
              className="h-11 w-[min(50%,280px)] min-w-[140px] rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[18px] font-bold tracking-[-0.02em] text-[#15171A] outline-none focus:border-[#1AA7F2]"
            />
            <label className="flex h-11 items-center gap-2 rounded-[10px] border border-[#E5E7EB] bg-white px-3">
              <span className="whitespace-nowrap text-[12px] font-semibold text-[#6B7280]">
                하루에 외울 단어수
              </span>
              <WordsPerDayField value={wordsPerDay} onCommit={onWordsPerDay} />
            </label>
            {filledCount > 0 ? (
              <span className="text-[12px] font-medium text-[#9CA3AF]">
                → 단원 1~{partCount} (각 {wordsPerDay}개)
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onSave}
            className="h-10 rounded-[10px] bg-[#1AA7F2] px-4 text-[13px] font-bold text-white hover:bg-[#1596d9]"
          >
            보관함에 저장
          </button>
          {filledCount > 0 ? (
            <button
              type="button"
              onClick={onClearAll}
              className="h-10 rounded-[10px] px-3 text-[13px] font-bold text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#6B7280]"
            >
              전체 지우기
            </button>
          ) : null}
        </div>
      </div>

      {filledCount > 0 ? (
        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
          <select
            value={unitFilter}
            onChange={(e) =>
              onUnitFilter(e.target.value === "all" ? "all" : e.target.value)
            }
            className="h-9 rounded-[8px] border border-[#E5E7EB] bg-white px-2.5 text-[13px] font-semibold text-[#374151] outline-none focus:border-[#1AA7F2]"
          >
            <option value="all">연습 단원: 전체 ({filledCount})</option>
            {units.map((unit) => (
              <option key={unit} value={unit}>
                연습 단원: {unit} (
                {
                  draft.entries.filter(
                    (item) =>
                      (item.word.trim() || item.meaning.trim()) &&
                      (item.unit.trim() || "단원 없음") === unit,
                  ).length
                }
                )
              </option>
            ))}
          </select>

          <span className="mx-1 h-4 w-px bg-[#E5E7EB]" aria-hidden />

          <PracticeButton
            label="짝맞추기"
            disabled={practicePoolCount === 0}
            onClick={() => onPractice("match")}
          />
          <PracticeButton
            label="뜻 고르기"
            disabled={practicePoolCount === 0}
            onClick={() => onPractice("meaning-quiz")}
          />
          <PracticeButton
            label="단어 고르기"
            disabled={practicePoolCount === 0}
            onClick={() => onPractice("word-quiz")}
          />
          {practicePoolCount === 0 ? (
            <span className="text-[12px] font-medium text-[#B0B4BB]">
              단어·단어 뜻이 있는 행이 있어야 연습할 수 있어요
            </span>
          ) : (
            <span className="text-[12px] font-medium text-[#9CA3AF]">
              {practicePoolCount}개 연습 가능
            </span>
          )}
        </div>
      ) : null}

      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-[#E8EAED] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <VocabExcelSheet
          entries={draft.entries}
          onEntriesChange={onEntriesChange}
          onExpandSheet={onExpandSheet}
        />
      </div>
    </div>
  );
}

/**
 * 학습 제공 단어장 고르기.
 * 담으면 **새 id로 복사**되므로 이후 편집은 교사 소유 단어장에서 일어난다.
 */
function HaksupCatalogModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (info: HaksupVocabSetInfo) => void;
}) {
  const catalog = useMemo(() => (open ? listHaksupVocabSets() : []), [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-6"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="학습 제공 단어장"
        onClick={(event) => event.stopPropagation()}
        className="flex h-[min(620px,88%)] w-[560px] max-w-[calc(100%-32px)] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#F0F1F3] px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-[20px] font-bold tracking-[-0.02em] text-[#15171A]">
              학습 제공 단어장
            </h2>
            <p className="mt-1 text-[13px] font-medium text-[#8B8F96]">
              담으면 내 보관함에 복사돼요. 담은 뒤 자유롭게 고칠 수 있어요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#8B8F96] hover:bg-[#F3F4F5] hover:text-[#15171A]"
          >
            ✕
          </button>
        </div>

        {catalog.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="text-[15px] font-bold text-[#15171A]">
              아직 제공 단어장이 없어요
            </p>
            <p className="mt-2 max-w-[320px] text-[13px] font-medium leading-[1.55] text-[#9CA3AF]">
              문제은행에 단어가 등록되면 교과서·단원별로 여기에 나타나요.
            </p>
          </div>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2">
            {catalog.map((info) => (
              <li key={info.id}>
                <button
                  type="button"
                  onClick={() => onPick(info)}
                  className="flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-left transition-colors hover:bg-[#F0F9FF]"
                >
                  <span className="shrink-0 rounded-full bg-[#EAF6FE] px-2.5 py-1 text-[11px] font-bold text-[#1274A9]">
                    {info.groupName}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-[#15171A]">
                    {info.name}
                  </span>
                  <span className="shrink-0 text-[12px] font-semibold text-[#8B8F96]">
                    {info.wordCount}단어
                  </span>
                  <span className="shrink-0 text-[12px] font-bold text-[#1AA7F2]">
                    담기 →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PracticeButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-9 rounded-[8px] border border-[#E5E7EB] bg-white px-3 text-[12px] font-bold text-[#374151] transition-colors hover:border-[#1AA7F2] hover:text-[#1AA7F2] disabled:cursor-not-allowed disabled:border-[#F3F4F6] disabled:text-[#D1D5DB]"
    >
      {label}
    </button>
  );
}
