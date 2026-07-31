import {
  DEFAULT_ACADEMIC_SCHEDULE,
  shouldSkipRecurringClass,
  type AcademicScheduleSettings,
} from "@/lib/calendar-academic-schedule";
import {
  CAL_WEEKDAYS,
  addDays,
  calendarEventLabelsFromClass,
  isSameDay,
  resolveClassDayTime,
  startOfWeekMonday,
} from "@/lib/calendar-layout";
import {
  isDateInClassPeriods,
  type TeacherClass,
  type Weekday,
} from "@/lib/teacher-classes";

/**
 * 월간 패널 — 왼쪽 사이드바(~238) 오른쪽 ~ 오른쪽 레일(~1317) 직전까지.
 * 오른쪽 「오늘 수업」사이드가 잘리지 않게 폭을 제한.
 */
export const MONTH_LAYOUT = {
  frameLeft: 268,
  frameTop: 0,
  frameWidth: 1040, // 268+1040=1308 < 1317
  frameHeight: 973,
  padX: 28,
  titleTop: 36,
  navTop: 108,
  navSize: 31,
  /** 월 이동 행 / 범례 행 (주간과 동일 Y: CAL_PERIOD_NAV_LAYOUT.top=128) */
  chromeRowTop: 128,
  chromeRowHeight: 34,
  /** 범례와 요일 바 사이 간격 */
  legendGapBelow: 14,
  weekdayBarTop: 178,
  weekdayBarHeight: 32,
  gridTop: 222,
  gridBottomPad: 24,
  weekRows: 6,
  eventChipH: 18,
} as const;

export function monthGridMetrics() {
  const gridLeft = MONTH_LAYOUT.padX;
  const gridWidth = MONTH_LAYOUT.frameWidth - MONTH_LAYOUT.padX * 2;
  const colWidth = gridWidth / 7;
  const gridHeight =
    MONTH_LAYOUT.frameHeight - MONTH_LAYOUT.gridTop - MONTH_LAYOUT.gridBottomPad;
  const rowHeight = gridHeight / MONTH_LAYOUT.weekRows;
  return { gridLeft, gridWidth, colWidth, gridHeight, rowHeight };
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function formatMonthLabel(monthStart: Date): string {
  return `${monthStart.getFullYear()}년 ${monthStart.getMonth() + 1}월`;
}

export type MonthCell = {
  date: Date;
  inMonth: boolean;
  col: number;
  row: number;
  weekday: Weekday;
};

export function buildMonthCells(monthStart: Date): MonthCell[] {
  const first = startOfMonth(monthStart);
  const gridStart = startOfWeekMonday(first);
  const cells: MonthCell[] = [];
  for (let i = 0; i < MONTH_LAYOUT.weekRows * 7; i++) {
    const date = addDays(gridStart, i);
    const col = i % 7;
    const row = Math.floor(i / 7);
    cells.push({
      date,
      inMonth: date.getMonth() === first.getMonth(),
      col,
      row,
      weekday: CAL_WEEKDAYS[col]!,
    });
  }
  return cells;
}

export type MonthDayEvent = {
  key: string;
  classId: string;
  oneOffLessonId?: string;
  className: string;
  lessonTitle?: string;
  note?: string;
  colors: TeacherClass["colors"];
  start: string;
  end: string;
  day: Weekday;
};

export function eventsForMonthDay(
  classes: TeacherClass[],
  date: Date,
  weekday: Weekday,
  academicSchedule: AcademicScheduleSettings = DEFAULT_ACADEMIC_SCHEDULE,
): MonthDayEvent[] {
  if (shouldSkipRecurringClass(date, academicSchedule)) return [];
  const list: MonthDayEvent[] = [];
  for (const c of classes) {
    if (!c.days.includes(weekday)) continue;
    if (!isDateInClassPeriods(c, date)) continue;
    const time = resolveClassDayTime(c, weekday);
    if (!time) continue;
    list.push({
      key: `${c.id}:${weekday}`,
      classId: c.id,
      ...calendarEventLabelsFromClass(c, weekday),
      colors: c.colors,
      start: time.start,
      end: time.end,
      day: weekday,
    });
  }
  return list;
}

export { isSameDay };
