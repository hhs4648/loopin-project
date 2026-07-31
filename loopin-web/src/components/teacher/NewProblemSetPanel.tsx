"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { CLASS_LAYOUT } from "@/lib/class-layout";
import {
  type ProblemGrammar,
  type ProblemSentence,
  type ProblemWord,
  getUnitContent,
} from "@/lib/problem-bank";
import {
  appendProblemSet,
  loadProblemSets,
  persistProblemSets,
  type CreateProblemSetInput,
  type SavedProblemSet,
  updateProblemSet,
} from "@/lib/problem-sets";
import {
  upsertAssignmentsForProblemSet,
  type CreateClassAssignmentInput,
} from "@/lib/class-assignments";
import {
  type TeacherClass,
  loadTeacherClasses,
} from "@/lib/teacher-classes";
import { AssignAssignmentModal } from "@/components/teacher/AssignAssignmentModal";
import {
  AddProblemItemModal,
  type AddProblemKind,
  type EditingProblemItem,
} from "@/components/teacher/AddProblemItemModal";
import {
  PreviewModal,
  type PreviewTarget,
} from "@/components/teacher/PreviewModal";
import { subscribeCustomProblemBank } from "@/lib/custom-problem-bank";
import { publishProblemSetAndAssignments } from "@/lib/sync/teacher-sync";

const GRADE_OPTIONS = ["중1", "중2", "중3"] as const;

/** 중학 영어 교과서 (출판사·저자) */
const BASE_TEXTBOOK_OPTIONS = [
  "NE능률(김)",
  "YBM(김)",
  "YBM(박)",
  "동아(윤)",
  "동아(이)",
  "미래엔(문)",
  "비상(황)",
  "지학사(송)",
  "천재(소)",
  "천재(이)",
] as const;

const TEXTBOOK_OPTIONS_BY_GRADE: Record<string, string[]> = {
  중1: [...BASE_TEXTBOOK_OPTIONS],
  중2: [...BASE_TEXTBOOK_OPTIONS],
  중3: ["YBM(송)"],
};

const UNIT_OPTIONS = [
  "단원 선택",
  "1단원",
  "2단원",
  "3단원",
  "4단원",
  "5단원",
  "6단원",
  "7단원",
  "8단원",
] as const;

const DROPDOWN_VISIBLE_COUNT = 5;
const DROPDOWN_OPTION_H = 32;

type RangeSelectField = {
  key: string;
  ariaLabel: string;
  options: string[];
  width: number;
};

function getTextbookOptions(grade: string): string[] {
  return TEXTBOOK_OPTIONS_BY_GRADE[grade] ?? TEXTBOOK_OPTIONS_BY_GRADE.중1;
}

function getRangeSelects(grade: string): RangeSelectField[] {
  return [
    { key: "grade", ariaLabel: "학년 선택", options: [...GRADE_OPTIONS], width: 96 },
    {
      key: "book",
      ariaLabel: "교과서 선택",
      options: getTextbookOptions(grade),
      width: 170,
    },
    {
      key: "unit",
      ariaLabel: "단원 선택",
      options: [...UNIT_OPTIONS],
      width: 140,
    },
  ];
}

const WORD_TYPE_OPTIONS = [
  "전체",
  "짝맞추기",
  "음성 짝맞추기",
  "3지선다",
  "예문 빈칸",
] as const;
const WORD_TYPE_A_LABEL = "짝맞추기";
const WORD_TYPE_B_LABEL = "음성 짝맞추기";
const MIN_WORD_MATCH_ITEMS = 4;
const SENTENCE_TYPE_OPTIONS = ["전체", "청크배열", "번역 배열", "영작"] as const;
const GRAMMAR_TYPE_OPTIONS = ["전체", "OX문제", "선택형 문제"] as const;

const PREVIEW_ROWS = 4;

function isWordMatchTypeEnabled(typeOn: Record<number, boolean>): boolean {
  return [WORD_TYPE_A_LABEL, WORD_TYPE_B_LABEL].some((label) => {
    const index = WORD_TYPE_OPTIONS.indexOf(label);
    return index > 0 && Boolean(typeOn[index]);
  });
}

function wordMatchSubmitError(
  typeOn: Record<number, boolean>,
  selectedWordCount: number,
): string | null {
  if (!isWordMatchTypeEnabled(typeOn) || selectedWordCount === 0) return null;
  if (selectedWordCount < MIN_WORD_MATCH_ITEMS) {
    return `짝맞추기·음성 짝맞추기는 ${MIN_WORD_MATCH_ITEMS}문제 이상 선택해야 제출할 수 있어요. (현재 ${selectedWordCount}개)`;
  }
  return null;
}

function defaultTypeState(count: number): Record<number, boolean> {
  const next: Record<number, boolean> = {};
  for (let i = 0; i < count; i++) next[i] = true;
  return next;
}

function savedTypeState(
  options: readonly string[],
  selectedTypes: string[],
): Record<number, boolean> {
  const next: Record<number, boolean> = {};
  for (let i = 1; i < options.length; i++) {
    next[i] = selectedTypes.includes(options[i]);
  }
  next[0] = options.slice(1).every((option) => selectedTypes.includes(option));
  return next;
}

function toggleTypeOption(
  prev: Record<number, boolean>,
  index: number,
  count: number
): Record<number, boolean> {
  if (index === 0) {
    const allOn = Array.from({ length: count }, (_, i) => Boolean(prev[i])).every(
      Boolean
    );
    const next: Record<number, boolean> = {};
    for (let i = 0; i < count; i++) next[i] = !allOn;
    return next;
  }
  const next = { ...prev, [index]: !prev[index] };
  const individualsAll = Array.from({ length: count - 1 }, (_, i) =>
    Boolean(next[i + 1])
  ).every(Boolean);
  next[0] = individualsAll;
  return next;
}

function RangeDropdown({
  ariaLabel,
  options,
  value,
  open,
  width,
  onToggle,
  onSelect,
}: {
  ariaLabel: string;
  options: string[];
  value: string;
  open: boolean;
  width: number;
  onToggle: () => void;
  onSelect: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const listMaxH =
    Math.min(options.length, DROPDOWN_VISIBLE_COUNT) * DROPDOWN_OPTION_H;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, onToggle]);

  return (
    <div ref={ref} className="relative min-w-0" style={{ width }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={onToggle}
        className={`flex h-10 w-full items-center justify-between gap-1 rounded-[10px] border bg-white px-3 text-[13px] font-medium outline-none transition-colors ${
          open
            ? "border-[#1AA7F2] ring-1 ring-[#1AA7F2]"
            : "border-[#E5E7EB] hover:border-[#D0D3D9]"
        } text-[#374151]`}
      >
        <span className="truncate">{value}</span>
        <svg
          aria-hidden
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          width="8"
          height="6"
          viewBox="0 0 8 6"
          fill="none"
        >
          <path
            d="M1 1.5L4 4.5L7 1.5"
            stroke="#9CA3AF"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <ul
          role="listbox"
          className="no-scrollbar absolute left-0 top-[44px] z-30 w-full overflow-y-auto rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
          style={{ maxHeight: listMaxH }}
        >
          {options.map((option) => {
            const selected = option === value;
            return (
              <li key={option} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => onSelect(option)}
                  className={`flex w-full items-center justify-between px-3 text-left text-[13px] font-medium transition-colors ${
                    selected
                      ? "bg-[#EAF6FE] text-[#1274A9]"
                      : "text-[#374151] hover:bg-[#F3F4F6]"
                  }`}
                  style={{ height: DROPDOWN_OPTION_H }}
                >
                  <span className="truncate">{option}</span>
                  {selected ? (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                      <path
                        d="M2 5.2l2 2 4-4.4"
                        stroke="#1AA7F2"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function CheckToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-[#1AA7F2]"
    >
      <span
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3.5px]"
        style={{
          background: checked ? "#3667F0" : "#FFFFFF",
          border: `1px solid ${checked ? "#3667F0" : "#D5D7DD"}`,
        }}
      >
        {checked ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path
              d="M2 5.2l2 2 4-4.4"
              stroke="#FFFFFF"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      <span className="text-[13px] font-medium text-[#4B5563]">{label}</span>
    </button>
  );
}

function SectionHeading({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex h-5 items-center gap-2">
      <span
        className="grid size-5 shrink-0 place-items-center rounded-full bg-[#EAF1FF] text-[11px] font-bold leading-none text-[#3667F0]"
        aria-hidden
      >
        {n}
      </span>
      <h2 className="m-0 text-[15px] font-semibold leading-none text-[#16181D]">
        {title}
      </h2>
    </div>
  );
}

function TypeSelectSection({
  title,
  options,
  typeOn,
  onToggle,
  selectedCount,
  totalCount,
  allSelected,
  onToggleAll,
  showItems,
  addLabel,
  onAdd,
  addDisabled,
  children,
}: {
  title: string;
  options: readonly string[];
  typeOn: Record<number, boolean>;
  onToggle: (index: number) => void;
  selectedCount?: number;
  totalCount?: number;
  allSelected?: boolean;
  onToggleAll?: () => void;
  showItems?: boolean;
  addLabel?: string;
  onAdd?: () => void;
  addDisabled?: boolean;
  children?: ReactNode;
}) {
  const showSelectAll =
    showItems && totalCount !== undefined && totalCount > 0 && onToggleAll;

  return (
    <div className="py-3.5">
      <div className="mb-2 flex items-baseline gap-2">
        <div className="text-[13px] font-semibold text-[#16181D]">{title}</div>
        {showItems && totalCount !== undefined ? (
          <span className="text-[12px] font-medium text-[#1AA7F2]">
            ({selectedCount ?? 0}/{totalCount}개 출제)
          </span>
        ) : null}
      </div>
      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
        <span className="shrink-0 text-[12px] font-medium text-[#6B7280]">
          유형 선택 :
        </span>
        {options.map((label, i) => (
          <CheckToggle
            key={label}
            checked={typeOn[i] ?? false}
            onChange={() => onToggle(i)}
            label={label}
          />
        ))}
        {addLabel && onAdd ? (
          <button
            type="button"
            disabled={addDisabled}
            onClick={onAdd}
            className="ml-auto shrink-0 rounded-[8px] border border-[#BAE6FD] bg-[#F0F9FF] px-2.5 py-1 text-[12px] font-semibold text-[#1274A9] transition-colors hover:border-[#1AA7F2] hover:bg-[#E0F2FE] disabled:cursor-not-allowed disabled:border-[#E5E7EB] disabled:bg-[#F9FAFB] disabled:text-[#9CA3AF]"
          >
            {addLabel}
          </button>
        ) : null}
      </div>
      {showSelectAll ? (
        <>
          <div className="my-3 border-t border-[#ECECEF]" />
          <div className="flex items-center gap-3">
            <CheckToggle
              checked={Boolean(allSelected)}
              onChange={onToggleAll}
              label="전체 선택"
            />
            <span className="text-[12px] font-medium text-[#6B7280]">
              {selectedCount ?? 0} / {totalCount} 선택
            </span>
          </div>
          <div className="mb-3 mt-3 border-t border-[#ECECEF]" />
        </>
      ) : null}
      {children ? <div className={showSelectAll ? undefined : "mt-3"}>{children}</div> : null}
    </div>
  );
}

function ItemCheck({ checked }: { checked: boolean }) {
  return (
    <span
      className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3.5px]"
      style={{
        background: checked ? "#1AA7F2" : "#FFFFFF",
        border: `1px solid ${checked ? "#1AA7F2" : "#D5D7DD"}`,
      }}
      aria-hidden
    >
      {checked ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M2 5.2l2 2 4-4.4"
            stroke="#FFFFFF"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}

function PreviewButton({
  onClick,
  ariaLabel = "미리보기",
}: {
  onClick?: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="shrink-0 self-center rounded-[8px] border border-[#E5E7EB] bg-white px-2 py-1 text-[11px] font-medium text-[#4B5563] transition-colors hover:border-[#D0D3D9] hover:bg-[#F9FAFB]"
    >
      미리보기
    </button>
  );
}

function EditButton({
  onClick,
  ariaLabel = "수정",
}: {
  onClick?: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="shrink-0 self-center rounded-[8px] border border-[#BAE6FD] bg-[#F0F9FF] px-2 py-1 text-[11px] font-semibold text-[#1274A9] transition-colors hover:border-[#1AA7F2] hover:bg-[#E0F2FE]"
    >
      수정
    </button>
  );
}

/** 클릭·드래그로 연속 선택/해제 (첫 항목 기준으로 체크 또는 해제) */
function useDragSelect(onSetItem: (id: string, selected: boolean) => void) {
  const sessionRef = useRef<{
    select: boolean;
    painted: Set<string>;
  } | null>(null);

  useEffect(() => {
    const end = () => {
      if (!sessionRef.current) return;
      sessionRef.current = null;
      document.body.style.removeProperty("user-select");
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  const paint = (id: string, select: boolean) => {
    const session = sessionRef.current;
    if (!session || session.painted.has(id)) return;
    session.painted.add(id);
    onSetItem(id, select);
  };

  const onRowPointerDown = (
    id: string,
    currentlyChecked: boolean,
    e: ReactPointerEvent
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const select = !currentlyChecked;
    sessionRef.current = { select, painted: new Set() };
    document.body.style.userSelect = "none";
    paint(id, select);
  };

  const onRowPointerEnter = (id: string) => {
    const session = sessionRef.current;
    if (!session) return;
    paint(id, session.select);
  };

  return { onRowPointerDown, onRowPointerEnter };
}

function BankItemRow({
  id,
  checked,
  onPointerDownSelect,
  onPointerEnterSelect,
  onPreview,
  previewLabel,
  onEdit,
  editLabel,
  children,
}: {
  id: string;
  checked: boolean;
  onPointerDownSelect: (
    id: string,
    currentlyChecked: boolean,
    e: ReactPointerEvent
  ) => void;
  onPointerEnterSelect: (id: string) => void;
  onPreview?: () => void;
  previewLabel?: string;
  onEdit?: () => void;
  editLabel?: string;
  children: ReactNode;
}) {
  return (
    <li
      className={`rounded-[8px] px-1.5 py-1.5 transition-colors select-none ${
        checked ? "bg-[#EAF6FE] ring-1 ring-[#1AA7F2]" : "bg-white"
      }`}
      onPointerEnter={() => onPointerEnterSelect(id)}
    >
      <div className="flex w-full items-start gap-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          onPointerDown={(e) => onPointerDownSelect(id, checked, e)}
          className="flex min-w-0 flex-1 items-start gap-1.5 text-left hover:opacity-90"
        >
          <ItemCheck checked={checked} />
          <span className="min-w-0">{children}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1 self-center">
          <EditButton onClick={onEdit} ariaLabel={editLabel} />
          <PreviewButton onClick={onPreview} ariaLabel={previewLabel} />
        </div>
      </div>
    </li>
  );
}
function ExpandableList({
  total,
  expanded,
  onToggle,
  children,
}: {
  total: number;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  if (total === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-[#E5E7EB] bg-[#FAFAFB] px-3 py-3 text-center text-[12px] text-[#9497A0]">
        이 단원에 등록된 항목이 없습니다.
      </p>
    );
  }

  return (
    <div>
      <ul className="space-y-1 rounded-[10px] border border-[#ECECEF] bg-[#FAFAFB] p-1.5">
        {children}
      </ul>
      {total > PREVIEW_ROWS ? (
        <button
          type="button"
          onClick={onToggle}
          className="mt-2 w-full rounded-[8px] border border-[#E5E7EB] bg-white py-1.5 text-[12px] font-medium text-[#4B5563] hover:bg-[#F9FAFB]"
        >
          {expanded ? "접기" : `펼치기 (${total - PREVIEW_ROWS}개 더)`}
        </button>
      ) : null}
    </div>
  );
}

function WordBankList({
  items,
  expanded,
  selectedIds,
  onSetItem,
  onToggleExpand,
  onPreviewItem,
  onEditItem,
}: {
  items: ProblemWord[];
  expanded: boolean;
  selectedIds: Set<string>;
  onSetItem: (id: string, selected: boolean) => void;
  onToggleExpand: () => void;
  onPreviewItem?: (item: ProblemWord) => void;
  onEditItem?: (item: ProblemWord) => void;
}) {
  const { onRowPointerDown, onRowPointerEnter } = useDragSelect(onSetItem);
  const visible = expanded ? items : items.slice(0, PREVIEW_ROWS);
  return (
    <ExpandableList
      total={items.length}
      expanded={expanded}
      onToggle={onToggleExpand}
    >
      {visible.map((item) => {
        const checked = selectedIds.has(item.id);
        return (
          <BankItemRow
            key={item.id}
            id={item.id}
            checked={checked}
            onPointerDownSelect={onRowPointerDown}
            onPointerEnterSelect={onRowPointerEnter}
            onPreview={() => onPreviewItem?.(item)}
            previewLabel={`${item.english} 미리보기`}
            onEdit={() => onEditItem?.(item)}
            editLabel={`${item.english} 수정`}
          >
            <span className="text-[17px] leading-relaxed">
              <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <span className="font-medium text-[#16181D]">
                  {item.english}
                </span>
                <span className="text-[#6B7280]">{item.korean}</span>
              </span>
              {item.exampleEn ? (
                <span className="mt-1 block text-[16px] text-[#374151]">
                  {item.exampleEn}
                </span>
              ) : null}
              {item.exampleKo ? (
                <span className="mt-0.5 block text-[16px] text-[#9CA3AF]">
                  {item.exampleKo}
                </span>
              ) : null}
            </span>
          </BankItemRow>
        );
      })}
    </ExpandableList>
  );
}

function SentenceBankList({
  items,
  expanded,
  selectedIds,
  onSetItem,
  onToggleExpand,
  onPreviewItem,
  onEditItem,
}: {
  items: ProblemSentence[];
  expanded: boolean;
  selectedIds: Set<string>;
  onSetItem: (id: string, selected: boolean) => void;
  onToggleExpand: () => void;
  onPreviewItem?: (item: ProblemSentence) => void;
  onEditItem?: (item: ProblemSentence) => void;
}) {
  const { onRowPointerDown, onRowPointerEnter } = useDragSelect(onSetItem);
  const visible = expanded ? items : items.slice(0, PREVIEW_ROWS);
  return (
    <ExpandableList
      total={items.length}
      expanded={expanded}
      onToggle={onToggleExpand}
    >
      {visible.map((item) => {
        const checked = selectedIds.has(item.id);
        return (
          <BankItemRow
            key={item.id}
            id={item.id}
            checked={checked}
            onPointerDownSelect={onRowPointerDown}
            onPointerEnterSelect={onRowPointerEnter}
            onPreview={() => onPreviewItem?.(item)}
            previewLabel="문장 미리보기"
            onEdit={() => onEditItem?.(item)}
            editLabel="문장 수정"
          >
            <span className="text-[16px] leading-relaxed">
              <span className="block font-medium text-[#16181D]">
                {item.english}
              </span>
              {item.chunksKo ? (
                <span className="mt-1 block text-[#6B7280]">
                  {item.chunksKo}
                </span>
              ) : null}
              {item.chunksEn ? (
                <span className="mt-1 block text-[15px] text-[#9CA3AF]">
                  청크: {item.chunksEn}
                </span>
              ) : null}
            </span>
          </BankItemRow>
        );
      })}
    </ExpandableList>
  );
}

function GrammarBankList({
  items,
  expanded,
  selectedIds,
  onSetItem,
  onToggleExpand,
  onPreviewItem,
  onEditItem,
}: {
  items: ProblemGrammar[];
  expanded: boolean;
  selectedIds: Set<string>;
  onSetItem: (id: string, selected: boolean) => void;
  onToggleExpand: () => void;
  onPreviewItem?: (item: ProblemGrammar) => void;
  onEditItem?: (item: ProblemGrammar) => void;
}) {
  const { onRowPointerDown, onRowPointerEnter } = useDragSelect(onSetItem);
  const visible = expanded ? items : items.slice(0, PREVIEW_ROWS);
  return (
    <ExpandableList
      total={items.length}
      expanded={expanded}
      onToggle={onToggleExpand}
    >
      {visible.map((item) => {
        const checked = selectedIds.has(item.id);
        return (
          <BankItemRow
            key={item.id}
            id={item.id}
            checked={checked}
            onPointerDownSelect={onRowPointerDown}
            onPointerEnterSelect={onRowPointerEnter}
            onPreview={() => onPreviewItem?.(item)}
            previewLabel="문법 미리보기"
            onEdit={() => onEditItem?.(item)}
            editLabel="문법 수정"
          >
            <span className="text-[16px] leading-relaxed">
              <span className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-[#EEF0F3] px-1.5 py-0.5 text-[15px] font-medium text-[#4B5563]">
                  {item.major}
                  {item.minor ? ` · ${item.minor}` : ""}
                </span>
                {item.ox ? (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[15px] font-bold ${
                      item.ox === "O"
                        ? "bg-[#E8F8EF] text-[#1B7A45]"
                        : "bg-[#FEECEC] text-[#C52B2B]"
                    }`}
                  >
                    {item.ox}
                  </span>
                ) : null}
              </span>
              <span className="block font-medium text-[#16181D]">
                {renderGrammarEnglishWithWrongPart(item.english, item.wrongPart)}
              </span>
              {item.korean ? (
                <span className="mt-1 block text-[#6B7280]">{item.korean}</span>
              ) : null}
              {item.choices && item.choices !== "-" ? (
                <span className="mt-1 block text-[15px] text-[#9CA3AF]">
                  보기: {item.choices}
                </span>
              ) : null}
            </span>
          </BankItemRow>
        );
      })}
    </ExpandableList>
  );
}

/** 문법 영어 문장에서 틀린 부분만 빨간 글씨로 표시 */
function renderGrammarEnglishWithWrongPart(
  english: string,
  wrongPart: string,
): ReactNode {
  const target = wrongPart?.trim();
  if (!target || target === "-" || !english.includes(target)) {
    return english;
  }
  const index = english.indexOf(target);
  const before = english.slice(0, index);
  const after = english.slice(index + target.length);
  return (
    <>
      {before}
      <span className="font-bold text-[#EF4444]">{target}</span>
      {after}
    </>
  );
}

type ProblemsCreateFormProps = {
  /** 사용하지 않음 — 페이지 인라인은 HTML만 사용 (호환용) */
  svg?: string;
};

/**
 * 문제 관리 본문용 새 문제 세트 폼 (모달 SVG 없이 HTML · 잘림 없음).
 */
export function ProblemsCreateForm(_props: ProblemsCreateFormProps) {
  const [rangeValues, setRangeValues] = useState<Record<string, string>>(() => {
    const grade = GRADE_OPTIONS[0];
    return {
      grade,
      book: getTextbookOptions(grade)[0],
      unit: UNIT_OPTIONS[0],
    };
  });
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [wordTypeOn, setWordTypeOn] = useState(() =>
    defaultTypeState(WORD_TYPE_OPTIONS.length)
  );
  const [sentenceTypeOn, setSentenceTypeOn] = useState(() =>
    defaultTypeState(SENTENCE_TYPE_OPTIONS.length)
  );
  const [grammarTypeOn, setGrammarTypeOn] = useState(() =>
    defaultTypeState(GRAMMAR_TYPE_OPTIONS.length)
  );
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [editingProblemSet, setEditingProblemSet] =
    useState<SavedProblemSet | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [pendingInput, setPendingInput] =
    useState<CreateProblemSetInput | null>(null);
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(
    null
  );
  const [addKind, setAddKind] = useState<AddProblemKind | null>(null);
  const [editingItem, setEditingItem] = useState<EditingProblemItem | null>(
    null,
  );
  const [customBankTick, setCustomBankTick] = useState(0);
  const [expanded, setExpanded] = useState({
    word: false,
    sentence: false,
    grammar: false,
  });
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedSentenceIds, setSelectedSentenceIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedGrammarIds, setSelectedGrammarIds] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    setClasses(loadTeacherClasses());
    setClassesLoaded(true);
  }, []);

  useEffect(() => subscribeCustomProblemBank(() => {
    setCustomBankTick((tick) => tick + 1);
  }), []);

  useEffect(() => {
    const problemSetId = new URLSearchParams(window.location.search).get(
      "problemSetId",
    );
    if (!problemSetId) return;

    const saved = loadProblemSets().find((item) => item.id === problemSetId);
    if (!saved) return;

    setEditingProblemSet(saved);
    setRangeValues({
      grade: saved.grade,
      book: saved.textbook,
      unit: saved.unit,
    });
    setSelectedClassIds([...saved.assignedClassIds]);
    setWordTypeOn(savedTypeState(WORD_TYPE_OPTIONS, saved.problemTypes.words));
    setSentenceTypeOn(
      savedTypeState(SENTENCE_TYPE_OPTIONS, saved.problemTypes.sentences),
    );
    setGrammarTypeOn(
      savedTypeState(GRAMMAR_TYPE_OPTIONS, saved.problemTypes.grammar),
    );
  }, []);

  const toggleClass = (id: string) =>
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const setIdInSet = (
    setter: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void,
    id: string,
    selected: boolean
  ) => {
    setter((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllIds = (
    setter: (value: Set<string>) => void,
    ids: string[],
    allSelected: boolean
  ) => {
    setter(allSelected ? new Set() : new Set(ids));
  };

  const rangeSelects = getRangeSelects(rangeValues.grade ?? GRADE_OPTIONS[0]);
  const unitSelected =
    Boolean(rangeValues.unit) && rangeValues.unit !== "단원 선택";

  const unitContent = useMemo(() => {
    if (!unitSelected) {
      return { words: [], sentences: [], grammar: [] };
    }
    return getUnitContent({
      grade: rangeValues.grade ?? GRADE_OPTIONS[0],
      textbook: rangeValues.book ?? getTextbookOptions(GRADE_OPTIONS[0])[0],
      unit: rangeValues.unit ?? UNIT_OPTIONS[0],
    });
  }, [
    unitSelected,
    rangeValues.grade,
    rangeValues.book,
    rangeValues.unit,
    customBankTick,
  ]);

  const selectedGrade = rangeValues.grade ?? GRADE_OPTIONS[0];
  const filteredReceiverClasses = useMemo(
    () => classes.filter((c) => (c.grade ?? "") === selectedGrade),
    [classes, selectedGrade]
  );

  const rangeKey = `${rangeValues.grade}|${rangeValues.book}|${rangeValues.unit}`;

  useEffect(() => {
    setExpanded({ word: false, sentence: false, grammar: false });
    if (!unitSelected) {
      setSelectedWordIds(new Set());
      setSelectedSentenceIds(new Set());
      setSelectedGrammarIds(new Set());
      return;
    }
    const content = getUnitContent({
      grade: rangeValues.grade ?? GRADE_OPTIONS[0],
      textbook: rangeValues.book ?? getTextbookOptions(GRADE_OPTIONS[0])[0],
      unit: rangeValues.unit ?? UNIT_OPTIONS[0],
    });
    const matchesSavedRange =
      editingProblemSet?.grade === rangeValues.grade &&
      editingProblemSet.textbook === rangeValues.book &&
      editingProblemSet.unit === rangeValues.unit;
    setSelectedWordIds(
      new Set(
        matchesSavedRange
          ? editingProblemSet.items.words
          : content.words.map((w) => w.id),
      ),
    );
    setSelectedSentenceIds(
      new Set(
        matchesSavedRange
          ? editingProblemSet.items.sentences
          : content.sentences.map((s) => s.id),
      ),
    );
    setSelectedGrammarIds(
      new Set(
        matchesSavedRange
          ? editingProblemSet.items.grammar
          : content.grammar.map((g) => g.id),
      ),
    );
    // 단원·저장 세트 변경 시에만 선택 초기화 (직접 추가 시 유지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingProblemSet, rangeKey, unitSelected]);

  const openAddModal = (kind: AddProblemKind) => {
    if (!unitSelected) return;
    setEditingItem(null);
    setAddKind(kind);
  };

  const openEditModal = (item: EditingProblemItem) => {
    if (!unitSelected) return;
    setEditingItem(item);
    setAddKind(item.kind);
  };

  const closeAddModal = () => {
    setAddKind(null);
    setEditingItem(null);
  };

  const handleItemCreated = (kind: AddProblemKind, id: string) => {
    setCustomBankTick((tick) => tick + 1);
    if (kind === "word") {
      setIdInSet(setSelectedWordIds, id, true);
      return;
    }
    if (kind === "sentence") {
      setIdInSet(setSelectedSentenceIds, id, true);
      return;
    }
    setIdInSet(setSelectedGrammarIds, id, true);
  };

  useEffect(() => {
    if (!classesLoaded) return;
    const allowed = new Set(filteredReceiverClasses.map((c) => c.id));
    setSelectedClassIds((prev) => prev.filter((id) => allowed.has(id)));
    // 선택 반이 바뀌면 "제출 완료" 상태는 리셋
    setSubmitDone(false);
    setSubmitError("");
  }, [classesLoaded, filteredReceiverClasses]);

  const wordIds = unitContent.words.map((w) => w.id);
  const sentenceIds = unitContent.sentences.map((s) => s.id);
  const grammarIds = unitContent.grammar.map((g) => g.id);
  const allWordsSelected =
    wordIds.length > 0 && wordIds.every((id) => selectedWordIds.has(id));
  const allSentencesSelected =
    sentenceIds.length > 0 &&
    sentenceIds.every((id) => selectedSentenceIds.has(id));
  const allGrammarSelected =
    grammarIds.length > 0 &&
    grammarIds.every((id) => selectedGrammarIds.has(id));

  const selectedWordCount = wordIds.filter((id) =>
    selectedWordIds.has(id)
  ).length;
  const selectedSentenceCount = sentenceIds.filter((id) =>
    selectedSentenceIds.has(id)
  ).length;
  const selectedGrammarCount = grammarIds.filter((id) =>
    selectedGrammarIds.has(id)
  ).length;
  const wordMatchError = wordMatchSubmitError(wordTypeOn, selectedWordCount);

  return (
    <div className="flex w-full max-w-[880px] flex-col gap-4 pb-4">
      {editingProblemSet ? (
        <div className="flex items-center justify-between gap-4 rounded-[12px] border border-[#BAE6FD] bg-[#F0F9FF] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[#1274A9]">
              사용자 지정 과제를 불러왔어요
            </p>
            <p className="mt-0.5 truncate text-[12px] text-[#4B7285]">
              {editingProblemSet.title} · 문제 구성과 유형을 그대로 불러왔습니다.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#1AA7F2]">
            과제 내기
          </span>
        </div>
      ) : null}
      {/* 1 교과서 범위 */}
      <section className="rounded-[14px] border border-[#E8E8EA] bg-white px-3.5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="mb-3">
          <SectionHeading n={1} title="교과서 범위" />
        </div>
        <div className="flex flex-wrap gap-2.5">
          {rangeSelects.map((field) => (
            <RangeDropdown
              key={field.key}
              ariaLabel={field.ariaLabel}
              options={field.options}
              value={rangeValues[field.key] ?? field.options[0]}
              open={openDropdown === field.key}
              width={field.width}
              onToggle={() =>
                setOpenDropdown((prev) =>
                  prev === field.key ? null : field.key
                )
              }
              onSelect={(v) => {
                setRangeValues((prev) => {
                  if (field.key === "grade") {
                    return {
                      ...prev,
                      grade: v,
                      book: getTextbookOptions(v)[0],
                      unit: UNIT_OPTIONS[0],
                    };
                  }
                  if (field.key === "book") {
                    return { ...prev, book: v, unit: UNIT_OPTIONS[0] };
                  }
                  return { ...prev, [field.key]: v };
                });
                setOpenDropdown(null);
              }}
            />
          ))}
        </div>
      </section>

      {/* 2 받는 반 */}
      <section className="rounded-[14px] border border-[#E8E8EA] bg-white px-3.5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="mb-1 flex items-center justify-between gap-3">
          <SectionHeading n={2} title="받는 반" />
          {filteredReceiverClasses.length > 0 ? (
            <span className="text-[12px] font-semibold leading-none text-[#1AA7F2]">
              {selectedClassIds.length}개 반 선택
            </span>
          ) : null}
        </div>
        <p className="mb-3 ml-7 text-[12px] text-[#9CA3AF]">
          과제를 받을 반을 선택해 주세요. 여러 반을 선택할 수 있어요.
        </p>
        {filteredReceiverClasses.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {filteredReceiverClasses.map((cls) => {
              const on = selectedClassIds.includes(cls.id);
              return (
                <button
                  key={cls.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`${cls.name} ${on ? "선택 해제" : "선택"}`}
                  onClick={() => toggleClass(cls.id)}
                  className={`flex h-10 min-w-[112px] cursor-pointer items-center gap-2 rounded-[10px] border px-3 text-[13px] font-semibold outline-none transition-all focus:outline-none focus-visible:outline-none ${
                    on
                      ? "border-[#1AA7F2] bg-[#EAF6FE] text-[#1274A9] shadow-[0_0_0_1px_rgba(26,167,242,0.08)]"
                      : "border-[#E5E7EB] bg-white text-[#4B5563] hover:border-[#9DD9F8] hover:bg-[#F8FCFF]"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: cls.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {cls.name}
                  </span>
                  <span
                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border ${
                      on
                        ? "border-[#1AA7F2] bg-[#1AA7F2]"
                        : "border-[#C7CBD1] bg-white"
                    }`}
                    aria-hidden
                  >
                    {on ? (
                      <svg
                        width="11"
                        height="9"
                        viewBox="0 0 11 9"
                        fill="none"
                      >
                        <path
                          d="M1.5 4.5 4 7l5.5-5.5"
                          stroke="white"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px] text-[#9497A0]">
            해당하는 반이 없어요. 반 설정에서 학년을 지정해 주세요.
          </p>
        )}
      </section>

      {/* 3 문제 구성 — 단원 지정 전 유형만 */}
      <section className="rounded-[14px] border border-[#E8E8EA] bg-white px-3.5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="mb-1">
          <SectionHeading n={3} title="문제 구성" />
        </div>
        <div className="divide-y divide-[#ECECEF]">
          <TypeSelectSection
            title="단어"
            options={WORD_TYPE_OPTIONS}
            typeOn={wordTypeOn}
            showItems={unitSelected}
            selectedCount={selectedWordCount}
            totalCount={unitContent.words.length}
            allSelected={allWordsSelected}
            addLabel="+ 단어 추가"
            addDisabled={!unitSelected}
            onAdd={() => openAddModal("word")}
            onToggleAll={() =>
              toggleAllIds(setSelectedWordIds, wordIds, allWordsSelected)
            }
            onToggle={(i) =>
              setWordTypeOn((prev) =>
                toggleTypeOption(prev, i, WORD_TYPE_OPTIONS.length)
              )
            }
          >
            {unitSelected ? (
              <WordBankList
                items={unitContent.words}
                expanded={expanded.word}
                selectedIds={selectedWordIds}
                onSetItem={(id, selected) =>
                  setIdInSet(setSelectedWordIds, id, selected)
                }
                onToggleExpand={() =>
                  setExpanded((prev) => ({ ...prev, word: !prev.word }))
                }
                onPreviewItem={(item) =>
                  setPreviewTarget({
                    kind: "word",
                    title: `${item.english} 미리보기`,
                    item,
                    pool: unitContent.words,
                    checkedTypes: WORD_TYPE_OPTIONS.filter(
                      (_, index) => index > 0 && wordTypeOn[index],
                    ),
                  })
                }
                onEditItem={(item) => openEditModal({ kind: "word", item })}
              />
            ) : null}
            {wordMatchError ? (
              <p className="mt-2 text-[12px] font-medium text-[#D97706]">
                {wordMatchError}
              </p>
            ) : null}
          </TypeSelectSection>
          <TypeSelectSection
            title="문장"
            options={SENTENCE_TYPE_OPTIONS}
            typeOn={sentenceTypeOn}
            showItems={unitSelected}
            selectedCount={selectedSentenceCount}
            totalCount={unitContent.sentences.length}
            allSelected={allSentencesSelected}
            addLabel="+ 본문 추가"
            addDisabled={!unitSelected}
            onAdd={() => openAddModal("sentence")}
            onToggleAll={() =>
              toggleAllIds(
                setSelectedSentenceIds,
                sentenceIds,
                allSentencesSelected
              )
            }
            onToggle={(i) =>
              setSentenceTypeOn((prev) =>
                toggleTypeOption(prev, i, SENTENCE_TYPE_OPTIONS.length)
              )
            }
          >
            {unitSelected ? (
              <SentenceBankList
                items={unitContent.sentences}
                expanded={expanded.sentence}
                selectedIds={selectedSentenceIds}
                onSetItem={(id, selected) =>
                  setIdInSet(setSelectedSentenceIds, id, selected)
                }
                onToggleExpand={() =>
                  setExpanded((prev) => ({
                    ...prev,
                    sentence: !prev.sentence,
                  }))
                }
                onPreviewItem={(item) =>
                  setPreviewTarget({
                    kind: "sentence",
                    title: "문장 미리보기",
                    item,
                    checkedTypes: SENTENCE_TYPE_OPTIONS.filter(
                      (_, index) => index > 0 && sentenceTypeOn[index],
                    ),
                  })
                }
                onEditItem={(item) =>
                  openEditModal({ kind: "sentence", item })
                }
              />
            ) : null}
          </TypeSelectSection>
          <TypeSelectSection
            title="문법"
            options={GRAMMAR_TYPE_OPTIONS}
            typeOn={grammarTypeOn}
            showItems={unitSelected}
            selectedCount={selectedGrammarCount}
            totalCount={unitContent.grammar.length}
            allSelected={allGrammarSelected}
            addLabel="+ 문법 추가"
            addDisabled={!unitSelected}
            onAdd={() => openAddModal("grammar")}
            onToggleAll={() =>
              toggleAllIds(
                setSelectedGrammarIds,
                grammarIds,
                allGrammarSelected
              )
            }
            onToggle={(i) =>
              setGrammarTypeOn((prev) =>
                toggleTypeOption(prev, i, GRAMMAR_TYPE_OPTIONS.length)
              )
            }
          >
            {unitSelected ? (
              <GrammarBankList
                items={unitContent.grammar}
                expanded={expanded.grammar}
                selectedIds={selectedGrammarIds}
                onSetItem={(id, selected) =>
                  setIdInSet(setSelectedGrammarIds, id, selected)
                }
                onToggleExpand={() =>
                  setExpanded((prev) => ({
                    ...prev,
                    grammar: !prev.grammar,
                  }))
                }
                onPreviewItem={(item) =>
                  setPreviewTarget({
                    kind: "grammar",
                    title: "문법 미리보기",
                    item,
                    checkedTypes: GRAMMAR_TYPE_OPTIONS.filter(
                      (_, index) => index > 0 && grammarTypeOn[index],
                    ),
                  })
                }
                onEditItem={(item) =>
                  openEditModal({ kind: "grammar", item })
                }
              />
            ) : null}
          </TypeSelectSection>
        </div>
        {!unitSelected ? (
          <p className="pt-2 text-center text-[12px] font-medium text-[#9497A0]">
            단원을 선택하면 단어·문장·문법이 표시됩니다
          </p>
        ) : null}
      </section>

      {/* 제출 */}
      <div className="flex flex-col items-end gap-2 pt-1">
        {submitError ? (
          <p className="text-[13px] font-medium text-[#EF4444]">{submitError}</p>
        ) : null}
        {submitDone ? (
          <p className="text-[13px] font-medium text-[#1B7A45]">
            {editingProblemSet
              ? "문제 구성을 반영하고 선택한 반에 과제를 부여했어요."
              : "선택한 반에 과제를 부여했어요."}
          </p>
        ) : null}
        <button
          type="button"
          disabled={submitting || !unitSelected || selectedClassIds.length === 0}
          onClick={() => {
            setSubmitError("");
            setSubmitDone(false);

            if (!unitSelected) {
              setSubmitError("단원을 먼저 선택해 주세요.");
              return;
            }
            if (selectedClassIds.length === 0) {
              setSubmitError("받는 반을 선택해 주세요.");
              return;
            }

            const selectedItemCount =
              selectedWordIds.size +
              selectedSentenceIds.size +
              selectedGrammarIds.size;
            if (selectedItemCount === 0) {
              setSubmitError("출제할 문제를 하나 이상 선택해 주세요.");
              return;
            }

            const wordTypeError = wordMatchSubmitError(
              wordTypeOn,
              selectedWordCount,
            );
            if (wordTypeError) {
              setSubmitError(wordTypeError);
              return;
            }

            setPendingInput({
              grade: rangeValues.grade,
              textbook: rangeValues.book,
              unit: rangeValues.unit,
              assignedClassIds: [...selectedClassIds],
              items: {
                words: Array.from(selectedWordIds),
                sentences: Array.from(selectedSentenceIds),
                grammar: Array.from(selectedGrammarIds),
              },
              problemTypes: {
                words: WORD_TYPE_OPTIONS.filter(
                  (_, index) => index > 0 && wordTypeOn[index],
                ),
                sentences: SENTENCE_TYPE_OPTIONS.filter(
                  (_, index) => index > 0 && sentenceTypeOn[index],
                ),
                grammar: GRAMMAR_TYPE_OPTIONS.filter(
                  (_, index) => index > 0 && grammarTypeOn[index],
                ),
              },
            });
            setAssignOpen(true);
          }}
          className={`h-11 rounded-[10px] px-5 text-[14px] font-semibold transition-colors ${
            submitting || !unitSelected || selectedClassIds.length === 0
              ? "cursor-not-allowed bg-[#E5E7EB] text-[#6B7280]"
              : "bg-[#1AA7F2] text-white hover:bg-[#1596d9]"
          }`}
        >
          제출하기
        </button>
      </div>

      <AssignAssignmentModal
        open={assignOpen}
        classes={classes}
        classIds={pendingInput?.assignedClassIds ?? selectedClassIds}
        onClose={() => {
          setAssignOpen(false);
          setPendingInput(null);
        }}
        onConfirm={(draftAssignments: CreateClassAssignmentInput[]) => {
          if (!pendingInput) return;
          setSubmitting(true);
          void (async () => {
            try {
              let problemSetId = editingProblemSet?.id ?? "";
              let savedSet: SavedProblemSet | null = null;
              if (editingProblemSet) {
                const next = updateProblemSet(
                  loadProblemSets(),
                  editingProblemSet.id,
                  pendingInput,
                );
                persistProblemSets(next);
                savedSet =
                  next.find((item) => item.id === editingProblemSet.id) ?? null;
                setEditingProblemSet(savedSet);
                problemSetId = editingProblemSet.id;
              } else {
                const created = appendProblemSet({
                  ...pendingInput,
                  hiddenFromLibrary: true,
                });
                problemSetId = created.id;
                savedSet = created;
              }
              const nextAssignments = upsertAssignmentsForProblemSet(
                problemSetId,
                draftAssignments.map((item) => ({
                  ...item,
                  problemSetId,
                })),
              );
              const problemSet =
                savedSet ??
                loadProblemSets().find((item) => item.id === problemSetId) ??
                null;
              if (problemSet) {
                await publishProblemSetAndAssignments({
                  problemSet,
                  assignments: nextAssignments.filter(
                    (item) => item.problemSetId === problemSetId,
                  ),
                });
              }
              setAssignOpen(false);
              setPendingInput(null);
              setSubmitting(false);
              setSubmitDone(true);
            } catch {
              setSubmitting(false);
              setSubmitError("저장하지 못했어요. 다시 시도해 주세요.");
            }
          })();
        }}
      />
      <PreviewModal
        target={previewTarget}
        onClose={() => setPreviewTarget(null)}
      />
      <AddProblemItemModal
        open={addKind !== null}
        kind={addKind}
        editing={editingItem}
        scope={
          unitSelected
            ? {
                grade: rangeValues.grade ?? GRADE_OPTIONS[0],
                textbook:
                  rangeValues.book ?? getTextbookOptions(GRADE_OPTIONS[0])[0],
                unit: rangeValues.unit ?? UNIT_OPTIONS[0],
              }
            : null
        }
        onClose={closeAddModal}
        onCreated={handleItemCreated}
      />
    </div>
  );
}

/** @deprecated 모달 경로는 문제 관리 인라인으로 대체됨 — 호환 export */
export function NewProblemSetPanel({
  svg,
  variant = "page",
}: {
  svg: string;
  variant?: "page" | "modal";
  open?: boolean;
  onClose?: () => void;
}) {
  void variant;
  return <ProblemsCreateForm svg={svg} />;
}

/** 레이아웃 상수 — ProblemsManagementOverlay에서 제목 정렬용 */
export const PROBLEMS_PAGE_LAYOUT = {
  contentLeft: CLASS_LAYOUT.contentLeft,
  formMaxWidth: 880,
} as const;
