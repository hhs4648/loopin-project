"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react";

import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

import {
  clearAssignDraft,
  saveAssignDraft,
} from "@/lib/assign-draft";
import { publishProblemsAssign } from "@/lib/assign-publish";
import {
  formatDeadlineKo,
  planQuickAssign,
  type QuickAssignPlan,
} from "@/lib/quick-assign";
import { CLASS_LAYOUT } from "@/lib/class-layout";
import {
  type ProblemGrammar,
  type ProblemSentence,
  type ProblemWord,
  getUnitContent,
} from "@/lib/problem-bank";
import {
  loadProblemSets,
  type CreateProblemSetInput,
  type ProblemSetParts,
  type SavedProblemSet,
} from "@/lib/problem-sets";
import {
  assignedBadgeLabel,
  buildItemAssignmentHistory,
  isAssignedToAllClasses,
  pickUnassignedIds,
} from "@/lib/problem-item-history";
import { loadClassAssignments } from "@/lib/class-assignments";
import {
  DEFAULT_PART_CHECKED,
  DEFAULT_PART_COUNTS,
  DEFAULT_PART_DONE,
  DEFAULT_PART_LOCKS,
  DEFAULT_PART_SELECTION,
  MAX_PARTS,
  MIN_WORD_MATCH_ITEMS,
  PART_CATEGORIES,
  PART_LABEL,
  buildProblemSetParts,
  continueUnitHref,
  maxPartsFor,
  minItemsPerPart,
  partSlice,
  partSplitDisabledReason,
  readPartPreset,
  splitIntoParts,
  visibleUnitPartProgress,
  type PartCategory,
  type PartChecked,
  type PartCounts,
  type PartDoneIndices,
  type PartLocks,
  type PartSelection,
} from "@/lib/problem-set-parts";
import {
  type TeacherClass,
  isMixedGrade,
  loadTeacherClasses,
} from "@/lib/teacher-classes";
import { type AssignContentRow } from "@/components/teacher/AssignAssignmentModal";
import {
  AddProblemItemModal,
  type AddProblemKind,
  type EditingProblemItem,
} from "@/components/teacher/AddProblemItemModal";
import {
  PreviewModal,
  type PreviewTarget,
} from "@/components/teacher/PreviewModal";
import {
  passageSentenceIdPrefix,
  replaceCustomSentencesByPrefix,
  subscribeCustomProblemBank,
  upsertCustomWord,
  type CustomSentenceInput,
} from "@/lib/custom-problem-bank";
import {
  findExistingSentence,
  matchUnitWordsInPassage,
  pairPassageSentences,
  passageExampleForWord,
} from "@/lib/passage-to-problems";
import { assignedClassHomeHref } from "@/lib/class-tabs";
import { loadUnitPassage, saveUnitPassage } from "@/lib/unit-passages";

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
const SENTENCE_TYPE_OPTIONS = ["전체", "청크배열", "번역 배열", "영작"] as const;
// 문법은 OX문제 1종. X 정답 문항은 학생앱에서 3지선다 교정 스텝이 이어서 나온다.
// "선택형 문제"(2지선다 단독 화면, 학생앱 grammar-type-1)는 출제 대상에서 제외 —
// 선택지가 3개 필수라 2지선다 문항을 만들 수 없고, 문제은행에도 해당 문항이 없다.
// 이미 저장된 문제집의 "선택형 문제"는 라벨로 보관되어 그대로 동작한다(savedTypeState).
const GRAMMAR_TYPE_OPTIONS = ["전체", "OX문제"] as const;

const PREVIEW_ROWS = 4;

/**
 * 제출하기 — 받을 반·유형 검증 후 과제 부여 페이지로 넘긴다.
 */

function isWordMatchTypeEnabled(typeOn: Record<number, boolean>): boolean {
  return ([WORD_TYPE_A_LABEL, WORD_TYPE_B_LABEL] as const).some((label) => {
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

/** 「전체」 알약(0번)을 뺀 실제 유형을 하나라도 골랐나 */
function hasChosenType(
  state: Record<number, boolean>,
  options: readonly string[],
): boolean {
  return options.some((_, index) => index > 0 && state[index]);
}

function defaultTypeState(count: number): Record<number, boolean> {
  /*
    유형은 **전부 체크**로 시작한다(0번 「전체」 포함).

    항목(문항) 선택과 반대다. 항목은 전부 켜 두면 단원을 통째로 내기 쉬워 위험하지만,
    유형은 **고른 문항을 어떤 형태로 낼지**일 뿐이라 기본이 전부여도 잃을 게 없다.
    오히려 전부 해제로 두면 문항만 고르고 제출했다가 「아무것도 안 나갔다」가 된다.
    빼고 싶은 유형만 끄면 된다.
  */
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
          className="dropdown-scrollbar absolute left-0 top-[44px] z-30 w-full overflow-y-scroll rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
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

/** 「전체 선택」·「미선택 보기」처럼 목록을 바꾸는 보조 버튼 */
function ToolbarButton({
  onClick,
  active,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 shrink-0 cursor-pointer rounded-[7px] border px-2.5 text-[12px] font-semibold transition-colors ${
        active
          ? "border-[#1AA7F2] bg-[#EAF6FE] text-[#1274A9]"
          : "border-[#D5D7DD] bg-white text-[#4B5563] hover:border-[#9DD9F8] hover:bg-[#F8FCFF]"
      }`}
    >
      {children}
    </button>
  );
}

function TypeSelectSection({
  title,
  options,
  typeOn,
  onToggle,
  submitCount,
  selectedCount,
  totalCount,
  allSelected,
  onToggleAll,
  showItems,
  addLabel,
  onAdd,
  addDisabled,
  restCount,
  showRest,
  onToggleRest,
  unassignedCount,
  onPickUnassigned,
  unitLabel,
  partActive,
  partCountControl,
  partTabs,
  children,
}: {
  title: string;
  options: readonly string[];
  typeOn: Record<number, boolean>;
  onToggle: (index: number) => void;
  /** 이번 제출에 실제로 나갈 문항 수 — 제목 옆 칩 */
  submitCount?: number;
  selectedCount?: number;
  totalCount?: number;
  allSelected?: boolean;
  onToggleAll?: () => void;
  showItems?: boolean;
  addLabel?: string;
  onAdd?: () => void;
  addDisabled?: boolean;
  /** 지금 보는 파트 밖에 남은 항목 수 */
  restCount?: number;
  showRest?: boolean;
  onToggleRest?: () => void;
  /** 이 단원에서 선택한 반이 아직 안 받은 문항 수 — 0이거나 이력이 없으면 undefined */
  unassignedCount?: number;
  onPickUnassigned?: () => void;
  unitLabel: string;
  /** 파트를 골라 목록이 그 조각으로 좁혀진 상태 */
  partActive?: boolean;
  /** 툴바 오른쪽 「분할하기」 세그먼트 */
  partCountControl?: ReactNode;
  /** 목록 위 파트 탭 줄 */
  partTabs?: ReactNode;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const showToolbar =
    showItems && totalCount !== undefined && totalCount > 0 && onToggleAll;

  return (
    <div className="py-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[13px] font-semibold text-[#16181D]">{title}</span>
        {/* 「n/m개 출제」 대신 **이번에 나갈 수**만. 파트를 고르면 총계는 아래 안내문에만 남는다 */}
        {showItems && submitCount !== undefined ? (
          <span
            className={`rounded-[6px] px-2 py-0.5 text-[11px] font-bold ${
              submitCount > 0
                ? "bg-[#EAF6FE] text-[#1AA7F2]"
                : "bg-[#F1F3F6] text-[#9CA3AF]"
            }`}
          >
            {submitCount}문항
          </span>
        ) : null}
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${title} ${open ? "접기" : "펼치기"}`}
          onClick={() => setOpen((prev) => !prev)}
          className="ml-auto inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-[16px] font-semibold leading-none text-[#9CA3AF] outline-none transition-colors hover:bg-[#F1F3F6] hover:text-[#4B5563] focus:outline-none focus-visible:bg-[#F1F3F6]"
        >
          <span
            aria-hidden
            className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}
          >
            ›
          </span>
        </button>
      </div>
      {/* 접으면 유형 선택·툴바·문항 목록을 모두 숨긴다 */}
      {open ? (
        <>
          <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
            <span className="shrink-0 text-[12px] font-medium text-[#6B7280]">
              유형 선택
            </span>
            {/* 「전체」는 나머지를 한꺼번에 켜고 끄는 마스터라 같은 체크박스로 두면 5개 중 하나로 읽힌다 */}
            <button
              type="button"
              aria-pressed={Boolean(typeOn[0])}
              aria-label={`${title} 유형 전체 ${typeOn[0] ? "해제" : "선택"}`}
              onClick={() => onToggle(0)}
              className={`h-7 shrink-0 cursor-pointer rounded-full border px-3.5 text-[12px] font-semibold transition-colors ${
                typeOn[0]
                  ? "border-[#1AA7F2] bg-[#1AA7F2] text-white"
                  : "border-[#D5D7DD] bg-white text-[#4B5563] hover:border-[#9DD9F8] hover:bg-[#F8FCFF]"
              }`}
            >
              {options[0]}
            </button>
            <span className="h-[18px] w-px shrink-0 bg-[#ECECEF]" aria-hidden />
            {options.slice(1).map((label, i) => (
              <CheckToggle
                key={label}
                checked={typeOn[i + 1] ?? false}
                onChange={() => onToggle(i + 1)}
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
          {showToolbar ? (
            <>
              <div className="my-3 border-t border-[#ECECEF]" />
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
                {/*
                  파트를 고르면 총계와 「전체 선택」을 함께 숨긴다.
                  제출되는 건 그 파트뿐이라 단원 전체를 가리키는 숫자·버튼이 같이 있으면 어긋나 보인다.
                  단원 전체로 돌아가려면 오른쪽 「분할하기 → 안 나눔」을 누르면 된다.
                */}
                {partActive ? null : (
                  <>
                    <span className="shrink-0 text-[13px] font-bold text-[#16181D]">
                      <span className="text-[#1AA7F2]">{selectedCount ?? 0}</span> /{" "}
                      {totalCount} 선택
                    </span>
                    <ToolbarButton onClick={onToggleAll}>
                      {allSelected ? "전체 해제" : "전체 선택"}
                    </ToolbarButton>
                  </>
                )}
                {restCount && restCount > 0 && onToggleRest ? (
                  <ToolbarButton onClick={onToggleRest} active={showRest}>
                    {showRest
                      ? "미선택 숨기기"
                      : `미선택 ${restCount}${unitLabel} 보기`}
                  </ToolbarButton>
                ) : null}
                {/*
                  균등분할 대신 쓰는 「직접 분할」 — 등분 수를 계산하지 않고 아직 안 낸 것을 그대로 집는다.
                  **분할을 안 나눴을 때만** 띄운다. 파트를 고른 상태에서는 파트가 이미 이번에 낼
                  묶음을 정하고 있어서, 두 기준이 같은 줄에서 경쟁하면 무엇이 적용됐는지 알 수 없다.
                  부여 이력이 없으면(반 미선택·첫 출제) 쓸모가 없으므로 역시 띄우지 않는다.
                */}
                {onPickUnassigned && unassignedCount !== undefined ? (
                  <ToolbarButton onClick={onPickUnassigned}>
                    아직 안 낸 {unassignedCount}
                    {unitLabel} 선택
                  </ToolbarButton>
                ) : null}
                {partCountControl ? (
                  <div className="ml-auto">{partCountControl}</div>
                ) : null}
              </div>
              {partTabs ?? <div className="mb-3 mt-3 border-t border-[#ECECEF]" />}
            </>
          ) : null}
          {children ? <div className="mt-3">{children}</div> : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * 「분할하기」 — 이 카테고리를 몇 등분할지.
 *
 * 누르면 곧바로 1파트가 적용되고, 어느 파트를 낼지는 아래 `PartTabs`에서 고른다.
 * 과제를 여러 개 만드는 게 아니라 지금 화면의 선택만 바꾸는 보조 도구다.
 *
 * ## 기본은 접혀 있다
 *
 * 대부분의 출제는 단원을 나누지 않는다. 그런데 `[안 나눔][2][3][4]`를 늘 펼쳐 두면
 * 툴바에 숫자 네 개가 상시로 앉아 **뭔가 골라야 하는 것처럼** 보인다. 그래서 평소에는
 * **「분할하기」 하나만** 두고, 누를 때 `2·3·4`를 편다.
 *
 * **`안 나눔`은 나눠 놓았을 때만 보인다.** 안 나눈 상태에서는 그게 이미 지금 상태라
 * 보여 줄 이유가 없고, 나눈 뒤에는 **되돌아올 유일한 길**이라 반드시 있어야 한다
 * (파트 보기에서 단원 전체로 나오는 길은 이것뿐이다 — uiux.md §3 「파트 나누기」).
 */
function PartCountControl({
  guideAnchor,
  categoryLabel,
  parts,
  totalCount,
  minPerPart,
  locked,
  onChangeParts,
  onUnlock,
}: {
  /** 시작 가이드가 짚을 자리 — 첫 카테고리(단어)에만 준다 */
  guideAnchor?: string;
  categoryLabel: string;
  parts: number;
  totalCount: number;
  minPerPart: number;
  /** 등분 수 잠금 — 바꾸면 이미 낸 파트와 조각이 어긋난다 */
  locked: boolean;
  onChangeParts: (parts: number) => void;
  onUnlock: () => void;
}) {
  const max = maxPartsFor(totalCount, minPerPart);
  const lockReason = `이미 ${parts}개로 나눠 낸 단원이에요. 등분 수를 바꾸면 이전에 낸 파트와 범위가 어긋납니다.`;
  const split = parts > 1;
  const [open, setOpen] = useState(false);
  /* 나눠 놓았으면 늘 펼쳐 둔다 — 지금 몇 등분인지 안 보이면 안 된다 */
  const expanded = open || split || locked;
  /** 안 나눈 상태에서만 접을 수 있다(접어도 값은 그대로) */
  const counts = Array.from({ length: MAX_PARTS }, (_, i) => i + 1).filter(
    (count) => count > 1 || split,
  );

  return (
    <div className="flex flex-col items-end gap-1" data-guide={guideAnchor}>
      <div className="flex items-center gap-2">
      <button
        type="button"
        aria-expanded={expanded}
        aria-label="분할하기. 나눠 낸 뒤 다음 파트는 반 홈에서 이어서 내기로 고를 수 있어요."
        title="한 단원을 여러 수업에 나눠 낼 때 씁니다. 나눠 낸 뒤 다음 파트는 반 홈에서 「이어서 내기」로 고를 수 있어요."
        onClick={() => setOpen((v) => !v)}
        disabled={split || locked}
        className={`shrink-0 rounded-[7px] px-1.5 py-1 text-[12px] font-medium transition-colors ${
          split || locked
            ? "cursor-default text-[#6B7280]"
            : expanded
              ? "cursor-pointer text-[#16181D]"
              : "cursor-pointer text-[#6B7280] hover:bg-[#F1F3F6] hover:text-[#16181D]"
        }`}
      >
        분할하기
      </button>
      {!expanded ? null : locked ? (
        <>
          <span
            title={lockReason}
            className="flex h-7 items-center gap-1 rounded-[7px] border border-[#D5D7DD] bg-[#F3F4F6] px-2.5 text-[12px] font-semibold text-[#4B5563]"
          >
            <svg width="9" height="11" viewBox="0 0 9 11" fill="none" aria-hidden>
              <path
                d="M2 4.5V3a2.5 2.5 0 1 1 5 0v1.5"
                stroke="#6B7280"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <rect
                x="0.9"
                y="4.4"
                width="7.2"
                height="6"
                rx="1.4"
                fill="#6B7280"
              />
            </svg>
            {parts}개로 고정
          </span>
          <button
            type="button"
            onClick={onUnlock}
            className="h-7 cursor-pointer rounded-[7px] px-1.5 text-[11px] font-semibold text-[#9CA3AF] underline underline-offset-2 transition-colors hover:text-[#4B5563]"
          >
            다시 정하기
          </button>
        </>
      ) : (
        <div className="flex items-center gap-[2px] rounded-[9px] bg-[#F1F3F6] p-[3px]">
          {counts.map((count) => {
            const reason = partSplitDisabledReason({
              categoryLabel,
              totalCount,
              minPerPart,
              parts: count,
            });
            const disabled = count > max || reason !== null;
            const on = parts === count;
            return (
              <button
                key={count}
                type="button"
                disabled={disabled}
                title={reason ?? undefined}
                aria-label={
                  count === 1
                    ? `${categoryLabel} 나누지 않기`
                    : `${categoryLabel} ${count}개로 나누기`
                }
                aria-pressed={on}
                onClick={() => onChangeParts(count)}
                className={`h-7 min-w-[34px] rounded-[7px] px-2.5 text-[12px] font-semibold transition-colors ${
                  on
                    ? "bg-[#1AA7F2] text-white shadow-[0_1px_2px_rgba(26,167,242,0.35)]"
                    : disabled
                      ? "cursor-not-allowed text-[#C4C7CE]"
                      : "cursor-pointer text-[#4B5563] hover:bg-white hover:text-[#16181D]"
                }`}
              >
                {count === 1 ? "안 나눔" : count}
              </button>
            );
          })}
        </div>
      )}
      </div>
      {expanded ? (
        <p className="max-w-[240px] text-right text-[11px] leading-snug text-[#9CA3AF]">
          다음 파트는 반 홈 「이어서 내기」
        </p>
      ) : null}
    </div>
  );
}

/**
 * 파트 탭 — 등분 수를 정하면 그만큼 **자동으로 생긴다.**
 *
 * 한 탭에 버튼이 둘이다.
 * - 왼쪽 동그라미 = 이번 과제에 낼 파트. **한 번에 하나만** 고른다. 다시 누르면 해제.
 * - 오른쪽 라벨(파트 줄) = 눌러도 **그 파트가 켜진다.** 목록도 그 조각으로 좁혀진다.
 *   (파트가 하나뿐인 지금 「보기」와 「출제」를 갈라 둘 이유가 없다. 다만 라벨로는
 *    끄지 않는다 — 끄는 건 동그라미의 몫)
 *
 * 저장되는 파트는 고른 번호(`partChecked`)이고, 보고 있는 파트(`partView`)는 화면 필터다.
 *
 * **여러 파트를 한꺼번에 고르는 건 걷어냈다**(2026-08-31). 1·2파트를 함께 체크해 놓고
 * 부여 화면에서 며칠에 나눠 내는 흐름을 없애기로 했다 — 한 번 제출은 한 파트다.
 */
function PartTabs({
  categoryLabel,
  unitLabel,
  parts,
  viewPart,
  checkedIndices,
  partSizes,
  doneIndices,
  onSelectPart,
  onToggleChecked,
}: {
  categoryLabel: string;
  unitLabel: string;
  parts: number;
  /** 지금 목록에 띄운 파트 — 보기 전용 */
  viewPart: number | null;
  /** 이번에 낼 파트 번호들 — 체크박스 상태이자 저장될 파트 */
  checkedIndices: number[];
  totalCount: number;
  partSizes: number[];
  /** 이 반에 이미 부여한 파트 번호 — 「이어서 내기」로 들어왔을 때만 채워진다 */
  doneIndices: number[];
  onSelectPart: (index: number) => void;
  onToggleChecked: (index: number) => void;
}) {
  if (parts <= 1) return null;
  return (
    <div className="mt-3 flex flex-wrap items-end justify-between gap-x-5 gap-y-1 border-b border-[#ECECEF]">
      <div className="flex flex-wrap" role="tablist">
        {Array.from({ length: parts }, (_, i) => i + 1).map((index) => {
          const on = viewPart === index;
          const checked = checkedIndices.includes(index);
          const done = doneIndices.includes(index);
          const size = partSizes[index - 1] ?? 0;
          const doneTitle = done
            ? `${categoryLabel} ${index}파트는 이미 이 반에 부여했어요.`
            : undefined;
          return (
            <div
              key={index}
              role="presentation"
              className={`-mb-px flex items-center gap-1.5 border-b-2 pl-2.5 pr-3.5 transition-colors ${
                on ? "border-[#1AA7F2]" : "border-transparent"
              }`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={`${categoryLabel} ${index}파트 출제${done ? " (이미 부여함)" : ""}`}
                title={
                  doneTitle ??
                  (checked
                    ? `${categoryLabel} ${index}파트 선택 해제`
                    : `${categoryLabel} ${index}파트를 이번 과제로 내기`)
                }
                onClick={() => onToggleChecked(index)}
                className="flex cursor-pointer items-center py-2.5"
              >
                <ItemCheck checked={checked} />
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={on}
                aria-label={`${categoryLabel} ${index}파트 내기 (${size}${unitLabel}${done ? " · 이미 부여함" : ""})`}
                title={doneTitle}
                onClick={() => onSelectPart(index)}
                className={`cursor-pointer py-2.5 text-[13px] font-semibold transition-colors ${
                  on
                    ? "text-[#1AA7F2]"
                    : checked
                      ? "text-[#16181D]"
                      : "text-[#6B7280] hover:text-[#16181D]"
                }`}
              >
                {index}파트
                <span
                  className={`ml-1.5 text-[11px] font-medium ${
                    on ? "text-[#5FA8CE]" : "text-[#9CA3AF]"
                  }`}
                >
                  {done ? "부여" : `${size}${unitLabel}`}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <p className="max-w-[280px] pb-2 text-right text-[11.5px] leading-relaxed text-[#9CA3AF]">
        {checkedIndices.length > 0 ? (
          <>
            이번에는{" "}
            <span className="font-semibold text-[#4B5563]">
              이 파트 하나만
            </span>{" "}
            나갑니다
          </>
        ) : (
          <>
            <span className="font-semibold text-[#4B5563]">낼 파트 하나</span>를
            골라 주세요
          </>
        )}
      </p>
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

/**
 * 항목 행의 아이콘 버튼.
 *
 * 글자 버튼(`수정`/`미리보기`)이면 한 단원에 20~30개가 깔려 파란 덩어리가 된다.
 * 평소엔 회색 아이콘으로 물러나 있고 hover에서만 드러나게 한다.
 * 라벨은 `aria-label`·`title`로 남겨 스크린리더·툴팁에서 그대로 읽힌다.
 */
function RowIconButton({
  onClick,
  ariaLabel,
  title,
  children,
}: {
  onClick?: () => void;
  ariaLabel: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-[7px] text-[#9CA3AF] transition-colors hover:bg-white hover:text-[#1AA7F2] hover:shadow-[0_0_0_1px_#E5E7EB]"
    >
      {children}
    </button>
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
    <RowIconButton onClick={onClick} ariaLabel={ariaLabel} title="미리보기">
      <svg
        width="15"
        height="15"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden
      >
        <path d="M1.6 10S4.7 4.6 10 4.6 18.4 10 18.4 10 15.3 15.4 10 15.4 1.6 10 1.6 10z" />
        <circle cx="10" cy="10" r="2.4" />
      </svg>
    </RowIconButton>
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
    <RowIconButton onClick={onClick} ariaLabel={ariaLabel} title="수정">
      <svg
        width="15"
        height="15"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12.6 3.4a1.7 1.7 0 0 1 2.4 0l1.6 1.6a1.7 1.7 0 0 1 0 2.4L7.5 16.5 3 17.5l1-4.5z" />
      </svg>
    </RowIconButton>
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

/**
 * 「이 반에 이미 낸 문항」 배지.
 *
 * 색만으로 구분하지 않는다 — 선택 상태가 이미 파란 왼쪽 바를 쓰고 있어서
 * 두 상태를 색으로 겹치면 뭉갠다. 아이콘+글자로 알리고 배경은 톤만 낮춘다
 * (AGENTS.md 「disabled/incorrect 상태는 색만으로 표현 금지」).
 */
function AssignedBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-[5px] bg-[#EEF0F3] px-1.5 py-0.5 text-[11px] font-semibold text-[#6B7280]">
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path
          d="M1.8 6.2 4.4 8.8 10.2 3"
          stroke="#6B7280"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </span>
  );
}

function BankItemRow({
  id,
  number,
  checked,
  assignedLabel,
  dimmed,
  locked,
  onPointerDownSelect,
  onPointerEnterSelect,
  onPreview,
  previewLabel,
  onEdit,
  editLabel,
  children,
}: {
  id: string;
  /** 단원(교과서) 순서 번호 — 1부터. 파트·부여 정렬과 무관 */
  number: number;
  checked: boolean;
  /** 이미 낸 반 이름 — 없으면 배지를 달지 않는다 */
  assignedLabel?: string | null;
  /** 선택한 반이 전부 받은 문항 — 목록 아래로 내려가고 톤을 낮춘다 */
  dimmed?: boolean;
  /**
   * 선택을 손으로 못 바꾸는 상태 — **파트로 나눠 놓았을 때**.
   * 무엇이 나갈지는 고른 파트가 정한다. 수정·미리보기는 그대로 열린다.
   */
  locked?: boolean;
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
      className={`relative select-none overflow-hidden rounded-[8px] border py-1.5 pl-2.5 pr-1.5 transition-colors ${
        checked
          ? "border-[#E3E8EF] bg-[#EAF6FE]"
          : dimmed
            ? "border-[#EDEFF2] border-dashed bg-[#F7F8FA]"
            : "border-transparent bg-white"
      }`}
      onPointerEnter={locked ? undefined : () => onPointerEnterSelect(id)}
    >
      {/* 선택 표시는 왼쪽 3px 바로. 행 전체를 파란 테두리로 두르면 목록이 통째로 파래진다 */}
      {checked ? (
        <span
          className="absolute inset-y-0 left-0 w-[3px] bg-[#1AA7F2]"
          aria-hidden
        />
      ) : null}
      <div className="flex w-full items-start gap-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-disabled={locked || undefined}
          title={
            locked
              ? "파트로 나눠 낼 때는 고른 파트가 문항을 정합니다. 「분할하기 → 안 나눔」으로 되돌리면 직접 고를 수 있어요."
              : undefined
          }
          onPointerDown={
            locked ? undefined : (e) => onPointerDownSelect(id, checked, e)
          }
          className={`flex min-w-0 flex-1 items-start gap-1.5 text-left ${
            locked ? "cursor-default" : "hover:opacity-90"
          }`}
        >
          <ItemCheck checked={checked} />
          {number > 0 ? (
            <span
              className={`mt-px w-6 shrink-0 text-right text-[12px] font-semibold tabular-nums leading-[14px] ${
                dimmed && !checked ? "text-[#C4C7CE]" : "text-[#9CA3AF]"
              }`}
            >
              {number}
            </span>
          ) : null}
          <span className={`min-w-0 ${dimmed && !checked ? "opacity-65" : ""}`}>
            {assignedLabel ? (
              <span className="mb-1 block">
                <AssignedBadge label={assignedLabel} />
              </span>
            ) : null}
            {children}
          </span>
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
  /** 「펼치기」에 붙는 단위 — 파트를 보고 있으면 `이 파트 3개 더`가 된다 */
  moreLabel,
  emptyText = "이 단원에 등록된 항목이 없습니다.",
  /** 목록 뒤에 붙는 「미선택」 묶음 */
  rest,
  children,
}: {
  total: number;
  expanded: boolean;
  onToggle: () => void;
  moreLabel?: (hidden: number) => string;
  emptyText?: string;
  rest?: ReactNode;
  children: ReactNode;
}) {
  if (total === 0) {
    return (
      <div>
        <p className="rounded-[10px] border border-dashed border-[#E5E7EB] bg-[#FAFAFB] px-3 py-3 text-center text-[12px] text-[#9497A0]">
          {emptyText}
        </p>
        {rest}
      </div>
    );
  }

  const hidden = total - PREVIEW_ROWS;
  return (
    <div>
      <ul className="space-y-1 rounded-[10px] border border-[#ECECEF] bg-[#FAFAFB] p-1.5">
        {children}
      </ul>
      {/* 펼치기는 지금 보고 있는 묶음이 4개를 넘을 때만 — 파트를 보고 있으면 그 파트 기준 */}
      {hidden > 0 ? (
        <button
          type="button"
          onClick={onToggle}
          className="mt-2 w-full cursor-pointer rounded-[8px] border border-[#E5E7EB] bg-white py-1.5 text-[12px] font-medium text-[#4B5563] hover:bg-[#F9FAFB]"
        >
          {expanded
            ? "접기"
            : (moreLabel?.(hidden) ?? `펼치기 (${hidden}개 더)`)}
        </button>
      ) : null}
      {rest}
    </div>
  );
}

/** 세 목록이 공통으로 받는 것 — 무엇을 보여줄지는 호출부가 파트로 잘라서 넘긴다 */
type BankListOwnProps<T> = {
  /** 지금 보여줄 묶음. 파트를 골랐으면 **그 파트 조각만** 들어온다 */
  items: T[];
  /** 파트 밖의 나머지 — 「미선택 n개 보기」를 눌렀을 때만 아래에 붙는다 */
  restItems: T[];
  showRest: boolean;
  /** 「펼치기」 문구 앞에 붙는 범위 — 파트를 보고 있으면 `이 파트 ` */
  scopeLabel: string;
  expanded: boolean;
  selectedIds: Set<string>;
  onSetItem: (id: string, selected: boolean) => void;
  onToggleExpand: () => void;
  onPreviewItem?: (item: T) => void;
  onEditItem?: (item: T) => void;
  /** 이미 낸 반 이름 배지 — 낸 적이 없으면 null */
  assignedLabel: (id: string) => string | null;
  /** 선택한 반이 전부 받은 문항인지 — 이미 아래로 정렬돼 넘어온다 */
  isDone: (id: string) => boolean;
  /** 단원(교과서) 순서 번호 — 1부터 */
  itemNumber: (id: string) => number;
  /** 파트로 나눠 놓았다 — 체크는 파트가 정하므로 손으로 못 바꾼다 */
  locked?: boolean;
};

/**
 * 단어·문장·문법 목록의 공통 뼈대.
 *
 * 세 목록은 **행 안에 무엇을 그리는지**만 다르다. 선택 표시·드래그 선택·펼치기·
 * 「미선택」 묶음은 전부 여기서 한 번만 처리해 세 곳이 따로 어긋나지 않게 한다.
 */
function BankList<T extends { id: string }>({
  items,
  restItems,
  showRest,
  scopeLabel,
  expanded,
  selectedIds,
  onSetItem,
  onToggleExpand,
  onPreviewItem,
  onEditItem,
  assignedLabel,
  isDone,
  itemNumber,
  locked,
  unitLabel,
  previewLabel,
  editLabel,
  renderItem,
}: BankListOwnProps<T> & {
  /** 개수 단위 — 단어·문법은 `개`, 문장은 `문장` */
  unitLabel: string;
  previewLabel: (item: T) => string;
  editLabel: (item: T) => string;
  renderItem: (item: T) => ReactNode;
}) {
  const { onRowPointerDown, onRowPointerEnter } = useDragSelect(onSetItem);
  const visible = expanded ? items : items.slice(0, PREVIEW_ROWS);
  const renderRow = (item: T) => (
    <BankItemRow
      key={item.id}
      id={item.id}
      number={itemNumber(item.id)}
      checked={selectedIds.has(item.id)}
      assignedLabel={assignedLabel(item.id)}
      dimmed={isDone(item.id)}
      locked={locked}
      onPointerDownSelect={onRowPointerDown}
      onPointerEnterSelect={onRowPointerEnter}
      onPreview={onPreviewItem ? () => onPreviewItem(item) : undefined}
      previewLabel={previewLabel(item)}
      onEdit={onEditItem ? () => onEditItem(item) : undefined}
      editLabel={editLabel(item)}
    >
      {renderItem(item)}
    </BankItemRow>
  );

  return (
    <ExpandableList
      total={items.length}
      expanded={expanded}
      onToggle={onToggleExpand}
      moreLabel={(hidden) => `펼치기 (${scopeLabel}${hidden}${unitLabel} 더)`}
      emptyText={
        restItems.length > 0
          ? "이 파트에 고른 항목이 없습니다."
          : "이 단원에 등록된 항목이 없습니다."
      }
      rest={
        showRest && restItems.length > 0 ? (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-[#9CA3AF]">
              <span className="shrink-0">
                미선택 {restItems.length}
                {unitLabel}
              </span>
              <span className="h-px flex-1 bg-[#ECECEF]" aria-hidden />
            </div>
            <ul className="space-y-1 rounded-[10px] border border-[#ECECEF] bg-[#FAFAFB] p-1.5">
              {restItems.map(renderRow)}
            </ul>
          </div>
        ) : null
      }
    >
      {visible.map(renderRow)}
    </ExpandableList>
  );
}

function WordBankList(props: BankListOwnProps<ProblemWord>) {
  return (
    <BankList
      {...props}
      unitLabel="개"
      previewLabel={(item) => `${item.english} 미리보기`}
      editLabel={(item) => `${item.english} 수정`}
      renderItem={(item) => (
        <span className="text-[17px] leading-relaxed">
          <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="font-medium text-[#16181D]">{item.english}</span>
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
      )}
    />
  );
}

function SentenceBankList(props: BankListOwnProps<ProblemSentence>) {
  return (
    <BankList
      {...props}
      unitLabel="문장"
      previewLabel={() => "문장 미리보기"}
      editLabel={() => "문장 수정"}
      renderItem={(item) => (
        <span className="text-[16px] leading-relaxed">
          <span className="block font-medium text-[#16181D]">
            {item.english}
          </span>
          {item.chunksKo ? (
            <span className="mt-1 block text-[#6B7280]">{item.chunksKo}</span>
          ) : null}
          {item.chunksEn ? (
            <span className="mt-1 block text-[15px] text-[#9CA3AF]">
              청크: {item.chunksEn}
            </span>
          ) : null}
        </span>
      )}
    />
  );
}

function GrammarBankList(props: BankListOwnProps<ProblemGrammar>) {
  return (
    <BankList
      {...props}
      unitLabel="개"
      previewLabel={() => "문법 미리보기"}
      editLabel={() => "문법 수정"}
      renderItem={(item) => (
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
      )}
    />
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
  /**
   * 반 홈 「진행 중인 단원」의 **이어서 내기**로 들어온 경우의 프리셋.
   *
   * `window.location.search`를 직접 읽으면 클라이언트 라우팅 도중 URL이 아직 안 바뀐
   * 시점에 렌더될 수 있어 비어 나온다. `useSearchParams()`가 정확하다
   * (그래서 `ProblemsManagementOverlay`가 이 컴포넌트를 Suspense로 감싼다).
   *
   * **한 번 쓰고 비우면 안 된다** — StrictMode에서 effect가 두 번 도는데, 두 번째 실행이
   * 프리셋을 못 찾고 전부 기본값으로 되돌려 버린다. 단원이 일치하는 동안 계속 유효하게 두고
   * 적용 자체를 멱등하게 만든다.
   */
  const searchParams = useSearchParams();
  const router = useRouter();
  const searchKey = searchParams.toString();
  const partPreset = useMemo(() => readPartPreset(searchKey), [searchKey]);

  /**
   * 문제 제출 화면은 **열 때마다 빈 상태**로 시작한다.
   * 예전엔 과제 부여 초안(sessionStorage)을 복원해 유형·반·파트·문항이
   * 전에 체크한 그대로 남아 「설정이 안 지워진다」로 보였다.
   * 제출하기를 누를 때만 `saveAssignDraft`로 부여 화면에 넘긴다.
   */
  useEffect(() => {
    clearAssignDraft();
  }, []);

  const [rangeValues, setRangeValues] = useState<Record<string, string>>(() => {
    if (partPreset) {
      return {
        grade: partPreset.grade,
        book: partPreset.textbook,
        unit: partPreset.unit,
      };
    }
    const grade = GRADE_OPTIONS[0];
    return {
      grade,
      book: getTextbookOptions(grade)[0],
      unit: UNIT_OPTIONS[0],
    };
  });
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [wordTypeOn, setWordTypeOn] = useState(() =>
    defaultTypeState(WORD_TYPE_OPTIONS.length),
  );
  const [sentenceTypeOn, setSentenceTypeOn] = useState(() =>
    defaultTypeState(SENTENCE_TYPE_OPTIONS.length),
  );
  const [grammarTypeOn, setGrammarTypeOn] = useState(() =>
    defaultTypeState(GRAMMAR_TYPE_OPTIONS.length),
  );
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [classesLoaded, setClassesLoaded] = useState(false);
  // 「이어서 내기」로 왔으면 그 반을 받는 반으로 미리 골라 둔다
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>(() =>
    partPreset?.classId ? [partPreset.classId] : [],
  );
  /**
   * 「이어서 내기」로 들어온 기준 반 — **해제할 수 없다.**
   * 진도(다음 파트)와 「부여됨」 표시가 전부 이 반 기준으로 계산돼 있어서,
   * 이 반을 빼면 화면에 남은 숫자들이 전부 다른 반 얘기가 돼 버린다.
   * 다른 반을 **추가**하는 건 막지 않는다(같은 진도를 두 반에 함께 내는 경우).
   */
  const pinnedClassId = partPreset?.classId ?? null;
  /** 부여 이력 조인용 — 부여가 끝나면 다시 읽어 목록에 바로 반영한다 */
  const [historyTick, setHistoryTick] = useState(0);
  const [editingProblemSet, setEditingProblemSet] =
    useState<SavedProblemSet | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(
    null
  );
  const [addKind, setAddKind] = useState<AddProblemKind | null>(null);
  const [editingItem, setEditingItem] = useState<EditingProblemItem | null>(
    null,
  );
  const [customBankTick, setCustomBankTick] = useState(0);
  /** 받는 반 아래 「본문 / 본문 뜻」 — 단원 단어를 추적해 예문을 쓰고, 문장으로 나눈다 */
  const [passageEn, setPassageEn] = useState(() =>
    partPreset
      ? loadUnitPassage({
          grade: partPreset.grade,
          textbook: partPreset.textbook,
          unit: partPreset.unit,
        }).english
      : "",
  );
  const [passageKo, setPassageKo] = useState(() =>
    partPreset
      ? loadUnitPassage({
          grade: partPreset.grade,
          textbook: partPreset.textbook,
          unit: partPreset.unit,
        }).korean
      : "",
  );
  const [passageApplyNote, setPassageApplyNote] = useState("");
  const [passageApplyError, setPassageApplyError] = useState("");
  const prevPassageRangeKeyRef = useRef<string | null>(null);
  const skipPassageAutosaveRef = useRef(true);
  const passageDraftRef = useRef({
    rangeKey: "",
    unitSelected: false,
    english: "",
    korean: "",
  });
  const [expanded, setExpanded] = useState({
    word: false,
    sentence: false,
    grammar: false,
  });
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedSentenceIds, setSelectedSentenceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedGrammarIds, setSelectedGrammarIds] = useState<Set<string>>(
    () => new Set(),
  );
  /** 카테고리별 등분 수 — 1이면 나누지 않음 */
  const [partCounts, setPartCounts] = useState<PartCounts>(DEFAULT_PART_COUNTS);
  /** 「이어서 내기」로 들어온 경우 이 반에 이미 부여한 파트 번호 */
  const [partDone, setPartDone] = useState<PartDoneIndices>(DEFAULT_PART_DONE);
  /** 등분 수 잠금 — 이미 나눠 낸 단원은 바꾸면 이전 파트와 범위가 어긋난다 */
  const [partLocks, setPartLocks] = useState<PartLocks>(DEFAULT_PART_LOCKS);
  /**
   * 카테고리별로 **지금 목록에 띄운 파트**. 보기 전용이라 저장에는 쓰지 않는다.
   * 탭 라벨을 누르면 바뀐다.
   */
  const [partView, setPartView] =
    useState<PartSelection>(DEFAULT_PART_SELECTION);
  /**
   * 카테고리별로 **이번에 낼 파트** — 탭 왼쪽 동그라미가 이 상태다.
   * 값은 배열이지만 **최대 한 개**만 담는다(저장 형식을 그대로 두려고 배열을 유지).
   *
   * 파트는 「단원을 n등분한 정확한 조각」이 아니라 **교사가 이번에 낸다고 고른 이름표**로 다룬다.
   * 그래서 파트를 체크한 뒤 「미선택」에서 항목을 더 담거나 몇 개를 빼도 체크는 유지된다.
   * 대가로 파트 = 조각이라는 보장이 사라지므로 「이어서 내기」가 다음 파트를 넘겨줄 때
   * 이미 낸 항목이 다시 포함될 수 있다 (uiux.md §2.3 「파트 = 이름표」).
   */
  const [partChecked, setPartChecked] =
    useState<PartChecked>(DEFAULT_PART_CHECKED);
  /** 파트 밖 항목을 목록 아래에 펼쳐 둘지 — 파트에 없는 걸 추가할 때 쓴다 */
  const [showRest, setShowRest] = useState<Record<PartCategory, boolean>>({
    words: false,
    sentences: false,
    grammar: false,
  });

  const SELECTED_ID_SETTERS: Record<
    PartCategory,
    Dispatch<SetStateAction<Set<string>>>
  > = {
    words: setSelectedWordIds,
    sentences: setSelectedSentenceIds,
    grammar: setSelectedGrammarIds,
  };

  const setSelectedIdsFor = (category: PartCategory, next: Set<string>) =>
    SELECTED_ID_SETTERS[category](next);

  /** 고정된 등분 수를 교사가 일부러 다시 정하겠다고 할 때만 푼다 */
  const unlockPartCount = (category: PartCategory) =>
    setPartLocks((prev) => ({ ...prev, [category]: false }));

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

  const toggleClass = (id: string) => {
    // 「이어서 내기」 기준 반은 해제 불가 — 화면의 진도·부여 표시가 이 반 기준이다
    if (id === pinnedClassId) return;
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

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
  /*
    카테고리마다 유형을 하나라도 골랐는지. 0번은 「전체」 알약이라 뺀다.

    **고른 문항이 있어도 그 카테고리 유형을 안 고르면 그 부분은 나가지 않는다.**
    단어를 16개 골라 놓고 문법 유형만 켠 채 제출하면 단어는 조용히 빠진다 —
    제출 전에 막는다.
  */
  const wordTypeChosen = hasChosenType(wordTypeOn, WORD_TYPE_OPTIONS);
  const sentenceTypeChosen = hasChosenType(sentenceTypeOn, SENTENCE_TYPE_OPTIONS);
  const grammarTypeChosen = hasChosenType(grammarTypeOn, GRAMMAR_TYPE_OPTIONS);
  /* 시작 가이드가 「유형을 골랐는지」를 보는 값 — 전부 해제로 시작한다 */
  const anyTypeSelected =
    wordTypeChosen || sentenceTypeChosen || grammarTypeChosen;
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
    () =>
      classes.filter(
        (c) => (c.grade ?? "") === selectedGrade || isMixedGrade(c.grade),
      ),
    [classes, selectedGrade]
  );

  const rangeKey = `${rangeValues.grade}|${rangeValues.book}|${rangeValues.unit}`;
  const passageScope = {
    grade: rangeValues.grade ?? GRADE_OPTIONS[0],
    textbook: rangeValues.book ?? getTextbookOptions(GRADE_OPTIONS[0])[0],
    unit: rangeValues.unit ?? UNIT_OPTIONS[0],
  };
  passageDraftRef.current = {
    rangeKey,
    unitSelected,
    english: passageEn,
    korean: passageKo,
  };

  useEffect(() => {
    const prevKey = prevPassageRangeKeyRef.current;
    if (prevKey && prevKey !== rangeKey) {
      const [grade = "", textbook = "", unit = ""] = prevKey.split("|");
      saveUnitPassage(
        { grade, textbook, unit },
        passageEn,
        passageKo,
      );
    }
    prevPassageRangeKeyRef.current = rangeKey;
    skipPassageAutosaveRef.current = true;
    if (!unitSelected) {
      setPassageEn("");
      setPassageKo("");
    } else {
      const saved = loadUnitPassage(passageScope);
      setPassageEn(saved.english);
      setPassageKo(saved.korean);
    }
    // 단원이 바뀐 뒤 이전 칸 값을 새 범위에 쓰지 않도록, 이 렌더의 passageEn/Ko만 닫는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, unitSelected]);

  useEffect(() => {
    if (skipPassageAutosaveRef.current) {
      skipPassageAutosaveRef.current = false;
      return;
    }
    if (!unitSelected) return;
    const timer = window.setTimeout(() => {
      saveUnitPassage(passageScope, passageEn, passageKo);
    }, 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passageEn, passageKo, rangeKey, unitSelected]);

  useEffect(() => {
    return () => {
      const draft = passageDraftRef.current;
      if (!draft.unitSelected) return;
      // 마운트 직후 빈 칸으로 저장하면 단원에 넣어 둔 본문이 지워진다.
      // StrictMode 재마운트·페이지 이동이 로드보다 먼저 일어나면 둘 다 빈 값이다.
      if (!draft.english.trim() && !draft.korean.trim()) return;
      const [grade = "", textbook = "", unit = ""] = draft.rangeKey.split("|");
      saveUnitPassage(
        { grade, textbook, unit },
        draft.english,
        draft.korean,
      );
    };
  }, []);

  useEffect(() => {
    setExpanded({ word: false, sentence: false, grammar: false });
    // 단원이 바뀌면 파트 나누기도 처음 상태로 — 항목 수가 달라 그대로 쓸 수 없다
    setPartCounts(DEFAULT_PART_COUNTS);
    setPartView(DEFAULT_PART_SELECTION);
    setPartChecked(DEFAULT_PART_CHECKED);
    setShowRest({ words: false, sentences: false, grammar: false });
    setPartDone(DEFAULT_PART_DONE);
    setPartLocks(DEFAULT_PART_LOCKS);
    setPassageApplyNote("");
    setPassageApplyError("");
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

    // 「이어서 내기」로 들어왔고 단원이 일치하면 전체 선택 대신 다음 파트만 고른다.
    // 프리셋을 소비해서 비우지 않고 **단원 일치로만** 판단한다 —
    // StrictMode에서 effect가 두 번 도는데, 두 번째에 프리셋이 비어 있으면 전부 기본값으로 되돌아간다.
    const preset =
      !matchesSavedRange &&
      partPreset !== null &&
      partPreset.grade === rangeValues.grade &&
      partPreset.textbook === rangeValues.book &&
      partPreset.unit === rangeValues.unit
        ? partPreset
        : null;
    if (preset) {
      setPartCounts(preset.counts);
      setPartView(preset.selection);
      setPartChecked(
        PART_CATEGORIES.reduce((acc, category) => {
          const index = preset.selection[category];
          acc[category] = index === null ? [] : [index];
          return acc;
        }, {} as PartChecked),
      );
      setPartDone(preset.done);
      setPartLocks(preset.locks);
      // 지난번에 낸 문제 유형을 그대로 복원한다
      const reference = preset.refProblemSetId
        ? loadProblemSets().find((item) => item.id === preset.refProblemSetId)
        : undefined;
      if (reference) {
        setWordTypeOn(
          savedTypeState(WORD_TYPE_OPTIONS, reference.problemTypes.words),
        );
        setSentenceTypeOn(
          savedTypeState(
            SENTENCE_TYPE_OPTIONS,
            reference.problemTypes.sentences,
          ),
        );
        setGrammarTypeOn(
          savedTypeState(GRAMMAR_TYPE_OPTIONS, reference.problemTypes.grammar),
        );
      } else {
        setWordTypeOn(defaultTypeState(WORD_TYPE_OPTIONS.length));
        setSentenceTypeOn(defaultTypeState(SENTENCE_TYPE_OPTIONS.length));
        setGrammarTypeOn(defaultTypeState(GRAMMAR_TYPE_OPTIONS.length));
      }
    } else if (matchesSavedRange && editingProblemSet) {
      setWordTypeOn(
        savedTypeState(WORD_TYPE_OPTIONS, editingProblemSet.problemTypes.words),
      );
      setSentenceTypeOn(
        savedTypeState(
          SENTENCE_TYPE_OPTIONS,
          editingProblemSet.problemTypes.sentences,
        ),
      );
      setGrammarTypeOn(
        savedTypeState(
          GRAMMAR_TYPE_OPTIONS,
          editingProblemSet.problemTypes.grammar,
        ),
      );
    } else {
      // 단원을 새로 고른 경우 — 유형 체크도 전부 해제
      setWordTypeOn(defaultTypeState(WORD_TYPE_OPTIONS.length));
      setSentenceTypeOn(defaultTypeState(SENTENCE_TYPE_OPTIONS.length));
      setGrammarTypeOn(defaultTypeState(GRAMMAR_TYPE_OPTIONS.length));
    }

    const pickIds = (category: PartCategory, allIds: string[]): string[] => {
      // 단원을 막 고른 시점에는 **아무것도 체크하지 않는다.**
      // 전체가 켜진 채로 시작하면 교사가 지우는 쪽으로 일해야 하고,
      // 실수로 단원을 통째로 내기도 쉽다 (uiux.md §2.3 「항목 선택 기본값 = 전부 해제」).
      if (!preset) return [];
      const index = preset.selection[category];
      // 「이어서 내기」인데 낼 파트가 정해지지 않은 카테고리(이미 다 냈거나 나눈 적 없음)는
      // 전체를 체크해 두면 실수로 통째로 다시 내기 쉽다 → 비워 두고 교사가 고르게 한다
      if (index === null) return [];
      return partSlice(allIds, preset.counts[category], index);
    };

    setSelectedWordIds(
      new Set(
        matchesSavedRange
          ? editingProblemSet.items.words
          : pickIds(
              "words",
              content.words.map((w) => w.id),
            ),
      ),
    );
    setSelectedSentenceIds(
      new Set(
        matchesSavedRange
          ? editingProblemSet.items.sentences
          : pickIds(
              "sentences",
              content.sentences.map((s) => s.id),
            ),
      ),
    );
    setSelectedGrammarIds(
      new Set(
        matchesSavedRange
          ? editingProblemSet.items.grammar
          : pickIds(
              "grammar",
              content.grammar.map((g) => g.id),
            ),
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

  const applyPassageToProblems = () => {
    setPassageApplyError("");
    setPassageApplyNote("");
    if (!unitSelected) {
      setPassageApplyError(
        "단원을 먼저 선택해 주세요. 저장된 단원 단어·문장과 맞춰요.",
      );
      return;
    }
    const english = passageEn.trim();
    const korean = passageKo.trim();
    if (!english) {
      setPassageApplyError("본문을 입력해 주세요.");
      return;
    }
    if (!korean) {
      setPassageApplyError("본문 뜻을 입력해 주세요.");
      return;
    }

    const scope = {
      grade: rangeValues.grade ?? GRADE_OPTIONS[0],
      textbook: rangeValues.book ?? getTextbookOptions(GRADE_OPTIONS[0])[0],
      unit: rangeValues.unit ?? UNIT_OPTIONS[0],
    };
    const { pairs, enCount, koCount } = pairPassageSentences(english, korean);
    if (pairs.length === 0) {
      setPassageApplyError("문장으로 나눌 본문이 없어요.");
      return;
    }

    const content = getUnitContent(scope);
    const matchedWords = matchUnitWordsInPassage(content.words, english);
    const prefix = passageSentenceIdPrefix(scope);
    const existingIds: string[] = [];
    const toCreate: CustomSentenceInput[] = [];
    for (const pair of pairs) {
      const found = findExistingSentence(
        content.sentences,
        pair.english,
        prefix,
      );
      if (found) {
        existingIds.push(found.id);
      } else {
        toCreate.push({
          ...scope,
          english: pair.english,
          korean: pair.korean,
        });
      }
    }

    const created = replaceCustomSentencesByPrefix(prefix, toCreate);
    for (const word of matchedWords) {
      const example = passageExampleForWord(pairs, word.english);
      if (!example) continue;
      upsertCustomWord(word, {
        grade: word.grade,
        textbook: word.textbook,
        unit: word.unit,
        english: word.english,
        korean: word.korean,
        exampleEn: example.exampleEn,
        exampleKo: example.exampleKo,
      });
    }
    setCustomBankTick((tick) => tick + 1);

    setSelectedWordIds((prev) => {
      const next = new Set(prev);
      for (const word of matchedWords) next.add(word.id);
      return next;
    });
    setSelectedSentenceIds((prev) => {
      const next = new Set(prev);
      for (const id of [...next]) {
        if (id.startsWith(prefix) && !created.some((item) => item.id === id)) {
          next.delete(id);
        }
      }
      for (const id of existingIds) next.add(id);
      for (const item of created) next.add(item.id);
      return next;
    });
    setExpanded((prev) => ({ ...prev, word: true, sentence: true }));

    const mismatch =
      koCount !== enCount
        ? ` 영어 ${enCount}문장 · 한글 ${koCount}문장이라 앞에서부터 맞춰 두었어요.`
        : "";
    const wordPart =
      matchedWords.length > 0
        ? `단원 단어 ${matchedWords.length}개를 골라 본문 문장을 예문에 넣었어요.`
        : "본문에 단원 단어가 없어 단어는 고르지 않았어요.";
    const sentenceCount = existingIds.length + created.length;
    setPassageApplyNote(
      `${wordPart} 본문을 ${sentenceCount}문장으로 나눠 문장 문항에 넣었어요.${mismatch}`,
    );
    saveUnitPassage(scope, passageEn, passageKo);
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

  // 파트는 **단원 전체 항목**을 문제은행(교과서) 순서로 나눈다 — 선택 개수를 기준으로 하면
  // 파트를 고를 때마다 풀이 줄어들어 2파트를 다시 못 고른다.
  const unitItemIds: Record<PartCategory, string[]> = {
    words: wordIds,
    sentences: sentenceIds,
    grammar: grammarIds,
  };
  const wordMatchEnabled = isWordMatchTypeEnabled(wordTypeOn);
  const partMinPerPart: Record<PartCategory, number> = {
    words: minItemsPerPart("words", wordMatchEnabled),
    sentences: minItemsPerPart("sentences", wordMatchEnabled),
    grammar: minItemsPerPart("grammar", wordMatchEnabled),
  };
  // 짝맞추기를 나중에 켜면 이미 고른 등분 수가 불가능해질 수 있어 매 렌더 보정한다
  const effectivePartCounts = PART_CATEGORIES.reduce((acc, category) => {
    acc[category] = Math.min(
      partCounts[category],
      maxPartsFor(unitItemIds[category].length, partMinPerPart[category]),
    );
    return acc;
  }, {} as PartCounts);
  const partSizes = PART_CATEGORIES.reduce(
    (acc, category) => {
      acc[category] = splitIntoParts(
        unitItemIds[category],
        effectivePartCounts[category],
      ).map((chunk) => chunk.length);
      return acc;
    },
    {} as Record<PartCategory, number[]>,
  );

  /**
   * 「받는 반」에 이미 낸 문항 — 목록 정렬·부여 배지·「안 낸 것만 담기」의 근거.
   * 저장소를 새로 두지 않고 부여 기록 × 문제집 문항 id를 조인해 파생한다.
   */
  const assignedHistory = useMemo(
    () =>
      buildItemAssignmentHistory({
        assignments: loadClassAssignments(),
        problemSets: loadProblemSets(),
        classIds: selectedClassIds,
      }),
    // historyTick은 localStorage를 다시 읽으라는 **수동 신호**다 — 값 자체는 쓰지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedClassIds, historyTick],
  );
  /**
   * 이미 나눠 낸 단원이면 「이어서 내기」로 안내한다.
   * URL 프리셋으로 들어온 경우에는 이미 그 상태라 배너를 중복으로 두지 않는다.
   */
  const continueFromSplit = useMemo(() => {
    if (partPreset) return null;
    if (!unitSelected || selectedClassIds.length === 0) return null;
    const assignments = loadClassAssignments();
    const sets = loadProblemSets();
    for (const classId of selectedClassIds) {
      const units = visibleUnitPartProgress(sets, assignments, classId);
      const match = units.find(
        (unit) =>
          unit.grade === rangeValues.grade &&
          unit.textbook === rangeValues.book &&
          unit.unit === rangeValues.unit,
      );
      if (match) return { classId, unit: match };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    partPreset,
    unitSelected,
    selectedClassIds,
    rangeValues.grade,
    rangeValues.book,
    rangeValues.unit,
    historyTick,
  ]);
  const classNameById = useMemo(
    () => new Map(classes.map((item) => [item.id, item.name])),
    [classes],
  );
  /** 선택한 반이 **전부** 받은 문항인지 — 목록에서 아래로 내릴 기준 */
  const isDoneItem = (id: string) =>
    isAssignedToAllClasses(assignedHistory, id, selectedClassIds);
  const itemAssignedLabel = (id: string) =>
    assignedBadgeLabel(assignedHistory, id, classNameById);
  /**
   * 화면 표시 순서만 바꾼다. **파트를 자르는 `unitItemIds`는 건드리지 않는다** —
   * 파트는 문제은행(교과서) 순서로 잘라야 진도와 맞는다.
   */
  const sortDoneLast = <T extends { id: string }>(items: T[]): T[] => {
    if (selectedClassIds.length === 0) return items;
    const done: T[] = [];
    const todo: T[] = [];
    for (const item of items) (isDoneItem(item.id) ? done : todo).push(item);
    return [...todo, ...done];
  };

  /** 지금 목록에 띄운 파트 — 등분 수를 낮추면 범위를 벗어날 수 있어 함께 보정한다 */
  const effectivePartView = PART_CATEGORIES.reduce((acc, category) => {
    const index = partView[category];
    acc[category] =
      effectivePartCounts[category] > 1 &&
      index !== null &&
      index <= effectivePartCounts[category]
        ? index
        : null;
    return acc;
  }, {} as PartSelection);

  /** 이번에 낼 파트들 — 등분 수를 줄이면 범위 밖 번호가 남을 수 있어 걸러낸다 */
  const effectivePartChecked = PART_CATEGORIES.reduce((acc, category) => {
    acc[category] =
      effectivePartCounts[category] > 1
        ? [...new Set(partChecked[category])]
            .filter((index) => index >= 1 && index <= effectivePartCounts[category])
            .sort((a, b) => a - b)
        : [];
    return acc;
  }, {} as PartChecked);

  /**
   * 카테고리별로 **지금 목록에 보여줄 항목**과 그 밖에 남은 항목.
   * 파트를 고르지 않았으면 단원 전체가 그대로 목록이 된다.
   */
  const partScopedItems = PART_CATEGORIES.reduce(
    (acc, category) => {
      const view = effectivePartView[category];
      const ids =
        view === null
          ? null
          : new Set(
              partSlice(
                unitItemIds[category],
                effectivePartCounts[category],
                view,
              ),
            );
      acc[category] = ids;
      return acc;
    },
    {} as Record<PartCategory, Set<string> | null>,
  );

  const scopeFor = <T extends { id: string }>(
    category: PartCategory,
    items: T[],
  ): { items: T[]; rest: T[] } => {
    const ids = partScopedItems[category];
    if (!ids) return { items: sortDoneLast(items), rest: [] };
    return {
      items: sortDoneLast(items.filter((item) => ids.has(item.id))),
      rest: sortDoneLast(items.filter((item) => !ids.has(item.id))),
    };
  };

  const wordScope = scopeFor("words", unitContent.words);
  const sentenceScope = scopeFor("sentences", unitContent.sentences);
  const grammarScope = scopeFor("grammar", unitContent.grammar);

  /** 탭 라벨 클릭 — **보기만** 바꾼다. 무엇을 낼지는 옆 체크박스가 정한다 */
  /**
   * 파트 줄(라벨)을 눌렀다 — **보기와 함께 그 파트를 켠다.**
   *
   * 파트를 한 번에 하나만 내게 된 뒤로 「보기」와 「출제」를 갈라 둘 이유가 없어졌다.
   * 줄을 눌렀는데 목록만 바뀌고 정작 낼 파트는 그대로면 「눌렀는데 왜 안 바뀌지」가 된다.
   * 이미 켜진 파트를 다시 누르면 **끄지 않는다** — 끄는 건 왼쪽 동그라미의 몫이다.
   */
  const viewPart = (category: PartCategory, index: number) => {
    setShowRest((prev) => ({ ...prev, [category]: false }));
    if (effectivePartChecked[category].includes(index)) {
      setPartView((prev) => ({ ...prev, [category]: index }));
      return;
    }
    togglePartChecked(category, index);
  };

  /**
   * 낼 파트 고르기 — **한 번에 하나만.**
   *
   * 이미 고른 파트를 다시 누르면 해제된다. 다른 파트를 누르면 **갈아탄다** —
   * 앞서 고른 파트의 항목은 선택에서 빼고 새 파트의 항목만 담는다.
   * (여러 파트를 함께 담아 며칠에 나눠 내던 흐름은 2026-08-31에 걷어냈다)
   */
  const togglePartChecked = (category: PartCategory, index: number) => {
    const sliceOf = (part: number) =>
      partSlice(unitItemIds[category], effectivePartCounts[category], part);
    const on = effectivePartChecked[category].includes(index);
    const previous = effectivePartChecked[category].flatMap(sliceOf);
    const next = on ? [] : sliceOf(index);

    setPartChecked((prev) => ({ ...prev, [category]: on ? [] : [index] }));
    SELECTED_ID_SETTERS[category]((prev) => {
      const ids = new Set(prev);
      for (const id of previous) ids.delete(id);
      for (const id of next) ids.add(id);
      return ids;
    });
    // 방금 건드린 파트를 바로 보여준다
    setPartView((prev) => ({ ...prev, [category]: index }));
  };

  /**
   * 저장될 파트 정보 — 교사가 **고른 파트**를 그대로 적는다(최대 하나).
   * 「미선택」에서 더 담았거나 몇 개를 뺐어도 고른 파트는 유지된다.
   */
  const problemSetParts = buildProblemSetParts(
    effectivePartCounts,
    effectivePartChecked,
  );

  /**
   * 빠른 제출 확인 팝업 — 「지금부터 다음 수업 전까지」로 낼 계획을 보여 준다.
   * 날짜를 고르는 화면을 건너뛰므로 **무엇이 언제까지인지 한 번은 보여 준다.**
   */
  const [quickPlans, setQuickPlans] = useState<QuickAssignPlan[] | null>(null);
  const [quickBusy, setQuickBusy] = useState(false);
  /*
    결과를 **팝업 안에서** 알린다. 아래 초록 문구(`submitDone`)에 기대면 안 된다 —
    과제를 올리면 반 목록이 다시 읽히고, 그때 `submitDone`을 되돌리는 효과가 돌아
    메시지가 뜨자마자 사라진다.
  */
  const [quickDone, setQuickDone] = useState(false);

  /**
   * 제출을 막는 이유 — 없으면 `null`. **제출하기와 빠른 제출이 같은 규칙을 쓴다.**
   * 규칙이 갈라지면 한쪽에서만 막히는 문항이 생긴다.
   */
  const submitBlockReason = (): string | null => {
    if (!unitSelected) return "단원을 먼저 선택해 주세요.";
    if (selectedClassIds.length === 0) return "받는 반을 선택해 주세요.";
    const selectedItemCount =
      selectedWordIds.size + selectedSentenceIds.size + selectedGrammarIds.size;
    if (selectedItemCount === 0) {
      return "출제할 문제를 하나 이상 선택해 주세요.";
    }
    /*
      **고른 문항이 있는 카테고리마다** 유형이 있어야 한다.
      전체에서 하나만 보면, 단어를 골라 놓고 문법 유형만 켠 채 제출해도
      통과해 버리고 단어는 조용히 빠진다.
    */
    const typeMissing = [
      selectedWordIds.size > 0 && !wordTypeChosen ? "단어" : null,
      selectedSentenceIds.size > 0 && !sentenceTypeChosen ? "문장" : null,
      selectedGrammarIds.size > 0 && !grammarTypeChosen ? "문법" : null,
    ].filter((label): label is string => label !== null);
    if (typeMissing.length > 0) {
      return `${typeMissing.join("·")}에서 문제 유형을 선택해 주세요. 문항을 골라도 유형을 안 고르면 그 부분은 학생 앱에 나가지 않아요.`;
    }
    return wordMatchSubmitError(wordTypeOn, selectedWordCount);
  };

  /** 지금 화면 상태로 만든 문제 세트 입력 */
  const buildPendingInput = (): CreateProblemSetInput => ({
    grade: rangeValues.grade,
    textbook: rangeValues.book,
    unit: rangeValues.unit,
    ...(problemSetParts ? { part: problemSetParts } : null),
    assignedClassIds: [...selectedClassIds],
    // 문제은행(교과서) 순서로 저장해야 파트 순서·진도와 맞는다
    items: {
      words: wordIds.filter((id) => selectedWordIds.has(id)),
      sentences: sentenceIds.filter((id) => selectedSentenceIds.has(id)),
      grammar: grammarIds.filter((id) => selectedGrammarIds.has(id)),
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

  /**
   * 빠른 제출 — 날짜 고르는 화면을 건너뛰고 **지금 바로** 낸다.
   *
   * 칩(파트별 날짜 배치)을 만들지 않으므로 묶음은 하나뿐이고, 각 반에 그 반의
   * 다음 수업 전까지로 마감을 잡는다. 반마다 다음 수업이 다르므로 마감도 반마다 다르다.
   */
  const runQuickAssign = async (plans: QuickAssignPlan[]) => {
    setQuickBusy(true);
    setSubmitError("");
    const nowIso = new Date().toISOString();
    const pendingInput = buildPendingInput();
    const result = await publishProblemsAssign({
      pendingInput,
      result: {
        groups: [
          {
            chips: [],
            assignments: plans.map((plan) => ({
              problemSetId: "",
              classId: plan.classId,
              lessonDate: plan.lessonDate,
              deadlineDate: plan.deadlineDate,
              deadlineTime: plan.deadlineTime,
              deadlineUntilNextLesson: true,
              // 지금 내주는 것이므로 수업 종료를 기다리지 않고 바로 연다
              openAt: nowIso,
            })),
          },
        ],
        types: {},
        excludedKeys: [],
      },
      context: { unitItemIds, partCounts: effectivePartCounts },
      editingProblemSet: editingProblemSet ?? null,
    });
    setQuickBusy(false);
    if (!result.ok) {
      setQuickPlans(null);
      setSubmitError(result.message);
      return;
    }
    clearAssignDraft();
    const homeHref = assignedClassHomeHref(selectedClassIds, pinnedClassId);
    if (homeHref) {
      router.push(homeHref);
      return;
    }
    setQuickDone(true);
  };

  /** 「분할하기」 클릭 — 나누면 1파트를 바로 적용, 안 나눔이면 파트 표시를 해제 */
  const changePartCount = (category: PartCategory, parts: number) => {
    setPartCounts((prev) => ({ ...prev, [category]: parts }));
    setShowRest((prev) => ({ ...prev, [category]: false }));
    if (parts <= 1) {
      setPartView((prev) => ({ ...prev, [category]: null }));
      setPartChecked((prev) => ({ ...prev, [category]: [] }));
      return;
    }
    setSelectedIdsFor(
      category,
      new Set(partSlice(unitItemIds[category], parts, 1)),
    );
    setPartView((prev) => ({ ...prev, [category]: 1 }));
    setPartChecked((prev) => ({ ...prev, [category]: [1] }));
  };

  /** 「전체 선택/해제」 — 단원 전체가 대상이므로 파트 화면에서 빠져나온다 */
  const toggleAllInCategory = (
    category: PartCategory,
    ids: string[],
    allSelected: boolean,
  ) => {
    setPartView((prev) => ({ ...prev, [category]: null }));
    setPartChecked((prev) => ({ ...prev, [category]: [] }));
    setShowRest((prev) => ({ ...prev, [category]: false }));
    toggleAllIds(SELECTED_ID_SETTERS[category], ids, allSelected);
  };

  const toggleRest = (category: PartCategory) =>
    setShowRest((prev) => ({ ...prev, [category]: !prev[category] }));

  /**
   * 「아직 안 낸 n개 선택」 — 균등분할 대신 **이력으로** 이번에 낼 묶음을 집는다.
   * 분할을 안 나눴을 때만 쓸 수 있으므로 등분 수·파트는 건드릴 것이 없다.
   */
  const pickUnassigned = (category: PartCategory) => {
    setSelectedIdsFor(
      category,
      new Set(
        pickUnassignedIds(
          unitItemIds[category],
          assignedHistory,
          selectedClassIds,
        ),
      ),
    );
    setPartView((prev) => ({ ...prev, [category]: null }));
    setShowRest((prev) => ({ ...prev, [category]: false }));
  };

  /**
   * 버튼에 쓸 「아직 안 낸」 개수. 버튼을 띄우지 않는 경우:
   * - **분할을 나눈 상태** — 파트가 이미 이번에 낼 묶음을 정하고 있어 기준이 둘이 되면 안 된다
   * - 받는 반을 아직 안 골랐을 때 — 이력을 계산할 기준이 없다
   * - 전부 안 냈으면(=첫 출제) 「전체 선택」과 같고, 하나도 안 남았으면 누를 이유가 없다
   */
  const unassignedCountFor = (category: PartCategory): number | undefined => {
    if (selectedClassIds.length === 0) return undefined;
    if (effectivePartCounts[category] > 1) return undefined;
    const total = unitItemIds[category].length;
    const count = pickUnassignedIds(
      unitItemIds[category],
      assignedHistory,
      selectedClassIds,
    ).length;
    return count === 0 || count === total ? undefined : count;
  };

  /** 제출 요약 — 카테고리마다 이번에 나갈 문항 수와 (나눴다면) 파트 번호 */
  const selectedCountByCategory: Record<PartCategory, number> = {
    words: selectedWordCount,
    sentences: selectedSentenceCount,
    grammar: selectedGrammarCount,
  };
  const submitBreakdown = PART_CATEGORIES.map((category) => {
    // 보고 있는 파트가 아니라 **체크한 파트**를 적는다 — 저장되는 값과 같아야 한다
    const checked = effectivePartChecked[category];
    return {
      category,
      label: PART_LABEL[category],
      count: selectedCountByCategory[category],
      partLabel: checked.length === 0 ? null : `${checked.join("·")}파트`,
    };
  });
  const submitTotalCount = submitBreakdown.reduce(
    (sum, row) => sum + row.count,
    0,
  );

  /** 카테고리별 유형 체크 상태 — 과제 부여 화면에 그대로 넘긴다 */
  const typeOptionsByCategory: Record<PartCategory, readonly string[]> = {
    words: WORD_TYPE_OPTIONS,
    sentences: SENTENCE_TYPE_OPTIONS,
    grammar: GRAMMAR_TYPE_OPTIONS,
  };
  const typeOnByCategory: Record<PartCategory, Record<number, boolean>> = {
    words: wordTypeOn,
    sentences: sentenceTypeOn,
    grammar: grammarTypeOn,
  };

  /**
   * 과제 부여 화면에 보여줄 「낼 문제」 — 문항이 0인 카테고리는 탭이 생기지 않는다.
   * 파트·유형까지 함께 넘겨 그 화면에서 이번 과제만 조정할 수 있게 한다.
   */
  /** 부여 칩 문항 수 = 선택 문항 ∩ 파트 조각 (은행 전체 조각 크기가 아님) */
  const selectedIdsByCategory: Record<PartCategory, Set<string>> = {
    words: selectedWordIds,
    sentences: selectedSentenceIds,
    grammar: selectedGrammarIds,
  };

  const assignContents: AssignContentRow[] = submitBreakdown
    .filter((row) => row.count > 0)
    .map((row) => {
      const category = row.category;
      const totalParts = effectivePartCounts[category];
      const options = typeOptionsByCategory[category];
      const selected = selectedIdsByCategory[category];
      const checkedParts = [...effectivePartChecked[category]];
      /**
       * 파트를 **체크하지 않고** 문항만 손으로 고른 경우(사용자 지정 선택).
       * 분할 숫자만 남아 있으면 부여 화면이 파트 칩을 만들려다
       * `checkedParts=[]` 때문에 칩이 0개가 된다 → 카테고리 칩(안 나눔)으로 넘긴다.
       */
      const usePartChips = totalParts > 1 && checkedParts.length > 0;
      return {
        key: category,
        label: row.label,
        partLabel: usePartChips ? row.partLabel : null,
        count: row.count,
        // 「전체」는 옵션 목록의 0번 — 체크박스로 내보내지 않는다
        parts: usePartChips
          ? Array.from({ length: totalParts }, (_, index) => {
              const partIndex = index + 1;
              const slice = partSlice(
                unitItemIds[category],
                totalParts,
                partIndex,
              );
              return {
                index: partIndex,
                count: slice.filter((id) => selected.has(id)).length,
              };
            })
          : undefined,
        checkedParts: usePartChips ? checkedParts : undefined,
        types: options.filter((_, index) => index > 0),
        checkedTypes: options.filter(
          (_, index) => index > 0 && typeOnByCategory[category][index],
        ),
      };
    });

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
      <section
        className="rounded-[14px] border border-[#E8E8EA] bg-white px-3.5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        data-guide="problem-range"
        data-guide-done={unitSelected ? "true" : undefined}
      >
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
      <section
        className="rounded-[14px] border border-[#E8E8EA] bg-white px-3.5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        data-guide="problem-classes"
        data-guide-done={selectedClassIds.length > 0 ? "true" : undefined}
      >
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
              const pinned = cls.id === pinnedClassId;
              return (
                <button
                  key={cls.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={
                    pinned
                      ? `${cls.name} · 이어서 내기 기준 반 (해제할 수 없음)`
                      : `${cls.name} ${on ? "선택 해제" : "선택"}`
                  }
                  title={
                    pinned
                      ? "「이어서 내기」로 들어온 반이에요. 진도와 부여 표시가 이 반 기준이라 해제할 수 없어요."
                      : undefined
                  }
                  onClick={() => toggleClass(cls.id)}
                  className={`flex h-10 min-w-[112px] items-center gap-2 rounded-[10px] border px-3 text-[13px] font-semibold outline-none transition-all focus:outline-none focus-visible:outline-none ${
                    pinned ? "cursor-default" : "cursor-pointer"
                  } ${
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
                  {/* 기준 반은 체크박스 대신 자물쇠 — 눌러도 안 풀린다는 걸 모양으로 알린다 */}
                  {pinned ? (
                    <span
                      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center"
                      aria-hidden
                    >
                      <svg width="10" height="12" viewBox="0 0 9 11" fill="none">
                        <path
                          d="M2 4.5V3a2.5 2.5 0 1 1 5 0v1.5"
                          stroke="#1274A9"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                        />
                        <rect
                          x="0.9"
                          y="4.4"
                          width="7.2"
                          height="6"
                          rx="1.4"
                          fill="#1274A9"
                        />
                      </svg>
                    </span>
                  ) : (
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
                  )}
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

      {continueFromSplit ? (
        <div className="flex items-center justify-between gap-3 rounded-[12px] border border-[#BAE6FD] bg-[#F0F9FF] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[#1274A9]">
              이 단원을 나눠 내고 있어요
            </p>
            <p className="mt-0.5 text-[12px] text-[#4B7285]">
              다음 파트를 미리 고른 채로 이어서 낼 수 있어요.
            </p>
          </div>
          <Link
            href={continueUnitHref(
              continueFromSplit.unit,
              continueFromSplit.classId,
            )}
            className="shrink-0 rounded-[8px] border border-[#BAE6FD] bg-white px-3 py-1.5 text-[12px] font-bold text-[#1274A9] outline-none transition-colors hover:border-[#1AA7F2] hover:bg-[#E0F2FE] focus-visible:ring-2 focus-visible:ring-[#1AA7F2]"
          >
            이어서 내기 →
          </Link>
        </div>
      ) : null}

      {/* 3 본문 — 단원 단어 추적 + 문장 분할 */}
      <section className="rounded-[14px] border border-[#E8E8EA] bg-white px-3.5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="mb-1">
          <SectionHeading n={3} title="본문" />
        </div>
        <p className="mb-3 ml-7 text-[12px] text-[#9CA3AF]">
          {unitSelected
            ? "본문에 단원 단어가 있으면 그 문장을 예문에 넣고, 본문은 문장으로 나눠 나가요."
            : "단원을 고른 뒤 본문을 넣으면 단원 단어·문장과 맞춰요."}
        </p>
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-semibold text-[#4B5563]">
            본문
          </span>
          <textarea
            value={passageEn}
            onChange={(event) => {
              setPassageEn(event.target.value);
              setPassageApplyError("");
            }}
            disabled={!unitSelected}
            placeholder={`예)\nI woke up early because I had a math test today.\nAlthough I was a little nervous, I did my best during the exam.`}
            rows={4}
            aria-label="본문"
            className="w-full resize-y rounded-[12px] border border-[#E1E2E4] bg-[#FAFBFC] px-3.5 py-3 text-[14px] font-medium leading-relaxed text-[#15171A] outline-none placeholder:text-[#B0B4BB] focus:border-[#1AA7F2] focus:bg-white disabled:cursor-not-allowed disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF]"
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1.5 block text-[12px] font-semibold text-[#4B5563]">
            본문 뜻
          </span>
          <textarea
            value={passageKo}
            onChange={(event) => {
              setPassageKo(event.target.value);
              setPassageApplyError("");
            }}
            disabled={!unitSelected}
            placeholder={`영어와 같은 순서로 뜻을 적어 주세요.\n예)\n나는 오늘 수학 시험이 있어서 일찍 일어났다.\n조금 긴장했지만 시험 동안 최선을 다했다.`}
            rows={4}
            aria-label="본문 뜻"
            className="w-full resize-y rounded-[12px] border border-[#E1E2E4] bg-[#FAFBFC] px-3.5 py-3 text-[14px] font-medium leading-relaxed text-[#15171A] outline-none placeholder:text-[#B0B4BB] focus:border-[#1AA7F2] focus:bg-white disabled:cursor-not-allowed disabled:bg-[#F3F4F6] disabled:text-[#9CA3AF]"
          />
        </label>
        <p className="mt-2 text-[11px] font-medium text-[#9CA3AF]">
          영어·한글 모두 문장 수·순서를 맞춰 주세요. (줄바꿈, 마침표, 물음표,
          느낌표로 구분)
        </p>
        {passageApplyError ? (
          <p className="mt-2 text-[12px] font-medium text-[#C52B2B]">
            {passageApplyError}
          </p>
        ) : null}
        {passageApplyNote ? (
          <p className="mt-2 text-[12px] font-medium text-[#1274A9]">
            {passageApplyNote}
          </p>
        ) : null}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={!unitSelected || !passageEn.trim() || !passageKo.trim()}
            onClick={applyPassageToProblems}
            className={`h-10 rounded-[10px] px-4 text-[13px] font-bold ${
              unitSelected && passageEn.trim() && passageKo.trim()
                ? "bg-[#1AA7F2] text-white hover:bg-[#1596d9]"
                : "cursor-not-allowed bg-[#E5E7EB] text-[#6B7280]"
            }`}
          >
            문장으로 나누기
          </button>
        </div>
      </section>

      {/* 4 문제 구성 — 단원 지정 전 유형만 */}
      <section
        className="rounded-[14px] border border-[#E8E8EA] bg-white px-3.5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        data-guide="problem-types"
        data-guide-done={anyTypeSelected ? "true" : undefined}
      >
        <div className="mb-1">
          <SectionHeading n={4} title="문제 구성" />
        </div>
        <div className="divide-y divide-[#ECECEF]">
          <TypeSelectSection
            title="단어"
            options={WORD_TYPE_OPTIONS}
            typeOn={wordTypeOn}
            showItems={unitSelected}
            submitCount={selectedWordCount}
            selectedCount={selectedWordCount}
            totalCount={unitContent.words.length}
            allSelected={allWordsSelected}
            addLabel="+ 단어 추가"
            addDisabled={!unitSelected}
            onAdd={() => openAddModal("word")}
            unitLabel="개"
            partActive={effectivePartView.words !== null}
            restCount={wordScope.rest.length}
            showRest={showRest.words}
            onToggleRest={() => toggleRest("words")}
            unassignedCount={unassignedCountFor("words")}
            onPickUnassigned={() => pickUnassigned("words")}
            partCountControl={
              <PartCountControl
                guideAnchor="problem-split"
                categoryLabel="단어"
                parts={effectivePartCounts.words}
                totalCount={wordIds.length}
                minPerPart={partMinPerPart.words}
                locked={partLocks.words}
                onChangeParts={(parts) => changePartCount("words", parts)}
                onUnlock={() => unlockPartCount("words")}
              />
            }
            partTabs={
              <PartTabs
                categoryLabel="단어"
                unitLabel="개"
                parts={effectivePartCounts.words}
                viewPart={effectivePartView.words}
                checkedIndices={effectivePartChecked.words}
                totalCount={wordIds.length}
                partSizes={partSizes.words}
                doneIndices={partDone.words}
                onSelectPart={(index) => viewPart("words", index)}
                onToggleChecked={(index) => togglePartChecked("words", index)}
              />
            }
            onToggleAll={() =>
              toggleAllInCategory("words", wordIds, allWordsSelected)
            }
            onToggle={(i) =>
              setWordTypeOn((prev) =>
                toggleTypeOption(prev, i, WORD_TYPE_OPTIONS.length)
              )
            }
          >
            {unitSelected ? (
              <WordBankList
                assignedLabel={itemAssignedLabel}
                isDone={isDoneItem}
                itemNumber={(id) => wordIds.indexOf(id) + 1}
                locked={effectivePartCounts.words > 1}
                items={wordScope.items}
                restItems={wordScope.rest}
                showRest={showRest.words}
                scopeLabel={effectivePartView.words !== null ? "이 파트 " : ""}
                expanded={expanded.word}
                selectedIds={selectedWordIds}
                onSetItem={(id, selected) => {
                  setIdInSet(setSelectedWordIds, id, selected);
                }}
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
            submitCount={selectedSentenceCount}
            selectedCount={selectedSentenceCount}
            totalCount={unitContent.sentences.length}
            allSelected={allSentencesSelected}
            addLabel="+ 본문 추가"
            addDisabled={!unitSelected}
            onAdd={() => openAddModal("sentence")}
            unitLabel="문장"
            partActive={effectivePartView.sentences !== null}
            restCount={sentenceScope.rest.length}
            showRest={showRest.sentences}
            onToggleRest={() => toggleRest("sentences")}
            unassignedCount={unassignedCountFor("sentences")}
            onPickUnassigned={() => pickUnassigned("sentences")}
            partCountControl={
              <PartCountControl
                categoryLabel="문장"
                parts={effectivePartCounts.sentences}
                totalCount={sentenceIds.length}
                minPerPart={partMinPerPart.sentences}
                locked={partLocks.sentences}
                onChangeParts={(parts) => changePartCount("sentences", parts)}
                onUnlock={() => unlockPartCount("sentences")}
              />
            }
            partTabs={
              <PartTabs
                categoryLabel="문장"
                unitLabel="문장"
                parts={effectivePartCounts.sentences}
                viewPart={effectivePartView.sentences}
                checkedIndices={effectivePartChecked.sentences}
                totalCount={sentenceIds.length}
                partSizes={partSizes.sentences}
                doneIndices={partDone.sentences}
                onSelectPart={(index) => viewPart("sentences", index)}
                onToggleChecked={(index) =>
                  togglePartChecked("sentences", index)
                }
              />
            }
            onToggleAll={() =>
              toggleAllInCategory(
                "sentences",
                sentenceIds,
                allSentencesSelected,
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
                assignedLabel={itemAssignedLabel}
                isDone={isDoneItem}
                itemNumber={(id) => sentenceIds.indexOf(id) + 1}
                locked={effectivePartCounts.sentences > 1}
                items={sentenceScope.items}
                restItems={sentenceScope.rest}
                showRest={showRest.sentences}
                scopeLabel={
                  effectivePartView.sentences !== null ? "이 파트 " : ""
                }
                expanded={expanded.sentence}
                selectedIds={selectedSentenceIds}
                onSetItem={(id, selected) => {
                  setIdInSet(setSelectedSentenceIds, id, selected);
                }}
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
            submitCount={selectedGrammarCount}
            selectedCount={selectedGrammarCount}
            totalCount={unitContent.grammar.length}
            allSelected={allGrammarSelected}
            addLabel="+ 문법 추가"
            addDisabled={!unitSelected}
            onAdd={() => openAddModal("grammar")}
            unitLabel="개"
            partActive={effectivePartView.grammar !== null}
            restCount={grammarScope.rest.length}
            showRest={showRest.grammar}
            onToggleRest={() => toggleRest("grammar")}
            unassignedCount={unassignedCountFor("grammar")}
            onPickUnassigned={() => pickUnassigned("grammar")}
            partCountControl={
              <PartCountControl
                categoryLabel="문법"
                parts={effectivePartCounts.grammar}
                totalCount={grammarIds.length}
                minPerPart={partMinPerPart.grammar}
                locked={partLocks.grammar}
                onChangeParts={(parts) => changePartCount("grammar", parts)}
                onUnlock={() => unlockPartCount("grammar")}
              />
            }
            partTabs={
              <PartTabs
                categoryLabel="문법"
                unitLabel="개"
                parts={effectivePartCounts.grammar}
                viewPart={effectivePartView.grammar}
                checkedIndices={effectivePartChecked.grammar}
                totalCount={grammarIds.length}
                partSizes={partSizes.grammar}
                doneIndices={partDone.grammar}
                onSelectPart={(index) => viewPart("grammar", index)}
                onToggleChecked={(index) => togglePartChecked("grammar", index)}
              />
            }
            onToggleAll={() =>
              toggleAllInCategory("grammar", grammarIds, allGrammarSelected)
            }
            onToggle={(i) =>
              setGrammarTypeOn((prev) =>
                toggleTypeOption(prev, i, GRAMMAR_TYPE_OPTIONS.length)
              )
            }
          >
            {unitSelected ? (
              <GrammarBankList
                assignedLabel={itemAssignedLabel}
                isDone={isDoneItem}
                itemNumber={(id) => grammarIds.indexOf(id) + 1}
                locked={effectivePartCounts.grammar > 1}
                items={grammarScope.items}
                restItems={grammarScope.rest}
                showRest={showRest.grammar}
                scopeLabel={effectivePartView.grammar !== null ? "이 파트 " : ""}
                expanded={expanded.grammar}
                selectedIds={selectedGrammarIds}
                onSetItem={(id, selected) => {
                  setIdInSet(setSelectedGrammarIds, id, selected);
                }}
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

      {/* 제출 — 세 카테고리에서 이번에 나갈 문항을 한 줄로 합쳐 보여준다 */}
      {unitSelected ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[12px] border border-[#E8E8EA] bg-[#FBFCFD] px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {submitBreakdown.map((row) => (
              <span
                key={row.category}
                className={`inline-flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1 text-[12px] ${
                  row.count > 0
                    ? "border-[#E5E7EB] bg-white text-[#4B5563]"
                    : "border-[#EDEFF2] bg-[#F9FAFB] text-[#9CA3AF]"
                }`}
              >
                {row.label}
                {row.partLabel ? (
                  <span
                    className={`font-semibold ${
                      row.count > 0 ? "text-[#1AA7F2]" : "text-[#9CA3AF]"
                    }`}
                  >
                    {row.partLabel}
                  </span>
                ) : null}
                <b
                  className={`font-bold ${
                    row.count > 0 ? "text-[#16181D]" : "text-[#9CA3AF]"
                  }`}
                >
                  {row.count}문항
                </b>
              </span>
            ))}
          </div>
          <span className="text-[13px] text-[#4B5563]">
            총{" "}
            <b className="text-[15px] font-extrabold text-[#16181D]">
              {submitTotalCount}
            </b>
            문항
          </span>
        </div>
      ) : null}
      <div className="flex flex-col items-end gap-2 pt-1">
        {submitError ? (
          <p className="text-[13px] font-medium text-[#EF4444]">{submitError}</p>
        ) : null}
        {submitDone ? (
          <p className="text-right text-[13px] font-medium text-[#1B7A45]">
            {editingProblemSet
              ? "문제 구성을 반영하고 선택한 반에 과제를 부여했어요."
              : "선택한 반에 과제를 부여했어요."}
          </p>
        ) : null}
        {/* 두 버튼은 한 줄 — 시작 가이드도 이 줄을 통째로 짚어 둘 다 눌리게 한다 */}
        <div className="flex items-center gap-2" data-guide="problem-submit">
        <button
          type="button"
          disabled={submitting || !unitSelected || selectedClassIds.length === 0}
          onClick={() => {
            setSubmitError("");
            setSubmitDone(false);

            const reason = submitBlockReason();
            if (reason) {
              setSubmitError(reason);
              return;
            }

            const pendingInput = buildPendingInput();
            saveAssignDraft({
              v: 1,
              source: "problems",
              returnHref: "/teacher/problems",
              classIds: [...selectedClassIds],
              contents: assignContents,
              pendingInput,
              unitItemIds,
              partCounts: effectivePartCounts,
              editingProblemSetId: editingProblemSet?.id ?? null,
            });
            router.push("/teacher/problems/assign");
          }}
          className={`h-11 rounded-[10px] px-5 text-[14px] font-semibold transition-colors ${
            submitting || !unitSelected || selectedClassIds.length === 0
              ? "cursor-not-allowed bg-[#E5E7EB] text-[#6B7280]"
              : "bg-[#1AA7F2] text-white hover:bg-[#1596d9]"
          }`}
        >
          제출하기
        </button>
        <button
          type="button"
          disabled={submitting || !unitSelected || selectedClassIds.length === 0}
          onClick={() => {
            setSubmitError("");
            setSubmitDone(false);
            const reason = submitBlockReason();
            if (reason) {
              setSubmitError(reason);
              return;
            }
            const now = new Date();
            const plans = selectedClassIds
              .map((id) => classes.find((item) => item.id === id))
              .filter((item): item is TeacherClass => Boolean(item))
              .map((item) => ({ item, plan: planQuickAssign(item, now) }));
            /*
              다음 수업을 못 찾은 반이 있으면 **마감을 지어내지 않는다.**
              날짜를 직접 고르라고 돌려보내는 편이 낫다.
            */
            const missing = plans
              .filter(({ plan }) => plan === null)
              .map(({ item }) => item.name);
            if (missing.length > 0) {
              setSubmitError(
                `${missing.join("·")}의 다음 수업이 없어 마감을 정할 수 없어요. 「제출하기」로 날짜를 직접 정해 주세요.`,
              );
              return;
            }
            setQuickDone(false);
            setQuickPlans(
              plans
                .map(({ plan }) => plan)
                .filter((plan): plan is QuickAssignPlan => plan !== null),
            );
          }}
          className={`h-11 rounded-[10px] border px-5 text-[14px] font-semibold transition-colors ${
            submitting || !unitSelected || selectedClassIds.length === 0
              ? "cursor-not-allowed border-[#E5E7EB] bg-white text-[#C4C7CE]"
              : "border-[#1AA7F2] bg-white text-[#1274A9] hover:bg-[#F0F9FE]"
          }`}
        >
          빠른 제출하기
        </button>
        </div>
      </div>

      {quickPlans ? (
        <QuickAssignConfirm
          plans={quickPlans}
          busy={quickBusy}
          done={quickDone}
          onCancel={() => {
            setQuickPlans(null);
            setQuickDone(false);
          }}
          onConfirm={() => void runQuickAssign(quickPlans)}
        />
      ) : null}

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

/**
 * 빠른 제출 확인 — **무엇이 언제까지인지 한 번은 보여 준다.**
 *
 * 날짜 고르는 화면을 건너뛰는 버튼이라, 누르자마자 나가 버리면 선생님은 자기가
 * 무엇을 언제까지로 냈는지 모른 채 끝난다.
 */
function QuickAssignConfirm({
  plans,
  busy,
  done,
  onCancel,
  onConfirm,
}: {
  plans: QuickAssignPlan[];
  busy: boolean;
  /** 부여를 마쳤다 — 같은 팝업에서 결과를 알린다 */
  done: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/35 p-4"
      onClick={busy ? undefined : onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="빠른 제출 확인"
        className="w-full max-w-[420px] rounded-[18px] bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-[17px] font-bold text-[#15171A]">
          {done ? "과제를 냈어요" : "빠른 제출하기"}
        </h2>
        <p className="mt-2 text-[13.5px] font-medium leading-[1.6] text-[#4B5563]">
          {done
            ? "지금부터 학생 앱에 보입니다. 진행 상황은 반 화면의 「과제」 탭에서 볼 수 있어요."
            : "지금 바로 학생 앱에 나가고, 마감은 다음 수업 전까지로 잡혀요."}
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          {plans.map((plan) => (
            <li
              key={plan.classId}
              className="rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3.5 py-2.5"
            >
              <p className="text-[13px] font-bold text-[#15171A]">
                {plan.className}
              </p>
              <p className="mt-0.5 text-[12.5px] font-medium text-[#4B5563]">
                지금 → <b className="text-[#1274A9]">{formatDeadlineKo(plan)}</b>{" "}
                까지
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex gap-2">
          {done ? (
            <button
              type="button"
              onClick={onCancel}
              className="h-11 flex-1 rounded-[10px] bg-[#1AA7F2] text-[14px] font-bold text-white hover:bg-[#1596d9]"
            >
              닫기
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onCancel}
                className="h-11 flex-1 rounded-[10px] border border-[#D5D7DB] bg-white text-[14px] font-bold text-[#3D4148] hover:bg-[#F7F8F9] disabled:text-[#C4C7CE]"
              >
                취소
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                className="h-11 flex-1 rounded-[10px] bg-[#1AA7F2] text-[14px] font-bold text-white hover:bg-[#1596d9] disabled:bg-[#C4C4C4]"
              >
                {busy ? "부여하는 중…" : "부여하기"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
