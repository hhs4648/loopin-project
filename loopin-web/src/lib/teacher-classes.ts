export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type ClassScheduleMode = "unified" | "per-day";

export type ClassTimeRange = {
  start: string; // "HH:MM"
  end: string;
};

export type ClassColorTheme = {
  id: string;
  label: string;
  /** 반 색상 (사이드바 아이콘) */
  class: string;
  /** 캘린더 배경 */
  calendar: string;
  /** 캘린더 바 */
  bar: string;
  /** 캘린더 내부 글씨 */
  text: string;
};

/** uiux.md — 반 색상 팔레트 8종 */
export const CLASS_COLOR_THEMES: ClassColorTheme[] = [
  {
    id: "red",
    label: "빨강",
    class: "#FF373A",
    calendar: "#FEE7E7",
    bar: "#F16163",
    text: "#C52B2B",
  },
  {
    id: "yellow",
    label: "노랑",
    class: "#FFD552",
    calendar: "#FEF9E7",
    bar: "#F1CF61",
    text: "#A99A12",
  },
  {
    id: "green",
    label: "초록",
    class: "#A4D24C",
    calendar: "#F2FEE7",
    bar: "#A4D24C",
    text: "#6AA912",
  },
  {
    id: "cyan",
    label: "민트",
    class: "#48ECD3",
    calendar: "#E7FEFE",
    bar: "#5FCCD7",
    text: "#128DA9",
  },
  {
    id: "blue",
    label: "파랑",
    class: "#1AA7F2",
    calendar: "#E7F5FE",
    bar: "#4C91D2",
    text: "#1274A9",
  },
  {
    id: "indigo",
    label: "남색",
    class: "#554CD2",
    calendar: "#E7E8FE",
    bar: "#4C5ED2",
    text: "#1247A9",
  },
  {
    id: "purple",
    label: "보라",
    class: "#934CD2",
    calendar: "#F1E7FE",
    bar: "#824CD2",
    text: "#4212A9",
  },
  {
    id: "pink",
    label: "분홍",
    class: "#D24CA8",
    calendar: "#FEE7F7",
    bar: "#D24CAC",
    text: "#A91279",
  },
];

export const WEEKDAYS: { id: Weekday; label: string }[] = [
  { id: "mon", label: "월" },
  { id: "tue", label: "화" },
  { id: "wed", label: "수" },
  { id: "thu", label: "목" },
  { id: "fri", label: "금" },
  { id: "sat", label: "토" },
  { id: "sun", label: "일" },
];

/** HH:MM. 종료가 시작보다 늦어야 함(같은 시각·역전 불가). */
export function isClassTimeRangeValid(range: ClassTimeRange): boolean {
  return Boolean(range.start && range.end && range.start < range.end);
}

export const CLASS_TIME_ORDER_ERROR =
  "종료 시간은 시작 시간보다 늦어야 해요. 다시 설정해 주세요";

export function classScheduleTimeError(
  scheduleMode: ClassScheduleMode,
  unifiedTime: ClassTimeRange,
  days: Weekday[],
  dayTimes: Partial<Record<Weekday, ClassTimeRange>>,
  fallback: ClassTimeRange,
): string | null {
  if (scheduleMode !== "per-day") {
    return isClassTimeRangeValid(unifiedTime) ? null : CLASS_TIME_ORDER_ERROR;
  }
  for (const day of days) {
    const t = dayTimes[day] ?? fallback;
    if (!isClassTimeRangeValid(t)) {
      const label = WEEKDAYS.find((w) => w.id === day)?.label ?? day;
      return `${label}요일 종료 시간은 시작 시간보다 늦어야 해요. 다시 설정해 주세요`;
    }
  }
  return null;
}

export const WEEKDAY_ORDER: Weekday[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

/** "월·수·금 18:00–20:00" 또는 요일별 시간이 다르면 "월 18:00–19:00 · 수 16:00–18:00" */
export function formatClassWeeklySchedule(c: TeacherClass): string {
  const days = WEEKDAY_ORDER.filter((d) => c.days.includes(d));
  if (days.length === 0) return "미설정";

  if (c.scheduleMode !== "per-day") {
    const t = c.unifiedTime;
    if (!t?.start || !t?.end) return "미설정";
    const dayPart = days
      .map((d) => WEEKDAYS.find((w) => w.id === d)?.label ?? d)
      .join("·");
    return `${dayPart} ${t.start}–${t.end}`;
  }

  const parts: string[] = [];
  for (const d of days) {
    const t = c.dayTimes?.[d];
    if (!t?.start || !t?.end) continue;
    const label = WEEKDAYS.find((w) => w.id === d)?.label ?? d;
    parts.push(`${label} ${t.start}–${t.end}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "미설정";
}

/** 가장 이른 개강일 → "2026년 3월 2일" · 없으면 미설정 */
export function formatClassOpeningDate(c: TeacherClass): string {
  const starts = (c.periods ?? [])
    .map((p) => p.startDate)
    .filter(Boolean)
    .sort();
  const iso = starts[0];
  if (!iso) return "미설정";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[1])}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}
export const GRADE_OPTIONS = ["중1", "중2", "중3"] as const;
/** 여러 학년이 섞인 반 — 사이드바 토글·반 만들기 선택값 */
export const MIXED_GRADE_LABEL = "학년 혼합";
/** 반 만들기·설정에서 고를 수 있는 학년 (교과서 학년 + 혼합) */
export const CLASS_GRADE_OPTIONS = [
  ...GRADE_OPTIONS,
  MIXED_GRADE_LABEL,
] as const;

export function isMiddleSchoolGrade(
  grade: string | undefined,
): grade is (typeof GRADE_OPTIONS)[number] {
  return GRADE_OPTIONS.some((option) => option === grade);
}

/** 중1~중3이 아니면 학년 혼합(빈 값·옛 데이터 포함) */
export function isMixedGrade(grade: string | undefined): boolean {
  return !isMiddleSchoolGrade(grade);
}

export function classGradeLabel(grade: string | undefined): string {
  return isMiddleSchoolGrade(grade) ? grade : MIXED_GRADE_LABEL;
}

export type ClassPeriod = {
  id: string;
  /** 수업 기간 이름 (예: 1학기 중간고사) */
  name: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD — 없으면 개강일 다음 해 2월 말까지 캘린더에 표시 */
  endDate?: string;
};

export type TeacherClass = {
  id: string;
  name: string;
  grade?: string;
  colorThemeId: string;
  /** 사이드바 아이콘용 (반 색상) */
  color: string;
  colors: Pick<ClassColorTheme, "class" | "calendar" | "bar" | "text">;
  days: Weekday[];
  scheduleMode: ClassScheduleMode;
  unifiedTime?: ClassTimeRange;
  dayTimes?: Partial<Record<Weekday, ClassTimeRange>>;
  /** 수업 기간 (여러 개) */
  periods: ClassPeriod[];
  /** @deprecated periods 로 이전됨 */
  startDate?: string;
  /** @deprecated periods 로 이전됨 */
  endDate?: string;
  /** @deprecated periods 로 이전됨 */
  periodName?: string;
  /** 반 설명 (설정 탭) */
  description?: string;
  /** 영구 6자리 초대코드 (A–Z, 2–9) */
  inviteCode?: string;
  /** 요일별 캘린더 메모 (정규 수업 · 홈 「메모」와 공유) */
  dayLessonMeta?: Partial<
    Record<Weekday, { title?: string; note?: string }>
  >;
  createdAt: string;
};

const STORAGE_KEY = "haksup-teacher-classes";

export function getColorTheme(id: string): ClassColorTheme {
  return (
    CLASS_COLOR_THEMES.find((t) => t.id === id) ?? CLASS_COLOR_THEMES[2]
  );
}

export function loadTeacherClasses(): TeacherClass[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TeacherClass[];
    const list = Array.isArray(parsed) ? parsed.map(normalizeClass) : [];
    return ensureInviteCodes(migrateUnsafeClassIds(list));
  } catch {
    return [];
  }
}

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function createInviteCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 40; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)]!;
    }
    if (!existing.has(code)) return code;
  }
  return `L${Date.now().toString(36).slice(-5).toUpperCase()}`.slice(0, 6);
}

/** 기존 반에 초대코드가 없으면 충돌 없이 생성해 저장 */
function ensureInviteCodes(classes: TeacherClass[]): TeacherClass[] {
  const existing = new Set(
    classes
      .map((c) => c.inviteCode?.toUpperCase())
      .filter((c): c is string => Boolean(c)),
  );
  let changed = false;
  const next = classes.map((item) => {
    if (item.inviteCode && /^[A-Z0-9]{6}$/.test(item.inviteCode)) return item;
    changed = true;
    const inviteCode = createInviteCode(existing);
    existing.add(inviteCode);
    return { ...item, inviteCode };
  });
  if (changed) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

/** 라우트에 불안한 한글·특수문자 id → ASCII 로 한 번만 교체 */
function migrateUnsafeClassIds(classes: TeacherClass[]): TeacherClass[] {
  let changed = false;
  const remaps: Record<string, string> = (() => {
    try {
      return JSON.parse(
        window.localStorage.getItem(REMAP_KEY) || "{}",
      ) as Record<string, string>;
    } catch {
      return {};
    }
  })();

  const next = classes.map((item) => {
    if (isSafeClassId(item.id)) return item;
    changed = true;
    const newId = createClassId();
    remaps[item.id] = newId;
    migrateStudentStorageKey(item.id, newId);
    return { ...item, id: newId };
  });
  if (changed) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.localStorage.setItem(REMAP_KEY, JSON.stringify(remaps));
  }
  return next;
}

function isSafeClassId(id: string): boolean {
  return /^[a-z0-9-]+$/i.test(id);
}

function migrateStudentStorageKey(oldId: string, newId: string): void {
  const oldKey = `haksup-class-students:${oldId}`;
  const raw = window.localStorage.getItem(oldKey);
  if (raw == null) return;
  window.localStorage.setItem(`haksup-class-students:${newId}`, raw);
  window.localStorage.removeItem(oldKey);
}

function normalizeClass(item: TeacherClass): TeacherClass {
  const theme = getColorTheme(item.colorThemeId || "green");
  const periods = normalizePeriods(item);
  return {
    ...item,
    colorThemeId: theme.id,
    color: item.color || theme.class,
    colors: item.colors ?? {
      class: theme.class,
      calendar: theme.calendar,
      bar: theme.bar,
      text: theme.text,
    },
    days: item.days ?? [],
    scheduleMode: item.scheduleMode ?? "unified",
    periods,
    periodName: undefined,
    startDate: undefined,
    endDate: undefined,
  };
}

function normalizePeriods(item: TeacherClass): ClassPeriod[] {
  if (Array.isArray(item.periods) && item.periods.length > 0) {
    return item.periods
      .filter((p) => p && p.name && p.startDate)
      .map((p) => ({
        id: p.id || createPeriodId(),
        name: p.name.trim(),
        startDate: p.startDate,
        endDate: p.endDate || undefined,
      }));
  }
  // 구버전 단일 필드 → 배열
  if (item.startDate || item.periodName) {
    return [
      {
        id: createPeriodId(),
        name: (item.periodName || "수업 기간").trim(),
        startDate: item.startDate || toTodayIso(),
        endDate: item.endDate || undefined,
      },
    ];
  }
  return [];
}

export function todayIsoDate(): string {
  return toTodayIso();
}

function toTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function createPeriodId(): string {
  return `period-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** YYYY-MM-DD → 로컬 자정 Date */
export function parseIsoDateLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * 해당 날짜가 반의 **수업 기간** 안인지.
 * 기간이 없으면 false (캘린더에 자동 생성 안 함).
 * 종강일이 없으면 개강일 다음 해 2월 말까지 포함.
 */
export function isDateInClassPeriods(
  teacherClass: TeacherClass,
  date: Date,
): boolean {
  const periods = teacherClass.periods ?? [];
  if (periods.length === 0) return false;
  const t = startOfLocalDay(date).getTime();
  return periods.some((p) => {
    const start = parseIsoDateLocal(p.startDate);
    if (!start) return false;
    if (t < start.getTime()) return false;
    if (!p.endDate) {
      const defaultEnd = new Date(start.getFullYear() + 1, 2, 0);
      return t <= defaultEnd.getTime();
    }
    const end = parseIsoDateLocal(p.endDate);
    if (!end) return true;
    return t <= end.getTime();
  });
}


export function saveTeacherClasses(classes: TeacherClass[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(classes));
}

/** URL path에 안전한 ASCII id (한글 slug는 라우트 매칭이 깨질 수 있음) */
export function createClassId(_name?: string): string {
  return `class-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 새 반 생성 시 사용할 초대코드 */
export function createNewInviteCode(classes: TeacherClass[]): string {
  const existing = new Set(
    classes
      .map((c) => c.inviteCode?.toUpperCase())
      .filter((c): c is string => Boolean(c)),
  );
  return createInviteCode(existing);
}

const REMAP_KEY = "haksup-class-id-remap";

/** Next params / Link 인코딩 차이를 흡수 */
export function resolveClassId(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function getRemappedClassId(raw?: string | null): string | undefined {
  const id = resolveClassId(raw);
  if (!id || typeof window === "undefined") return id;
  try {
    const remaps = JSON.parse(
      window.localStorage.getItem(REMAP_KEY) || "{}",
    ) as Record<string, string>;
    return remaps[id] ?? id;
  } catch {
    return id;
  }
}

export function classIdsEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const ra = getRemappedClassId(a);
  const rb = getRemappedClassId(b);
  return ra === rb || resolveClassId(a) === resolveClassId(b);
}

export function findTeacherClass(
  classes: TeacherClass[],
  rawId?: string | null,
): TeacherClass | null {
  const id = getRemappedClassId(rawId);
  if (!id) return null;
  return (
    classes.find((c) => c.id === id) ??
    classes.find((c) => classIdsEqual(c.id, rawId)) ??
    null
  );
}

/** @deprecated use CLASS_COLOR_THEMES */
export const CLASS_COLOR_PRESETS = CLASS_COLOR_THEMES.map((t) => ({
  id: t.id,
  value: t.class,
  label: t.label,
}));
