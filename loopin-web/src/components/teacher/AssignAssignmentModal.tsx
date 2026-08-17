"use client";

import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";

import type { AssignDraftUi } from "@/lib/assign-draft";
import {
  isCalendarRedDay,
  loadAcademicSchedule,
} from "@/lib/calendar-academic-schedule";
import { getNextClassOccurrence } from "@/lib/calendar-layout";
import {
  loadOneOffLessons,
  toLocalIsoDate,
} from "@/lib/calendar-one-off-lessons";
import { CLASS_LAYOUT } from "@/lib/class-layout";
import type { CreateClassAssignmentInput } from "@/lib/class-assignments";
import { listLessonCandidates } from "@/lib/lesson-candidates";
import type { TeacherClass } from "@/lib/teacher-classes";

/**
 * 과제 부여 화면 (`assets/과제 부여.svg` · 왼쪽 트레이 `assets/part-assign-sidebar.svg`).
 *
 * 문제 제출 화면에서 「제출하기」를 누르면 이어지는 마지막 단계다.
 * 묻는 것은 셋 — **무엇을 낼지 · 어느 반에 · 언제까지**.
 *
 * - 「낼 문제」 카테고리·파트·유형 조정 UI는 없음 — 출제 화면에서 고른 값이 그대로 간다.
 * - 반 탭은 **캘린더(수업일)와 마감**만 바꾼다. 반마다 수업 요일이 달라서다.
 *
 * **파트별 따로 부여.** 반 탭 아래는 **월 네비(전체 너비) → 왼쪽 대기열 | 오른쪽 요일격자·마감** 가로 배치.
 * 왼쪽 패널은 `part-assign-sidebar.svg` 시안을 **좁게** — 흰 카드·라벨 좌 / `n문항` 우·하단 `부여 n / N파트`·전체 비우기.
 * 패널 상단은 캘린더 **요일(월화수목금토일) 행**과 Y축이 같고, 페이지와 함께 스크롤한다(sticky 없음).
 * 캘린더로 옮기면 대기열에서 사라진다.
 * 출제에서 파트를 나눴으면 카드 라벨은 `단어 N파트`, 우측에 `n문항`. **안 나눴으면** `단어` / `문장` / `문법`
 * 카테고리 칩만 있을 때 대기열에서 **전체** 프레임이 단어·문장·문법을 감싸 한날에 같이 올린다.
 * **처음에는 전부 대기열** — 캘린더에 자동으로 올리지 않는다.
 * Ctrl/Cmd·Shift로 여러 칩을 고른 뒤 날짜 클릭·드래그로 한꺼번에 올릴 수 있다.
 * 날짜만 누르면 **전부** 그 날로 모인다. **올린 칩을 클릭**하면 다시 대기열로 돌아온다.
 *
 * 저장할 때는 **같은 날짜 조합에 놓인 칩끼리 묶어** 과제 하나가 된다.
 * 마감은 **반마다 일괄** — 같은 규칙(N일 / 다음 수업 전까지)을 그 반의 모든 수업일 그룹에 적용한다.
 * 칩을 캘린더에 올리지 않으면 제출할 수 없다.
 */

/** 파트 칩 하나 — `1 파트 4` */
export type AssignPartOption = {
  /** 1부터 */
  index: number;
  count: number;
};

export type AssignContentRow = {
  /** 카테고리 키 — 빠진 항목을 호출부에 돌려줄 때 쓴다 */
  key: string;
  /** "단어" · "문장" · "문법" */
  label: string;
  /** "1·2파트" — 나누지 않았으면 null */
  partLabel?: string | null;
  count: number;
  /** 파트 칩 — 출제를 나눈 카테고리만 */
  parts?: AssignPartOption[];
  /** 처음 체크돼 있는 파트 번호 */
  checkedParts?: number[];
  /** 유형 체크박스 («전체» 제외) */
  types?: string[];
  /** 처음 체크돼 있는 유형 */
  checkedTypes?: string[];
};

/** 캘린더에 놓는 최소 단위 — 나눈 카테고리는 파트마다, 안 나눴으면 카테고리째 */
export type AssignChip = {
  /** `words:1` · `sentences` */
  key: string;
  category: string;
  /** 나누지 않았으면 null */
  partIndex: number | null;
  /** 파트 모드: "단어 1파트" · 안 나눔: "단어" */
  label: string;
  /** 이번에 낼 문항 수 — 파트면 조각∩선택, 안 나눔이면 카테고리 선택 수 */
  count: number;
};

/** 같은 날짜 조합에 놓인 칩 묶음 = 과제 하나 */
export type AssignGroup = {
  chips: AssignChip[];
  /** `problemSetId`는 저장 직전에 호출부가 채운다 */
  assignments: CreateClassAssignmentInput[];
};

/** 반마다 아직 캘린더에 안 올린 칩 라벨 (`chip.label`, 문항 수 없음) */
type MissingPlacementGroup = {
  className: string;
  labels: string[];
};

export type AssignResult = {
  /** 과제 단위. 같은 날짜 조합에 놓인 칩 묶음마다 1개 */
  groups: AssignGroup[];
  /** 카테고리별 이번에 낼 유형 */
  types: Record<string, string[]>;
  /** 유형을 전부 해제해 이번 과제에서 빠진 카테고리 */
  excludedKeys: string[];
};

export type DeadlineMode = "manual" | "until_next_class";

type ClassSchedule = {
  /**
   * YYYY-MM-DD · 칩이 없을 때·날짜 클릭(전체 이동) 시 쓰는 기준 수업일.
   * 칩이 올려진 뒤에는 칩별 수업일이 기준이고, 마감 규칙만 이 스케줄에서 읽는다.
   */
  lessonDate: string;
  /** 수업일로부터 며칠 뒤가 마감인지 (직접 설정 · 모든 그룹에 동일 N) */
  deadlineDays: number;
  /** 직접 설정 | 다음 수업 전까지 — 반 전체 일괄 */
  deadlineMode: DeadlineMode;
};

type AssignAssignmentModalProps = {
  open: boolean;
  classes: TeacherClass[];
  classIds: string[];
  /**
   * 이번에 낼 문제 내역. 넘기면 「낼 문제」 카드가 뜨고 파트·유형을 조정하거나
   * 파트별로 다른 날에 놓을 수 있다.
   * 넘기지 않으면(문장 기반 자동 생성 등) 수업일·마감만 묻는다.
   */
  contents?: AssignContentRow[];
  /** 이전에 배치해 둔 칩·마감 — 뒤로 갔다가 다시 열 때 복원 */
  initialAssignUi?: AssignDraftUi;
  /** 칩·마감이 바뀔 때마다 초안에 반영 */
  onAssignUiChange?: (ui: AssignDraftUi) => void;
  onClose: () => void;
  onConfirm: (result: AssignResult) => void;
  /** page = 사이드바 옆 전용 화면 · modal = 예전 오버레이(기본 page) */
  variant?: "page" | "modal";
  /** 제출 중이면 취소 막기 */
  busy?: boolean;
};

/** 시안에 마감 시간 입력이 없다 — 마감 칩도 `마감 23:59` 고정 */
const DEADLINE_TIME = "23:59";

const DEADLINE_PRESETS = [1, 3, 7, 14];
const DEFAULT_DEADLINE_DAYS = 3;

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

const CHIP_DRAG_TYPE = "application/x-loopin-assign-chip";

/** 안 나눔 모드 — 카테고리 칩을 한꺼번에 올리는 「전체」 번들 */
const ALL_BUNDLE_KEY = "__all_categories__";

function isoDaysFrom(isoDate: string, days: number): string {
  const date = parseIso(isoDate);
  date.setDate(date.getDate() + days);
  return toLocalIsoDate(date);
}

function parseIso(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function defaultSchedule(): ClassSchedule {
  return {
    lessonDate: toLocalIsoDate(new Date()),
    deadlineDays: DEFAULT_DEADLINE_DAYS,
    deadlineMode: "manual",
  };
}

function initSchedules(classIds: string[]): Record<string, ClassSchedule> {
  return Object.fromEntries(
    classIds.map((classId) => [classId, defaultSchedule()]),
  );
}

function schedulesFromUi(
  classIds: string[],
  ui?: AssignDraftUi,
): Record<string, ClassSchedule> {
  const base = initSchedules(classIds);
  if (!ui?.schedules) return base;
  for (const classId of classIds) {
    const saved = ui.schedules[classId];
    if (!saved) continue;
    base[classId] = {
      lessonDate: saved.lessonDate || base[classId].lessonDate,
      deadlineDays:
        typeof saved.deadlineDays === "number"
          ? saved.deadlineDays
          : base[classId].deadlineDays,
      deadlineMode:
        saved.deadlineMode === "until_next_class" ||
        saved.deadlineMode === "manual"
          ? saved.deadlineMode
          : base[classId].deadlineMode,
    };
  }
  return base;
}

function chipDatesFromUi(
  classIds: string[],
  ui?: AssignDraftUi,
): Record<string, Record<string, string>> {
  if (!ui?.chipDates) return {};
  const next: Record<string, Record<string, string>> = {};
  for (const classId of classIds) {
    const placed = ui.chipDates[classId];
    if (placed && typeof placed === "object") {
      next[classId] = { ...placed };
    }
  }
  return next;
}

function monthFromUi(ui?: AssignDraftUi): { year: number; month: number } {
  const now = new Date();
  if (
    ui?.month &&
    typeof ui.month.year === "number" &&
    typeof ui.month.month === "number"
  ) {
    return { year: ui.month.year, month: ui.month.month };
  }
  return { year: now.getFullYear(), month: now.getMonth() };
}

/** 수업일 다음 정규/일회 수업의 전날까지 며칠인지. 없으면 null */
function deadlineDaysUntilNextClass(
  teacherClass: TeacherClass,
  lessonIso: string,
): number | null {
  const lessonDate = parseIso(lessonIso);
  const from = new Date(
    lessonDate.getFullYear(),
    lessonDate.getMonth(),
    lessonDate.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  const next = getNextClassOccurrence(
    teacherClass,
    from,
    loadOneOffLessons(),
    loadAcademicSchedule(),
  );
  if (!next) return null;
  const nextDay = new Date(
    next.date.getFullYear(),
    next.date.getMonth(),
    next.date.getDate(),
  );
  const deadlineDay = new Date(nextDay);
  deadlineDay.setDate(deadlineDay.getDate() - 1);
  const ms = deadlineDay.getTime() - lessonDate.getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** 반 일괄 규칙을 그 그룹의 수업일에 적용 */
function resolveDeadlineDays(
  teacherClass: TeacherClass | undefined,
  schedule: Pick<ClassSchedule, "deadlineDays" | "deadlineMode">,
  lessonIso: string,
): number {
  if (!teacherClass || schedule.deadlineMode !== "until_next_class") {
    return schedule.deadlineDays;
  }
  return (
    deadlineDaysUntilNextClass(teacherClass, lessonIso) ??
    schedule.deadlineDays
  );
}

function initPartSel(rows: AssignContentRow[]): Record<string, number[]> {
  return Object.fromEntries(
    rows.map((row) => [row.key, [...(row.checkedParts ?? [])]]),
  );
}

/** 처음 체크된 유형이 없으면 전체를 켠 것으로 본다 — 빈 배열은 「이 카테고리 제외」를 뜻한다 */
function initTypeSel(rows: AssignContentRow[]): Record<string, string[]> {
  return Object.fromEntries(
    rows.map((row) => [row.key, [...(row.checkedTypes ?? row.types ?? [])]]),
  );
}

/** 월요일 시작 그리드 — 시안과 같은 5~6줄 달력 */
function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  // getDay(): 0=일 → 월요일 시작으로 환산
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);
  const last = new Date(year, month + 1, 0);
  const weeks = Math.ceil((lead + last.getDate()) / 7);
  return Array.from({ length: weeks * 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export function AssignAssignmentModal({
  open,
  classes,
  classIds,
  contents,
  initialAssignUi,
  onAssignUiChange,
  onClose,
  onConfirm,
  variant = "page",
  busy = false,
}: AssignAssignmentModalProps) {
  const titleId = useId();
  const classKey = classIds.join("|");
  const rows = useMemo(() => contents ?? [], [contents]);

  const [schedules, setSchedules] = useState<Record<string, ClassSchedule>>(
    () => schedulesFromUi(classIds, initialAssignUi),
  );
  const [activeClassId, setActiveClassId] = useState(
    () =>
      (initialAssignUi?.activeClassId &&
      classIds.includes(initialAssignUi.activeClassId)
        ? initialAssignUi.activeClassId
        : classIds[0]) ?? "",
  );
  const [partSel, setPartSel] = useState<Record<string, number[]>>(() =>
    initialAssignUi?.partSel
      ? { ...initPartSel(rows), ...initialAssignUi.partSel }
      : initPartSel(rows),
  );
  const [typeSel, setTypeSel] = useState<Record<string, string[]>>(() =>
    initialAssignUi?.typeSel
      ? { ...initTypeSel(rows), ...initialAssignUi.typeSel }
      : initTypeSel(rows),
  );
  /** 반별로 캘린더에 올린 칩의 날짜. 없으면 대기열(미배치) */
  const [chipDates, setChipDates] = useState<
    Record<string, Record<string, string>>
  >(() => chipDatesFromUi(classIds, initialAssignUi));
  /**
   * 대기열에서 고른 칩(들) — 날짜 클릭·드롭 시 한꺼번에 올린다.
   * `ALL_BUNDLE_KEY` 단독이면 「전체」 번들. 일반 클릭 / Ctrl·Cmd / Shift로 갱신.
   */
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  /** Shift 범위 선택의 기준 칩 */
  const selectionAnchorRef = useRef<string | null>(null);
  /** 드래그 시작 시 확정한 배치 키 — drop에서 selectedKeys 비동기 갱신보다 우선 */
  const pendingPlaceKeysRef = useRef<string[] | null>(null);
  /** 드래그 직후 합성 click으로 대기열 복귀가 일어나지 않게 */
  const chipDraggedRef = useRef(false);
  const [month, setMonth] = useState(() => monthFromUi(initialAssignUi));
  const [error, setError] = useState("");
  /** 미배치 칩 — 제출 시 푸터 대신 팝업으로 안내 */
  const [missingPlacement, setMissingPlacement] = useState<
    MissingPlacementGroup[] | null
  >(null);
  const missingAlertTitleId = useId();
  /** 마운트 직후 빈 UI를 초안에 써 덮어쓰지 않도록 한 틱 건너뛴다 */
  /**
   * 초안에 마지막으로 쓴 리셋 키.
   *
   * 리셋 직후 한 번은 초안에 쓰지 않는다 — 방금 되돌린 초기값을 도로 저장하면
   * 사용자가 지운 항목이 되살아난다. 예전에는 리셋 블록에서 `skip` 플래그 ref를
   * 세웠는데, 그건 **렌더 중 ref 쓰기**라 버려진 렌더가 남긴 값이 그대로 남을 수
   * 있다. 지금은 effect 안에서 키만 비교한다.
   * `null`로 시작하므로 첫 실행도 건너뛴다(예전 `useRef(true)`와 같은 동작).
   */
  const persistedResetKeyRef = useRef<string | null>(null);

  /*
   * 모달을 열거나 받는 반이 바뀌면 처음 상태로 되돌린다.
   * effect가 아니라 **렌더 중 조정**(React가 권장하는 방식)으로 처리한다 —
   * effect에서 setState하면 한 번 그린 뒤 다시 그리게 되고, 지난번에 뺐던 항목이
   * 잠깐 체크된 채로 비친다.
   * 초안에 저장된 배치(`initialAssignUi`)가 있으면 그걸 우선한다.
   */
  const resetKey = `${open ? "open" : "closed"}|${classKey}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setSchedules(schedulesFromUi(classIds, initialAssignUi));
    setActiveClassId(
      (initialAssignUi?.activeClassId &&
      classIds.includes(initialAssignUi.activeClassId)
        ? initialAssignUi.activeClassId
        : classIds[0]) ?? "",
    );
    setPartSel(
      initialAssignUi?.partSel
        ? { ...initPartSel(rows), ...initialAssignUi.partSel }
        : initPartSel(rows),
    );
    setTypeSel(
      initialAssignUi?.typeSel
        ? { ...initTypeSel(rows), ...initialAssignUi.typeSel }
        : initTypeSel(rows),
    );
    setChipDates(chipDatesFromUi(classIds, initialAssignUi));
    setSelectedKeys([]);
    setMonth(monthFromUi(initialAssignUi));
    setError("");
    setMissingPlacement(null);
  }

  /** ref는 렌더 중 쓰면 안 됨 — 리셋 키 바뀌면 effect에서 비운다 */
  useEffect(() => {
    selectionAnchorRef.current = null;
    pendingPlaceKeysRef.current = null;
    chipDraggedRef.current = false;
  }, [resetKey]);

  /*
    최신 콜백을 담아 두는 ref. 저장 effect의 의존성에 콜백을 넣으면 부모가 다시
    그릴 때마다 초안이 덧써진다. 갱신은 렌더가 아니라 **커밋 뒤**에 한다 —
    아래 저장 effect보다 먼저 선언해야 그때 이미 최신이다(effect는 선언 순서대로 돈다).
  */
  const onAssignUiChangeRef = useRef(onAssignUiChange);
  useEffect(() => {
    onAssignUiChangeRef.current = onAssignUiChange;
  });

  /** 칩·마감·월 네비를 초안에 남겨 뒤로가기 후에도 복원한다 */
  useEffect(() => {
    if (!open || !onAssignUiChangeRef.current) return;
    // 리셋된 직후 한 번은 건너뛴다 (초기값으로 초안을 덮지 않도록)
    if (persistedResetKeyRef.current !== resetKey) {
      persistedResetKeyRef.current = resetKey;
      return;
    }
    onAssignUiChangeRef.current({
      schedules,
      chipDates,
      activeClassId,
      partSel,
      typeSel,
      month,
    });
  }, [
    open,
    resetKey,
    schedules,
    chipDates,
    activeClassId,
    partSel,
    typeSel,
    month,
  ]);

  const selectedClasses = useMemo(
    () => classes.filter((item) => classIds.includes(item.id)),
    [classes, classIds],
  );
  const activeClass =
    selectedClasses.find((item) => item.id === activeClassId) ??
    selectedClasses[0] ??
    null;

  /** 이번 달 수업 후보 — 시안의 `3-1반 09:00` 칩 */
  const activeClassIdForCalendar = activeClass?.id ?? null;
  const lessonsByDate = useMemo(() => {
    if (!open || !activeClassIdForCalendar) return new Map<string, string[]>();
    const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
    const candidates = listLessonCandidates({
      classes,
      classIds: [activeClassIdForCalendar],
      oneOffLessons: loadOneOffLessons(),
      academicSchedule: loadAcademicSchedule(),
      // 앞뒤로 걸친 주까지 덮도록 넉넉히 잡는다
      from: new Date(month.year, month.month, -7),
      lookaheadDays: daysInMonth + 14,
    });
    const map = new Map<string, string[]>();
    for (const lesson of candidates) {
      const list = map.get(lesson.date) ?? [];
      list.push(`${lesson.name}  ${lesson.start}`);
      map.set(lesson.date, list);
    }
    return map;
  }, [open, activeClassIdForCalendar, classes, month.year, month.month]);

  const holidays = useMemo(
    () => (open ? loadAcademicSchedule().holidays : []),
    [open],
  );

  /** 유형을 전부 해제한 카테고리는 이번 과제에서 빠진다 */
  const isExcluded = (row: AssignContentRow) =>
    (row.types?.length ?? 0) > 0 && (typeSel[row.key]?.length ?? 0) === 0;

  /** 출제 화면에서 고른 파트만 — 부여 창에 나머지 파트 버튼을 안 띄운다 */
  const partsForRow = (row: AssignContentRow): AssignPartOption[] => {
    const parts = row.parts ?? [];
    if (parts.length === 0) return [];
    const allowed = new Set(row.checkedParts ?? []);
    if (allowed.size === 0) return parts;
    return parts.filter((part) => allowed.has(part.index));
  };

  /** 캘린더에 놓이는 칩 — 나눈 카테고리는 체크한 파트마다 하나씩 */
  const chips: AssignChip[] = useMemo(() => {
    const list: AssignChip[] = [];
    for (const row of rows) {
      if ((row.types?.length ?? 0) > 0 && (typeSel[row.key]?.length ?? 0) === 0) {
        continue;
      }
      const parts = partsForRow(row);
      const selectedPartIndices = partSel[row.key] ?? [];
      /**
       * 출제에서 분할만 켜 두고 파트 체크 없이 문항만 고른 경우 —
       * 파트 칩 대신 카테고리 칩 하나(선택 문항 전부)를 둔다.
       */
      if ((row.parts?.length ?? 0) > 0 && selectedPartIndices.length === 0) {
        if (row.count > 0) {
          list.push({
            key: row.key,
            category: row.key,
            partIndex: null,
            label: row.label,
            count: row.count,
          });
        }
        continue;
      }
      if ((row.parts?.length ?? 0) > 0) {
        for (const part of parts) {
          if (!selectedPartIndices.includes(part.index)) continue;
          list.push({
            key: `${row.key}:${part.index}`,
            category: row.key,
            partIndex: part.index,
            label: `${row.label} ${part.index}파트`,
            count: part.count,
          });
        }
        continue;
      }
      list.push({
        key: row.key,
        category: row.key,
        partIndex: null,
        label: row.label,
        count: row.count,
      });
    }
    return list;
  }, [rows, partSel, typeSel]);

  /**
   * 출제에서 어떤 카테고리도 파트로 안 나눈 경우 — 칩이 `단어`/`문장`/`문법`이고
   * 대기열에 「전체」 래퍼가 카테고리 칩을 감싼다.
   */
  const nonPartMode =
    chips.length > 0 && chips.every((chip) => chip.partIndex === null);
  const showAllBundle = nonPartMode && chips.length >= 2;

  /**
   * 파트별 부여 대기열 — 이 반 캘린더에 **이미 올려 둔** 칩은 빼서
   * 달력 칸에만 보이게 한다.
   */
  const trayChips = useMemo(() => {
    if (!activeClassId) return chips;
    const placed = chipDates[activeClassId] ?? {};
    return chips.filter((chip) => placed[chip.key] == null);
  }, [chips, chipDates, activeClassId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (missingPlacement) {
        setMissingPlacement(null);
        return;
      }
      if (selectedKeys.length > 0) {
        setSelectedKeys([]);
        selectionAnchorRef.current = null;
        pendingPlaceKeysRef.current = null;
      } else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, selectedKeys.length, missingPlacement]);

  if (!open) return null;

  const activeRows = rows.filter((row) => !isExcluded(row));

  const scheduleOf = (classId: string) =>
    schedules[classId] ?? defaultSchedule();
  const schedule = activeClass ? scheduleOf(activeClass.id) : defaultSchedule();

  /** 그 반에서 이 칩이 놓인 날 — 대기열에 있으면 null */
  const chipDate = (classId: string, chipKey: string): string | null =>
    chipDates[classId]?.[chipKey] ?? null;

  const todayIso = toLocalIsoDate(new Date());

  const patch = (classId: string, next: Partial<ClassSchedule>) =>
    setSchedules((prev) => ({
      ...prev,
      [classId]: { ...(prev[classId] ?? defaultSchedule()), ...next },
    }));

  /** 여러 칩을 같은 날로 — 「전체」 번들·날짜만 누를 때 */
  const placeChips = (classId: string, chipKeys: string[], iso: string) =>
    setChipDates((prev) => ({
      ...prev,
      [classId]: {
        ...(prev[classId] ?? {}),
        ...Object.fromEntries(chipKeys.map((key) => [key, iso])),
      },
    }));

  /** 캘린더에서 빼서 대기열로 되돌림 */
  const unplaceChip = (classId: string, chipKey: string) =>
    setChipDates((prev) => {
      const placed = { ...(prev[classId] ?? {}) };
      delete placed[chipKey];
      return { ...prev, [classId]: placed };
    });

  /** 대기열·이미 올린 칩을 전부 그 날로 · 기준 수업일도 맞춤 */
  const moveAll = (classId: string, iso: string) => {
    patch(classId, { lessonDate: iso });
    setChipDates((prev) => ({
      ...prev,
      [classId]: Object.fromEntries(chips.map((chip) => [chip.key, iso])),
    }));
  };

  /** 「전체」 — 안 나눔 카테고리 칩을 전부 그 날로(이미 올린 것도 함께 이동) */
  const placeAllBundle = (classId: string, iso: string) => {
    placeChips(
      classId,
      chips.map((chip) => chip.key),
      iso,
    );
  };

  const clearChipSelection = () => {
    setSelectedKeys([]);
    selectionAnchorRef.current = null;
    pendingPlaceKeysRef.current = null;
  };

  /** 활성 반 — 올린 칩을 전부 대기열로 · 「전체 비우기」 */
  const clearAllPlacements = (classId: string) => {
    setChipDates((prev) => ({ ...prev, [classId]: {} }));
    clearChipSelection();
  };

  /** 드래그·날짜 클릭으로 올릴 키 목록 확정 */
  const resolvePlaceKeys = (chipKey: string): string[] => {
    if (chipKey === ALL_BUNDLE_KEY) return [ALL_BUNDLE_KEY];
    if (
      selectedKeys.includes(chipKey) &&
      selectedKeys.length > 0 &&
      !selectedKeys.includes(ALL_BUNDLE_KEY)
    ) {
      return selectedKeys;
    }
    return [chipKey];
  };

  const placeFromDragKey = (classId: string, chipKey: string, iso: string) => {
    const keys =
      pendingPlaceKeysRef.current ?? resolvePlaceKeys(chipKey);
    pendingPlaceKeysRef.current = null;
    if (keys.includes(ALL_BUNDLE_KEY)) {
      placeAllBundle(classId, iso);
      return;
    }
    placeChips(classId, keys, iso);
  };

  const handleDayActivate = (iso: string) => {
    if (!activeClass) return;
    setError("");
    if (selectedKeys.length > 0) {
      if (selectedKeys.includes(ALL_BUNDLE_KEY)) {
        placeAllBundle(activeClass.id, iso);
      } else {
        placeChips(activeClass.id, selectedKeys, iso);
      }
      clearChipSelection();
      return;
    }
    moveAll(activeClass.id, iso);
  };

  /** 대기열 칩 클릭 — 일반 / Ctrl·Cmd 토글 / Shift 범위 */
  const handleTrayChipClick = (
    chipKey: string,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    const trayOrder = trayChips.map((chip) => chip.key);
    if (event.metaKey || event.ctrlKey) {
      setSelectedKeys((prev) => {
        const base = prev.filter((key) => key !== ALL_BUNDLE_KEY);
        return base.includes(chipKey)
          ? base.filter((key) => key !== chipKey)
          : [...base, chipKey];
      });
      selectionAnchorRef.current = chipKey;
      return;
    }
    if (event.shiftKey) {
      const anchor = selectionAnchorRef.current;
      const from = anchor != null ? trayOrder.indexOf(anchor) : -1;
      const to = trayOrder.indexOf(chipKey);
      if (from >= 0 && to >= 0) {
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        setSelectedKeys(trayOrder.slice(lo, hi + 1));
        return;
      }
    }
    setSelectedKeys((prev) =>
      prev.length === 1 && prev[0] === chipKey ? [] : [chipKey],
    );
    selectionAnchorRef.current = chipKey;
  };

  const beginChipDrag = (chipKey: string) => {
    const keys = resolvePlaceKeys(chipKey);
    pendingPlaceKeysRef.current = keys;
    if (chipKey === ALL_BUNDLE_KEY) {
      setSelectedKeys([ALL_BUNDLE_KEY]);
      selectionAnchorRef.current = null;
      return;
    }
    if (!selectedKeys.includes(chipKey)) {
      setSelectedKeys([chipKey]);
      selectionAnchorRef.current = chipKey;
    }
  };

  /** 트레이 카드 라벨 — 문항 수는 우측에 따로 (`단어 1파트` / `단어`) */
  const chipTitle = (chip: AssignChip) =>
    `${chip.label} · ${chip.count}문항`;

  const allBundleCount = chips.reduce((sum, chip) => sum + chip.count, 0);
  const allBundleTitle = `전체 · ${allBundleCount}문항`;
  const placedPartCount = chips.length - trayChips.length;

  const movingHintLabel =
    selectedKeys.includes(ALL_BUNDLE_KEY)
      ? allBundleTitle
      : selectedKeys.length > 1
        ? `${selectedKeys.length}개 칩`
        : (() => {
            const chip = chips.find((item) => item.key === selectedKeys[0]);
            return chip ? chipTitle(chip) : "";
          })();

  /**
   * 같은 **날짜 조합**(모든 반에서 같은 날)에 놓인 칩끼리 묶는다.
   * 반마다 날짜가 갈리는 칩은 자연히 다른 묶음이 된다.
   * 마감은 **그 반의 일괄 규칙**(deadlineMode · deadlineDays)을 각 그룹 수업일에 적용한다.
   * 아직 캘린더에 안 올린 칩은 묶음에서 빼고, 하나도 없으면 기준 수업일로 마감만 미리본다.
   */
  const buildGroups = (): AssignGroup[] => {
    const makeAssignments = (dateOf: (classId: string) => string) =>
      selectedClasses.map((teacherClass) => {
        const lessonDate = dateOf(teacherClass.id);
        const sched = scheduleOf(teacherClass.id);
        const days = resolveDeadlineDays(teacherClass, sched, lessonDate);
        return {
          // problemSetId는 저장 직전에 호출부가 채운다
          problemSetId: "",
          classId: teacherClass.id,
          lessonDate,
          deadlineDate: isoDaysFrom(lessonDate, days),
          deadlineTime: DEADLINE_TIME,
        } satisfies CreateClassAssignmentInput;
      });

    if (chips.length === 0) {
      return [
        {
          chips: [],
          assignments: makeAssignments(
            (classId) => scheduleOf(classId).lessonDate,
          ),
        },
      ];
    }

    /** 선택한 모든 반에 올려 둔 칩만 — 한 반이라도 대기열이면 아직 묶지 않음 */
    const placedChips = chips.filter((chip) =>
      selectedClasses.every(
        (teacherClass) => chipDate(teacherClass.id, chip.key) != null,
      ),
    );

    if (placedChips.length === 0) {
      return [
        {
          chips: [],
          assignments: makeAssignments(
            (classId) => scheduleOf(classId).lessonDate,
          ),
        },
      ];
    }

    const buckets = new Map<string, AssignChip[]>();
    for (const chip of placedChips) {
      const key = selectedClasses
        .map((teacherClass) => chipDate(teacherClass.id, chip.key)!)
        .join("|");
      const bucket = buckets.get(key);
      if (bucket) bucket.push(chip);
      else buckets.set(key, [chip]);
    }

    return [...buckets.values()]
      .map((bucketChips) => ({
        chips: bucketChips,
        assignments: makeAssignments(
          (classId) => chipDate(classId, bucketChips[0]!.key)!,
        ),
      }))
      .sort((a, b) =>
        (a.assignments[0]?.lessonDate ?? "").localeCompare(
          b.assignments[0]?.lessonDate ?? "",
        ),
      );
  };

  const groups = buildGroups();

  const submit = () => {
    if (selectedClasses.length === 0) {
      setMissingPlacement(null);
      setError("받는 반을 먼저 선택해 주세요.");
      return;
    }
    if (rows.length > 0 && activeRows.length === 0) {
      setMissingPlacement(null);
      setError("이번에 낼 문제를 하나 이상 남겨 주세요.");
      return;
    }
    for (const row of activeRows) {
      // 파트 미선택 + 문항만 고른 경우는 카테고리 칩으로 부여한다 (위 chips 분기)
      if (
        (row.parts?.length ?? 0) > 0 &&
        (partSel[row.key]?.length ?? 0) === 0 &&
        row.count <= 0
      ) {
        setMissingPlacement(null);
        setError(`${row.label}에서 낼 파트를 하나 이상 골라 주세요.`);
        return;
      }
    }
    if (chips.length > 0) {
      const groups: MissingPlacementGroup[] = [];
      for (const teacherClass of selectedClasses) {
        const labels: string[] = [];
        for (const chip of chips) {
          if (chipDate(teacherClass.id, chip.key) == null) {
            labels.push(chip.label);
          }
        }
        if (labels.length > 0) {
          groups.push({ className: teacherClass.name, labels });
        }
      }
      if (groups.length > 0) {
        setError("");
        setMissingPlacement(groups);
        return;
      }
    }
    setError("");
    setMissingPlacement(null);
    onConfirm({
      groups,
      types: Object.fromEntries(
        rows
          .filter((row) => (row.types?.length ?? 0) > 0 && !isExcluded(row))
          .map((row) => [row.key, typeSel[row.key] ?? []]),
      ),
      excludedKeys: rows.filter(isExcluded).map((row) => row.key),
    });
  };

  const grid = buildMonthGrid(month.year, month.month);
  const shiftMonth = (delta: number) =>
    setMonth((prev) => {
      const date = new Date(prev.year, prev.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });

  /** 활성 반 기준 — 캘린더에 올린 칩만 */
  const chipsByDate = new Map<string, AssignChip[]>();
  if (activeClass) {
    for (const chip of chips) {
      const iso = chipDate(activeClass.id, chip.key);
      if (!iso) continue;
      const list = chipsByDate.get(iso) ?? [];
      list.push(chip);
      chipsByDate.set(iso, list);
    }
  }

  /** 활성 반 · 칩이 놓인 수업일 그룹 (마감 UI용, 날짜순) */
  const activeDateGroups = [...chipsByDate.entries()]
    .map(([lessonDate, groupChips]) => ({ lessonDate, chips: groupChips }))
    .sort((a, b) => a.lessonDate.localeCompare(b.lessonDate));

  /** 칩이 없는 플로우(사용자 지정 등) — 기준 수업일 하나짜리 마감 */
  const useBaselineDeadline = chips.length === 0;

  return (
    <div
      className={
        variant === "page"
          ? "pointer-events-none absolute inset-0 z-[22]"
          : "fixed inset-0 z-[80] flex justify-center overflow-y-auto bg-[rgba(16,24,40,0.45)] p-6"
      }
      role={variant === "page" ? "region" : "dialog"}
      aria-modal={variant === "modal" ? true : undefined}
      aria-labelledby={titleId}
      aria-label={variant === "page" ? "과제 부여" : undefined}
      onClick={variant === "modal" && !busy ? onClose : undefined}
    >
      {variant === "page" ? (
        <div
          className="pointer-events-none absolute"
          style={{
            left: CLASS_LAYOUT.sidebarWidth,
            top: 0,
            width: 1557 - CLASS_LAYOUT.sidebarWidth,
            height: 973,
            background: "#F3F4F5",
          }}
          aria-hidden
        />
      ) : null}
        <div
          className={
            variant === "page"
              ? "pointer-events-auto absolute flex flex-col overflow-y-auto overscroll-contain rounded-[16px] bg-[#FDFDFE] shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
              : "my-auto w-full max-w-[900px] rounded-[16px] bg-[#FDFDFE] px-10 pt-9 pb-8 shadow-[0_24px_64px_rgba(16,24,40,0.24)]"
          }
          style={
            variant === "page"
              ? {
                  left: CLASS_LAYOUT.contentLeft,
                  top: 36,
                  width: CLASS_LAYOUT.contentRight - CLASS_LAYOUT.contentLeft,
                  height: 973 - 52,
                }
              : undefined
          }
          onClick={(event) => event.stopPropagation()}
        >
        <div
          className={
            variant === "page" ? "flex flex-col px-8 pt-7 pb-6" : undefined
          }
        >
        <header className="flex shrink-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-[22px] font-bold tracking-[-0.02em] text-[#181B1F]"
            >
              과제 부여
            </h2>
            <p className="mt-2 text-[13px] font-medium text-[#6E7278]">
              낼 문제를 확인하고 반마다 수업일과 마감을 정해 주세요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!busy) onClose();
            }}
            aria-label="닫기"
            disabled={busy}
            className="-mt-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#45484D] hover:bg-[#F3F4F5] disabled:opacity-50"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="mt-5 h-px bg-[#DCDEE1]" />

        {/* 반 탭 — 캘린더·마감만 바뀐다 */}
        <div
          className="mt-5 flex flex-wrap items-center gap-2"
          role="tablist"
          aria-label="받는 반"
        >
          {selectedClasses.map((teacherClass) => {
            const on = teacherClass.id === activeClass?.id;
            return (
              <button
                key={teacherClass.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => {
                  setActiveClassId(teacherClass.id);
                  clearChipSelection();
                }}
                className={`flex h-[37px] cursor-pointer items-center gap-2 rounded-[10px] border px-5 text-[14px] transition-colors ${
                  on
                    ? "border-[#E4E5E8] bg-[#F5F7F9] font-bold text-[#181B1F]"
                    : "border-transparent font-semibold text-[#77787E] hover:bg-[#F5F7F9] hover:text-[#45484D]"
                }`}
              >
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: on ? teacherClass.color : "#C9CCD1" }}
                  aria-hidden
                />
                {teacherClass.name}
              </button>
            );
          })}
          {selectedClasses.length === 0 ? (
            <span className="text-[13px] text-[#9497A0]">
              받는 반을 먼저 선택해 주세요.
            </span>
          ) : null}
        </div>

        {/* 월 네비(전체 너비) → 파트 칩 | 요일격자·마감·제출 — 패널 상단 = 요일 행 Y */}
        <div
          className={
            variant === "page" ? "mt-5 flex flex-col" : "mt-8 flex flex-col"
          }
        >
          <div className="flex shrink-0 flex-col items-center">
            <div className="flex items-center gap-6">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="이전 달"
                className="grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-full border border-[#E4E5E8] bg-[#FDFDFE] text-[#9A958E] hover:bg-[#F5F7F9]"
              >
                <ChevronIcon direction="left" />
              </button>
              <h3 className="text-[17px] font-bold text-[#181B1F]">
                {month.year}년 {month.month + 1}월
              </h3>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="다음 달"
                className="grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-full border border-[#E4E5E8] bg-[#FDFDFE] text-[#9A958E] hover:bg-[#F5F7F9]"
              >
                <ChevronIcon direction="right" />
              </button>
            </div>
            <p className="mt-2 text-[12.5px] font-medium text-[#777A80]">
              {selectedKeys.length > 0
                ? `옮길 날짜를 누르세요 — ${movingHintLabel}`
                : activeClass
                  ? `과제를 눌러 ${activeClass.name}의 수업일을 선택하세요`
                  : "과제를 눌러 해당 반의 수업일을 선택하세요"}
            </p>
          </div>

          <div className="mt-4 flex items-start gap-3">
          {chips.length > 0 ? (
            <aside className="w-[210px] shrink-0 self-start">
              <section className="flex flex-col rounded-[16px] border border-[#ECEEF3] bg-[#F7F8FB] px-2.5 pb-2.5 pt-3 shadow-[0_1px_2px_rgba(20,22,26,0.03)]">
                <h3 className="text-[13px] font-bold tracking-[-0.02em] text-[#14161A]">
                  파트별 부여
                  {activeClass ? ` · ${activeClass.name}` : ""}
                </h3>
                <p className="mt-1 text-[10.5px] leading-[1.4] font-medium text-[#7B8290]">
                  칩을 끌어다 놓거나, 누른 뒤 날짜를 고르세요.
                </p>

                {trayChips.length > 0 || showAllBundle ? (
                  <div className="mt-2.5 flex flex-col gap-1.5">
                    {showAllBundle ? (
                      <div
                        role="group"
                        aria-label={allBundleTitle}
                        className={`rounded-[12px] border bg-white transition-colors ${
                          selectedKeys.includes(ALL_BUNDLE_KEY)
                            ? "border-[#1B6FD8] shadow-[0_0_0_1px_#1B6FD8]"
                            : "border-[#E2E5EB] shadow-[0_1px_2px_rgba(20,22,26,0.03)]"
                        }`}
                      >
                        <button
                          type="button"
                          draggable
                          aria-pressed={selectedKeys.includes(ALL_BUNDLE_KEY)}
                          aria-label={`${allBundleTitle} · 옮길 날짜 선택`}
                          onDragStart={(event) => {
                            event.dataTransfer.setData(
                              CHIP_DRAG_TYPE,
                              ALL_BUNDLE_KEY,
                            );
                            event.dataTransfer.effectAllowed = "move";
                            beginChipDrag(ALL_BUNDLE_KEY);
                          }}
                          onClick={() => {
                            setSelectedKeys((prev) =>
                              prev.length === 1 && prev[0] === ALL_BUNDLE_KEY
                                ? []
                                : [ALL_BUNDLE_KEY],
                            );
                            selectionAnchorRef.current = null;
                          }}
                          className={`flex w-full cursor-grab items-center gap-1.5 rounded-t-[11px] px-2 py-2 text-left transition-colors active:cursor-grabbing ${
                            trayChips.length === 0 ? "rounded-b-[11px]" : ""
                          } ${
                            selectedKeys.includes(ALL_BUNDLE_KEY)
                              ? "bg-[#F0F7FD]"
                              : "hover:bg-[#FAFBFC]"
                          }`}
                        >
                          <span className="opacity-50 text-[#14161A]" aria-hidden>
                            <GripIcon size="sm" />
                          </span>
                          <span className="min-w-0 flex-1 text-[12px] font-bold text-[#14161A]">
                            전체
                          </span>
                          <span className="shrink-0 text-[11px] font-medium text-[#8B919C]">
                            {allBundleCount}문항
                          </span>
                        </button>
                        {trayChips.length > 0 ? (
                          <div className="flex flex-col gap-1 border-t border-[#ECEEF3] px-1.5 pb-1.5 pt-1.5">
                            {trayChips.map((chip) => {
                              const selected = selectedKeys.includes(chip.key);
                              return (
                                <TrayPartCard
                                  key={chip.key}
                                  label={chip.label}
                                  count={chip.count}
                                  selected={selected}
                                  compact
                                  onDragStart={(event) => {
                                    event.dataTransfer.setData(
                                      CHIP_DRAG_TYPE,
                                      chip.key,
                                    );
                                    event.dataTransfer.effectAllowed = "move";
                                    beginChipDrag(chip.key);
                                  }}
                                  onClick={(event) =>
                                    handleTrayChipClick(chip.key, event)
                                  }
                                />
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      trayChips.map((chip) => {
                        const selected = selectedKeys.includes(chip.key);
                        return (
                          <TrayPartCard
                            key={chip.key}
                            label={chip.label}
                            count={chip.count}
                            selected={selected}
                            onDragStart={(event) => {
                              event.dataTransfer.setData(
                                CHIP_DRAG_TYPE,
                                chip.key,
                              );
                              event.dataTransfer.effectAllowed = "move";
                              beginChipDrag(chip.key);
                            }}
                            onClick={(event) =>
                              handleTrayChipClick(chip.key, event)
                            }
                          />
                        );
                      })
                    )}
                  </div>
                ) : (
                  <p className="mt-2.5 rounded-[12px] border border-[#E2E5EB] bg-white px-2.5 py-3 text-[11px] font-medium text-[#7B8290] shadow-[0_1px_2px_rgba(20,22,26,0.03)]">
                    모두 캘린더에 올렸어요.
                  </p>
                )}

                {groups.length > 1 ? (
                  <p className="mt-2 text-[10.5px] font-semibold leading-snug text-[#1B6FD8]">
                    날짜가 갈려서 과제 {groups.length}개로 나눠 나갑니다.
                  </p>
                ) : null}

                <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t border-[#ECEEF3] pt-2">
                  <p className="text-[10.5px] font-medium text-[#8B919C]">
                    부여 {placedPartCount} / {chips.length}파트
                  </p>
                  <button
                    type="button"
                    disabled={!activeClass || placedPartCount === 0 || busy}
                    onClick={() => {
                      if (activeClass) clearAllPlacements(activeClass.id);
                    }}
                    className="cursor-pointer text-[10.5px] font-medium text-[#7B8290] transition-colors hover:text-[#14161A] disabled:cursor-default disabled:opacity-40"
                  >
                    전체 비우기
                  </button>
                </div>
              </section>
            </aside>
          ) : null}

          {/* 캘린더·마감·제출 — 반마다 다르다 · 남은 너비 · 페이지와 함께 스크롤 */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="overflow-hidden rounded-[14px] border border-[#E0E1E4]">
              <div className="sticky top-0 z-[1] grid grid-cols-7 bg-[#F5F7F9]">
                {WEEKDAY_LABELS.map((label, index) => (
                  <div
                    key={label}
                    className={`py-2.5 text-center text-[13px] font-bold ${
                      index === 5
                        ? "text-[#3970C2]"
                        : index === 6
                          ? "text-[#DE3B3D]"
                          : "text-[#1F2227]"
                    }`}
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {grid.map((date) => {
                  const iso = toLocalIsoDate(date);
                  const inMonth = date.getMonth() === month.month;
                  const dayChips = chipsByDate.get(iso) ?? [];
                  const selected = dayChips.length > 0;
                  const isToday = iso === todayIso;
                  const red =
                    date.getDay() === 0 || isCalendarRedDay(date, holidays);
                  const lessons = lessonsByDate.get(iso) ?? [];
                  // 이 날 나가는 과제의 마감 — 칩 수업일 + 반 일괄 마감 규칙
                  const isDeadline =
                    !selected &&
                    activeClass != null &&
                    [...chipsByDate.keys()].some(
                      (lessonIso) =>
                        isoDaysFrom(
                          lessonIso,
                          resolveDeadlineDays(
                            activeClass,
                            schedule,
                            lessonIso,
                          ),
                        ) === iso,
                    );

                  return (
                    <div
                      key={iso}
                      role="gridcell"
                      onDragOver={(event) => {
                        if (!activeClass) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        if (!activeClass) return;
                        event.preventDefault();
                        const chipKey =
                          event.dataTransfer.getData(CHIP_DRAG_TYPE) ||
                          selectedKeys[0] ||
                          "";
                        if (!chipKey) return;
                        placeFromDragKey(activeClass.id, chipKey, iso);
                        clearChipSelection();
                        setError("");
                      }}
                      className="border-t border-l border-[#EEEFF1] bg-white [&:nth-child(7n+1)]:border-l-0"
                    >
                      <button
                        type="button"
                        disabled={!activeClass}
                        aria-label={`${date.getMonth() + 1}월 ${date.getDate()}일${
                          selectedKeys.length > 0
                            ? "로 옮기기"
                            : " 전체 수업일로 지정"
                        }`}
                        onClick={() => handleDayActivate(iso)}
                        className={`flex min-h-[96px] w-full cursor-pointer flex-col items-stretch gap-1 p-2 text-left disabled:cursor-not-allowed hover:bg-[#F8FAFC] ${
                          selected ? "bg-[#F7FBFF]" : ""
                        }`}
                      >
                        <span
                          className={`grid h-[24px] w-[24px] shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                            isToday
                              ? "bg-[#FF5A5F] text-white"
                              : !inMonth
                                ? "text-[#BCBEC0]"
                                : red
                                  ? "text-[#DE3B3D]"
                                  : "text-[#1F2227]"
                          }`}
                        >
                          {date.getDate()}
                        </span>

                        {lessons.map((text) => (
                          <span
                            key={text}
                            className="truncate rounded-[10px] bg-[#F2FEE7] px-1.5 py-0.5 text-[11px] font-bold text-[#65A912]"
                          >
                            {text}
                          </span>
                        ))}

                        {dayChips.map((chip) => (
                          <span
                            key={chip.key}
                            role="button"
                            tabIndex={0}
                            draggable
                            aria-label={`${chipTitle(chip)} · 클릭하면 대기열로`}
                            title="클릭하면 대기열로 · 드래그하면 다른 날로"
                            onDragStart={(event) => {
                              event.stopPropagation();
                              chipDraggedRef.current = true;
                              event.dataTransfer.setData(
                                CHIP_DRAG_TYPE,
                                chip.key,
                              );
                              event.dataTransfer.effectAllowed = "move";
                              pendingPlaceKeysRef.current = [chip.key];
                              setSelectedKeys([chip.key]);
                              selectionAnchorRef.current = chip.key;
                            }}
                            onDragEnd={() => {
                              pendingPlaceKeysRef.current = null;
                              // 취소·드롭 후 합성 click이 없으면 플래그만 풀어 둔다
                              window.setTimeout(() => {
                                chipDraggedRef.current = false;
                              }, 100);
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              event.preventDefault();
                              // 드래그로 옮긴 뒤 브라우저가 내는 click은 무시
                              if (chipDraggedRef.current) {
                                chipDraggedRef.current = false;
                                return;
                              }
                              if (!activeClass) return;
                              unplaceChip(activeClass.id, chip.key);
                              clearChipSelection();
                              setError("");
                            }}
                            onKeyDown={(event) => {
                              if (
                                event.key !== "Enter" &&
                                event.key !== " "
                              )
                                return;
                              event.stopPropagation();
                              event.preventDefault();
                              if (!activeClass) return;
                              unplaceChip(activeClass.id, chip.key);
                              clearChipSelection();
                              setError("");
                            }}
                            className="cursor-pointer truncate rounded-full bg-[#2F80ED] px-2 py-0.5 text-[10.5px] font-bold text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] active:cursor-grabbing"
                          >
                            {chipTitle(chip)}
                          </span>
                        ))}

                        {isDeadline ? (
                          <span className="truncate rounded-[8px] bg-[#FFF1F3] px-1.5 py-0.5 text-[11px] font-bold text-[#DE3B5A]">
                            마감 {DEADLINE_TIME}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 마감날짜 지정 — 활성 반 일괄 1세트 (캘린더 아래) */}
            <section className="mt-5 shrink-0">
              <div className="min-w-0">
                <h3 className="text-[16.5px] font-bold text-[#172D4A]">
                  마감날짜 지정{activeClass ? ` · ${activeClass.name}` : ""}
                </h3>
                <p className="mt-2.5 text-[12.5px] leading-[1.7] font-medium text-[#6E7278]">
                  이 반에 올린 파트 전체에 같은 마감 규칙을 한 번에 적용해요.
                  <br />
                  마감 날짜까지 학생은 과제를 제출하고, 원하면 재도전을 할 수
                  있어요. 마감 이후에는 점수가 확정돼요.
                </p>
              </div>

              {useBaselineDeadline ? (
                <DeadlineBulkCard
                  className={activeClass?.name ?? ""}
                  lessonDates={[schedule.lessonDate]}
                  deadlineDays={schedule.deadlineDays}
                  deadlineMode={schedule.deadlineMode}
                  teacherClass={activeClass}
                  showLessonDatePicker
                  disabled={!activeClass}
                  onLessonDateChange={(iso) => {
                    if (!activeClass) return;
                    patch(activeClass.id, { lessonDate: iso });
                  }}
                  onPatch={(next) => activeClass && patch(activeClass.id, next)}
                />
              ) : activeDateGroups.length === 0 ? (
                <div className="mt-4 rounded-[14px] border border-dashed border-[#D3D4D7] bg-[#F5F7F9] px-[22px] py-6">
                  <p className="text-[13px] font-semibold text-[#45484D]">
                    캘린더에 파트를 올리면 마감을 정할 수 있어요.
                  </p>
                  <p className="mt-1.5 text-[12px] font-medium text-[#6E7278]">
                    대기열의 칩을 끌어다 놓거나, 칩을 누른 뒤 날짜를 눌러 주세요.
                  </p>
                </div>
              ) : (
                <DeadlineBulkCard
                  className={activeClass?.name ?? ""}
                  lessonDates={activeDateGroups.map((group) => group.lessonDate)}
                  deadlineDays={schedule.deadlineDays}
                  deadlineMode={schedule.deadlineMode}
                  teacherClass={activeClass}
                  disabled={!activeClass}
                  onPatch={(next) => activeClass && patch(activeClass.id, next)}
                />
              )}
            </section>

            <div className="mt-6 flex shrink-0 items-center justify-between gap-3">
              <p
                className="min-w-0 text-[12.5px] font-medium text-[#EF4444]"
                role={error ? "alert" : undefined}
              >
                {error}
              </p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!busy) onClose();
                  }}
                  disabled={busy}
                  className="h-12 w-[78px] cursor-pointer rounded-[9px] border border-[#CCCED0] bg-white text-[15px] font-bold text-[#45484D] hover:bg-[#F9FAFB] disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy}
                  className="h-12 cursor-pointer rounded-[10px] bg-[#2F80ED] px-6 text-[15px] font-bold text-white hover:bg-[#1B6FD8] disabled:opacity-50"
                >
                  {busy ? "저장 중…" : "제출하기"}
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
        </div>
      </div>

      {missingPlacement ? (
        <div
          className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4"
          role="presentation"
          onClick={() => setMissingPlacement(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={missingAlertTitleId}
            className="relative w-full max-w-[400px] overflow-hidden rounded-2xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-7 pt-6 pb-1">
              <h2
                id={missingAlertTitleId}
                className="text-[18px] font-bold tracking-tight text-[#15171A]"
              >
                캘린더에 올려 주세요
              </h2>
              <button
                type="button"
                onClick={() => setMissingPlacement(null)}
                aria-label="닫기"
                className="-mt-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#45484D] hover:bg-[#F3F4F5]"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="max-h-[min(360px,50vh)] overflow-y-auto px-7 pb-2 pt-2">
              <p className="text-[13px] font-medium leading-relaxed text-[#6E7278]">
                아직 올리지 않은 파트가 있어요. 반마다 캘린더에 올려 주세요.
              </p>
              <div className="mt-4 space-y-4">
                {missingPlacement.map((group) => (
                  <section key={group.className}>
                    <h3 className="text-[14px] font-bold text-[#181B1F]">
                      {group.className}
                    </h3>
                    <ul className="mt-1.5 space-y-1">
                      {group.labels.map((label) => (
                        <li
                          key={`${group.className}:${label}`}
                          className="text-[13px] font-medium text-[#45484D]"
                        >
                          {label}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
            <div className="flex justify-end px-7 py-5">
              <button
                type="button"
                onClick={() => setMissingPlacement(null)}
                className="h-10 cursor-pointer rounded-[10px] bg-[#2F80ED] px-5 text-[14px] font-bold text-white hover:bg-[#1B6FD8]"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatKoDate(isoDate: string): string {
  const date = parseIso(isoDate);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/** 활성 반 일괄 마감 — 토글 · N일/다음 수업 · 수업일별 요약 */
function DeadlineBulkCard({
  className,
  lessonDates,
  deadlineDays,
  deadlineMode,
  teacherClass,
  showLessonDatePicker = false,
  disabled,
  onPatch,
  onLessonDateChange,
}: {
  className: string;
  /** 요약·다음 수업 계산에 쓰는 수업일(들). 직접 설정 피커가 있으면 보통 1개 */
  lessonDates: string[];
  deadlineDays: number;
  deadlineMode: DeadlineMode;
  teacherClass: TeacherClass | null;
  showLessonDatePicker?: boolean;
  disabled: boolean;
  onPatch: (
    next: Partial<Pick<ClassSchedule, "deadlineDays" | "deadlineMode">>,
  ) => void;
  onLessonDateChange?: (iso: string) => void;
}) {
  const primaryLesson = lessonDates[0] ?? toLocalIsoDate(new Date());
  const summaries = lessonDates.map((lessonDate) => {
    const days = resolveDeadlineDays(
      teacherClass ?? undefined,
      { deadlineDays, deadlineMode },
      lessonDate,
    );
    return {
      lessonDate,
      deadlineIso: isoDaysFrom(lessonDate, days),
    };
  });

  return (
    <div className="mt-4 rounded-[14px] bg-[#F5F7F9] px-[22px] py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h4 className="min-w-0 text-[14.5px] font-bold text-[#172D4A]">
          일괄 마감
        </h4>
        <div
          className="flex shrink-0 rounded-[10px] bg-[#E9EBEE] p-[3px]"
          role="tablist"
          aria-label={`${className} 마감 설정 방식`}
        >
          {(
            [
              { id: "manual" as const, label: "직접 설정" },
              {
                id: "until_next_class" as const,
                label: "다음 수업 전까지",
              },
            ] as const
          ).map((option) => {
            const on = deadlineMode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={on}
                disabled={disabled}
                onClick={() => onPatch({ deadlineMode: option.id })}
                className={`h-[32px] cursor-pointer rounded-[8px] px-3.5 text-[12.5px] font-bold transition-colors disabled:opacity-50 ${
                  on
                    ? "bg-white text-[#181B1F] shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                    : "text-[#6E7278] hover:text-[#45484D]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {deadlineMode === "manual" ? (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            {showLessonDatePicker ? (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold text-[#9A9DA3]">
                    기준 수업일
                  </span>
                  <input
                    type="date"
                    value={primaryLesson}
                    disabled={disabled}
                    onChange={(event) =>
                      onLessonDateChange?.(event.target.value)
                    }
                    aria-label={`${className} 기준 수업일`}
                    className="h-[45px] w-[199px] rounded-[9px] border border-[#D3D4D7] bg-[#F0F1F3] px-3.5 text-[12.5px] font-semibold text-[#45484D] outline-none focus:border-[#229FFF]"
                  />
                </label>
                <span className="pb-3.5 text-[#9A9DA3]" aria-hidden>
                  →
                </span>
              </>
            ) : null}
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-[#9A9DA3]">
                마감까지
              </span>
              <span className="flex h-[45px] w-[167px] items-center rounded-[9px] border border-[#D3D4D7] bg-[#FDFDFE] px-3.5">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={deadlineDays}
                  disabled={disabled}
                  onChange={(event) =>
                    onPatch({
                      deadlineDays: Math.max(
                        0,
                        Math.min(60, Number(event.target.value) || 0),
                      ),
                    })
                  }
                  aria-label={`${className} 마감까지 며칠`}
                  className="w-10 bg-transparent text-[12.5px] font-bold text-[#1F2227] outline-none"
                />
                <span className="ml-auto text-[13px] font-semibold text-[#6E7278]">
                  일 뒤
                </span>
              </span>
            </label>
          </div>

          <div className="mt-3 flex gap-2">
            {DEADLINE_PRESETS.map((presetDays) => {
              const on = deadlineDays === presetDays;
              return (
                <button
                  key={presetDays}
                  type="button"
                  disabled={disabled}
                  aria-pressed={on}
                  onClick={() => onPatch({ deadlineDays: presetDays })}
                  className={`h-[25px] cursor-pointer rounded-full border px-3 text-[12.5px] font-semibold transition-colors ${
                    on
                      ? "border-[#229FFF] bg-[#229FFF] text-white"
                      : "border-[#D3D4D7] bg-[#FDFDFE] text-[#6E7278] hover:bg-[#F0F1F3]"
                  }`}
                >
                  {presetDays}일
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-[10px] border border-[#E4E5E8] bg-white px-4 py-3.5">
          <p className="text-[13px] font-semibold text-[#181B1F]">
            각 수업일 다음 수업 전날 23:59에 마감돼요.
          </p>
          <p className="mt-1 text-[12px] font-medium text-[#6E7278]">
            다음에 잡힌 수업이 없으면 직접 설정의 일수를 써요.
          </p>
        </div>
      )}

      <div className="mt-3.5 flex flex-col gap-1">
        {summaries.map(({ lessonDate, deadlineIso }) => (
          <p
            key={lessonDate}
            className="text-[12px] font-medium text-[#45484D]"
          >
            <b className="font-bold text-[#1F2227]">{formatKoDate(lessonDate)}</b>
            <span className="text-[#9A9DA3]"> 수업 · </span>
            <span className="text-[#DE3B5A]">
              마감 {formatKoDate(deadlineIso)} {DEADLINE_TIME}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 왼쪽 트레이 카드 — `part-assign-sidebar.svg` 시안을 좁게 (라벨 좌 · n문항 우) */
function TrayPartCard({
  label,
  count,
  selected,
  compact = false,
  onDragStart,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  compact?: boolean;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      draggable
      aria-pressed={selected}
      aria-label={`${label} · ${count}문항 · 옮길 날짜 선택`}
      onDragStart={onDragStart}
      onClick={onClick}
      className={`flex w-full cursor-grab items-center gap-1.5 border text-left transition-colors active:cursor-grabbing ${
        compact
          ? "rounded-[10px] px-2 py-1.5"
          : "rounded-[12px] px-2.5 py-2 shadow-[0_1px_2px_rgba(20,22,26,0.03)]"
      } ${
        selected
          ? "border-[#1B6FD8] bg-[#F0F7FD] shadow-[0_0_0_1px_#1B6FD8]"
          : "border-[#E2E5EB] bg-white hover:border-[#D0D4DB]"
      }`}
    >
      <span className="opacity-50 text-[#14161A]" aria-hidden>
        <GripIcon size="sm" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-[#14161A]">
        {label}
      </span>
      <span className="shrink-0 text-[11px] font-medium text-[#8B919C]">
        {count}문항
      </span>
    </button>
  );
}

function GripIcon({ size = "sm" }: { size?: "sm" | "lg" }) {
  const large = size === "lg";
  return (
    <svg
      width={large ? 10 : 7}
      height={large ? 16 : 12}
      viewBox={large ? "0 0 10 16" : "0 0 7 12"}
      fill="none"
      aria-hidden
    >
      {large ? (
        <>
          <circle cx="2.2" cy="2.2" r="1.6" fill="currentColor" />
          <circle cx="7.8" cy="2.2" r="1.6" fill="currentColor" />
          <circle cx="2.2" cy="8" r="1.6" fill="currentColor" />
          <circle cx="7.8" cy="8" r="1.6" fill="currentColor" />
          <circle cx="2.2" cy="13.8" r="1.6" fill="currentColor" />
          <circle cx="7.8" cy="13.8" r="1.6" fill="currentColor" />
        </>
      ) : (
        <>
          <circle cx="1.5" cy="1.5" r="1.2" fill="currentColor" />
          <circle cx="5.5" cy="1.5" r="1.2" fill="currentColor" />
          <circle cx="1.5" cy="6" r="1.2" fill="currentColor" />
          <circle cx="5.5" cy="6" r="1.2" fill="currentColor" />
          <circle cx="1.5" cy="10.5" r="1.2" fill="currentColor" />
          <circle cx="5.5" cy="10.5" r="1.2" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden>
      <path
        d={direction === "left" ? "M6 1 1 6l5 5" : "M1 1l5 5-5 5"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
