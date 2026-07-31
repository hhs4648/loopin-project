import {
  DEFAULT_ACADEMIC_SCHEDULE,
  shouldSkipRecurringClass,
  type AcademicScheduleSettings,
} from "@/lib/calendar-academic-schedule";
import {
  isDateInClassPeriods,
  parseIsoDateLocal,
  type ClassTimeRange,
  type TeacherClass,
  type Weekday,
} from "@/lib/teacher-classes";
import type { OneOffLesson } from "@/lib/calendar-one-off-lessons";

const GRID_LEFT = 320.461;
const GRID_RIGHT = 1276.16;
const GRID_WIDTH = GRID_RIGHT - GRID_LEFT;
const DAY_COUNT = 7;
const COL_WIDTH = GRID_WIDTH / DAY_COUNT;

/**
 * calendar-home.svg 주간 그리드.
 * 수업 피커와 동일하게 **06:00–22:00** 전 구간을 다루고,
 * 화면에는 `top`–`bottom` 뷰포트만 보이며 세로 스크롤.
 */
export const CAL_GRID = {
  left: GRID_LEFT,
  /** 요일·날짜 바로 아래 — 날짜 행과의 여백 최소화 */
  top: 252,
  right: GRID_RIGHT,
  bottom: 966.514,
  /** SVG 시간 숫자 영역 왼쪽 */
  gutterLeft: 268,
  colWidth: COL_WIDTH,
  /** 시간당 칸 높이 (스크롤 영역 안 · 기존 83.246 → 여유 있게) */
  rowHeight: 96,
  dayStarts: Array.from(
    { length: DAY_COUNT },
    (_, i) => GRID_LEFT + i * COL_WIDTH,
  ) as number[],
  /** 수업 피커 MIN · 오전 6시 */
  visibleStartHour: 6,
  /** 수업 피커 MAX · 오후 10시 */
  visibleEndHour: 22,
  /** 첫 로드 시 뷰를 맞출 시각 (기존 09시 구간에 가깝게) */
  initialScrollHour: 9,
  eventInsetX: 4.5,
  eventWidth: COL_WIDTH - 9,
  eventPadY: 4,
  barWidth: 3.24333,
  radius: 12,
  headerTop: 168,
  headerHeight: 78,
  /** 월간과 동일 스타일 요일 바 — 네비 바로 아래 */
  weekdayBarTop: 178,
  weekdayBarHeight: 32,
  dateRowTop: 214,
  dateRowHeight: 28,
} as const;

/**
 * 오른쪽 오늘 사이드바 — 사이드바 「캘린더」 행·주간 네비(`CAL_PERIOD_NAV` top 128)와 동일 높이.
 */
export const CAL_TODAY_SIDEBAR = {
  railLeft: 1317,
  railWidth: 240,
  contentLeft: 1325,
  contentWidth: 216,
  headerTop: 128,
  headerHeight: 44,
  sectionGap: 24,
  classesTop: 128 + 44 + 24,
  assignmentsOffset: 192,
} as const;

/** 06:00–22:00 슬롯 수 (끝 시각은 라벨·드롭 상한) */
export function calendarHourSpan(): number {
  return CAL_GRID.visibleEndHour - CAL_GRID.visibleStartHour;
}

export function calendarContentHeight(): number {
  return calendarHourSpan() * CAL_GRID.rowHeight;
}

export function calendarViewportHeight(): number {
  return CAL_GRID.bottom - CAL_GRID.top;
}

export const CAL_WEEKDAYS: Weekday[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

export const CAL_DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"] as const;

export type CalendarClassEvent = {
  key: string;
  classId: string;
  /** 정규 시간표가 아닌 단일 추가 수업 */
  oneOffLessonId?: string;
  className: string;
  lessonTitle?: string;
  note?: string;
  day: Weekday;
  dayIndex: number;
  start: string;
  end: string;
  startMin: number;
  endMin: number;
  colors: TeacherClass["colors"];
};

export function calendarEventLabelsFromClass(
  c: TeacherClass,
  day: Weekday,
): Pick<CalendarClassEvent, "className" | "lessonTitle" | "note"> {
  const meta = c.dayLessonMeta?.[day];
  return {
    className: c.name,
    lessonTitle: meta?.title?.trim() || undefined,
    note: meta?.note?.trim() || undefined,
  };
}

export function calendarEventLabelsFromOneOff(
  lesson: OneOffLesson,
  c: TeacherClass,
): Pick<CalendarClassEvent, "className" | "lessonTitle" | "note"> {
  return {
    className: c.name,
    lessonTitle: lesson.title?.trim() || undefined,
    note: lesson.note?.trim() || undefined,
  };
}

export function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

export function minutesToHhmm(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 5, total));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function snapMinutes(min: number, step = 5): number {
  return Math.round(min / step) * step;
}

/** 해당 날짜가 속한 주의 월요일 00:00 */
export function startOfWeekMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0=일
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** ISO-ish week number (월 시작) */
export function weekNumber(monday: Date): number {
  const jan1 = new Date(monday.getFullYear(), 0, 1);
  const days = Math.floor(
    (monday.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000),
  );
  return Math.floor(days / 7) + 1;
}

export function formatWeekRangeLabel(monday: Date): string {
  const sunday = addDays(monday, 6);
  const fmt = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${fmt(monday)} ~ ${fmt(sunday)} (${weekNumber(monday)}주차)`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** weekMonday(00:00) ~ 일요일 23:59:59 */
export function isDateInWeek(date: Date, weekMonday: Date): boolean {
  const start = new Date(weekMonday);
  start.setHours(0, 0, 0, 0);
  const end = addDays(start, 7);
  return date >= start && date < end;
}

/**
 * 스크롤 콘텐츠 Y (0 = visibleStartHour:00).
 * 06:00–22:00 밖이면 null.
 */
export function currentTimeContentY(now = new Date()): number | null {
  const windowStart = CAL_GRID.visibleStartHour * 60;
  const windowEnd = CAL_GRID.visibleEndHour * 60;
  const nowMin =
    now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  if (nowMin < windowStart || nowMin > windowEnd) return null;
  return ((nowMin - windowStart) / 60) * CAL_GRID.rowHeight;
}

export function resolveClassDayTime(
  c: TeacherClass,
  day: Weekday,
): ClassTimeRange | null {
  if (c.scheduleMode === "per-day") {
    const t = c.dayTimes?.[day];
    if (t?.start && t?.end) return t;
    return null;
  }
  if (c.unifiedTime?.start && c.unifiedTime?.end) return c.unifiedTime;
  return null;
}

/** JS Date → 우리 Weekday (월 시작 배열과 무관, getDay 매핑) */
export function weekdayFromDate(d: Date): Weekday {
  const map: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[d.getDay()]!;
}

export type NextClassOccurrence = {
  date: Date;
  start: string;
  end: string;
  /** 정규 시간표 vs 단일 추가 수업 */
  source: "recurring" | "oneOff";
  weekday: Weekday;
  /** source === "oneOff" 일 때 */
  oneOffLessonId?: string;
  /**
   * 캘린더·홈 「메모」와 동일한 값.
   * 정규 → `dayLessonMeta[weekday].title` · 추가 → `OneOffLesson.title`
   */
  title?: string;
};

/**
 * 오늘(`from`) 기준 **다음 수업** 1건.
 * 정규 수업과 해당 반의 단일 추가 수업 중 가장 이른 날짜.
 * 오늘은 시작 시각이 아직 지나지 않았을 때만 포함.
 * 학사 휴일·(설정 시) 공휴일에는 정규 수업을 건너뛴다. 추가 수업은 유지.
 */
export function getNextClassOccurrence(
  c: TeacherClass,
  from: Date = new Date(),
  oneOffLessons: OneOffLesson[] = [],
  academicSchedule: AcademicScheduleSettings = DEFAULT_ACADEMIC_SCHEDULE,
): NextClassOccurrence | null {
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const fromMin = from.getHours() * 60 + from.getMinutes();
  let recurring: NextClassOccurrence | null = null;
  for (let i = 0; i <= 366; i++) {
    const date = addDays(base, i);
    const day = weekdayFromDate(date);
    if (!c.days.includes(day)) continue;
    if (!isDateInClassPeriods(c, date)) continue;
    if (shouldSkipRecurringClass(date, academicSchedule)) continue;
    const time = resolveClassDayTime(c, day);
    if (!time) continue;
    const startMin = hhmmToMinutes(time.start);
    if (!Number.isFinite(startMin)) continue;
    if (i === 0 && startMin < fromMin) continue;
    const title = c.dayLessonMeta?.[day]?.title?.trim() || undefined;
    recurring = {
      date,
      start: time.start,
      end: time.end,
      source: "recurring",
      weekday: day,
      title,
    };
    break;
  }

  let added: NextClassOccurrence | null = null;
  for (const lesson of oneOffLessons) {
    if (lesson.classId !== c.id) continue;
    const date = parseIsoDateLocal(lesson.date);
    const startMin = hhmmToMinutes(lesson.start);
    const endMin = hhmmToMinutes(lesson.end);
    if (
      !date ||
      !Number.isFinite(startMin) ||
      !Number.isFinite(endMin) ||
      endMin <= startMin
    ) {
      continue;
    }
    const dayOffset = Math.round(
      (date.getTime() - base.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (dayOffset < 0 || (dayOffset === 0 && startMin < fromMin)) continue;
    const candidate: NextClassOccurrence = {
      date,
      start: lesson.start,
      end: lesson.end,
      source: "oneOff",
      weekday: weekdayFromDate(date),
      oneOffLessonId: lesson.id,
      title: lesson.title?.trim() || undefined,
    };
    if (
      !added ||
      occurrenceTimestamp(candidate) < occurrenceTimestamp(added)
    ) {
      added = candidate;
    }
  }

  if (!recurring) return added;
  if (!added) return recurring;
  return occurrenceTimestamp(added) < occurrenceTimestamp(recurring)
    ? added
    : recurring;
}

function occurrenceTimestamp(occurrence: NextClassOccurrence): number {
  return (
    occurrence.date.getTime() +
    hhmmToMinutes(occurrence.start) * 60 * 1000
  );
}

const KO_WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "7월 20일 (월)" */
export function formatNextClassDate(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${KO_WEEKDAY[d.getDay()]})`;
}

/** 해당 주의 월–일에 대해, 수업 기간 안에 드는 요일만 일정 생성 */
export function buildCalendarEvents(
  classes: TeacherClass[],
  weekMonday: Date,
  academicSchedule: AcademicScheduleSettings = DEFAULT_ACADEMIC_SCHEDULE,
): CalendarClassEvent[] {
  const events: CalendarClassEvent[] = [];
  for (const c of classes) {
    for (let dayIndex = 0; dayIndex < CAL_WEEKDAYS.length; dayIndex++) {
      const day = CAL_WEEKDAYS[dayIndex]!;
      if (!c.days.includes(day)) continue;
      const date = addDays(weekMonday, dayIndex);
      if (!isDateInClassPeriods(c, date)) continue;
      if (shouldSkipRecurringClass(date, academicSchedule)) continue;
      const time = resolveClassDayTime(c, day);
      if (!time) continue;
      const startMin = hhmmToMinutes(time.start);
      const endMin = hhmmToMinutes(time.end);
      if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) continue;
      if (endMin <= startMin) continue;
      events.push({
        key: `${c.id}:${day}`,
        classId: c.id,
        ...calendarEventLabelsFromClass(c, day),
        day,
        dayIndex,
        start: time.start,
        end: time.end,
        startMin,
        endMin,
        colors: c.colors,
      });
    }
  }
  return events;
}

/**
 * 스크롤 콘텐츠 기준 좌표 (top=0 = visibleStartHour:00).
 * `left`는 프레임(SVG) X.
 */
export function eventRect(ev: {
  dayIndex: number;
  startMin: number;
  endMin: number;
}): { left: number; top: number; width: number; height: number } | null {
  const { rowHeight, eventInsetX, eventWidth, eventPadY } = CAL_GRID;
  const dayStart = CAL_GRID.dayStarts[ev.dayIndex];
  if (dayStart == null) return null;

  const windowStart = CAL_GRID.visibleStartHour * 60;
  const windowEnd = CAL_GRID.visibleEndHour * 60;
  const start = Math.max(ev.startMin, windowStart);
  const end = Math.min(ev.endMin, windowEnd);
  if (end <= start) return null;

  const y = ((start - windowStart) / 60) * rowHeight + eventPadY;
  const h = Math.max(
    28,
    ((end - start) / 60) * rowHeight - eventPadY * 2,
  );

  return {
    left: dayStart + eventInsetX,
    top: y,
    width: eventWidth,
    height: h,
  };
}

/**
 * @param x 프레임 X
 * @param contentY 스크롤 콘텐츠 Y (0 = visibleStartHour:00)
 */
export function pointToDayAndStart(
  x: number,
  contentY: number,
  durationMin: number,
): { day: Weekday; dayIndex: number; start: string; end: string } {
  let best = 0;
  let bestDist = Infinity;
  CAL_GRID.dayStarts.forEach((sx, i) => {
    const center = sx + CAL_GRID.colWidth / 2;
    const d = Math.abs(x - center);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });

  const windowStart = CAL_GRID.visibleStartHour * 60;
  const windowEnd = CAL_GRID.visibleEndHour * 60;
  const rawStart =
    windowStart +
    ((contentY - CAL_GRID.eventPadY) / CAL_GRID.rowHeight) * 60;
  let startMin = snapMinutes(rawStart);
  startMin = Math.max(windowStart, Math.min(windowEnd - 5, startMin));
  let endMin = startMin + Math.max(5, durationMin);
  if (endMin > windowEnd) {
    endMin = windowEnd;
    startMin = Math.max(windowStart, endMin - Math.max(5, durationMin));
    startMin = snapMinutes(startMin);
  }

  return {
    day: CAL_WEEKDAYS[best]!,
    dayIndex: best,
    start: minutesToHhmm(startMin),
    end: minutesToHhmm(endMin),
  };
}

/** 드래그로 요일·시간이 바뀌면 해당 반 일정에 반영 */
export function applyCalendarMove(
  c: TeacherClass,
  fromDay: Weekday,
  toDay: Weekday,
  time: ClassTimeRange,
): TeacherClass {
  const otherDays = c.days.filter((d) => d !== fromDay);
  const nextDays = otherDays.includes(toDay)
    ? otherDays
    : [...otherDays, toDay].sort(
        (a, b) => CAL_WEEKDAYS.indexOf(a) - CAL_WEEKDAYS.indexOf(b),
      );

  const dayTimes: Partial<Record<Weekday, ClassTimeRange>> = {};
  for (const d of otherDays) {
    const t = resolveClassDayTime(c, d);
    if (t) dayTimes[d] = t;
  }
  dayTimes[toDay] = time;

  const dayLessonMeta = { ...(c.dayLessonMeta ?? {}) };
  if (fromDay !== toDay && dayLessonMeta[fromDay]) {
    dayLessonMeta[toDay] = dayLessonMeta[fromDay];
    delete dayLessonMeta[fromDay];
  }

  return {
    ...c,
    days: nextDays.length ? nextDays : [toDay],
    scheduleMode: "per-day",
    dayTimes,
    unifiedTime: undefined,
    dayLessonMeta:
      Object.keys(dayLessonMeta).length > 0 ? dayLessonMeta : undefined,
  };
}
