"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { DEFAULT_CLASS_TIME } from "@/components/teacher/ClassScheduleFields";
import type {
  CalendarLessonTarget,
  CalendarSlotPreset,
} from "@/components/teacher/CalendarEventsOverlay";
import {
  CAL_PERIOD_NAV_LAYOUT,
  CalendarPeriodNav,
} from "@/components/teacher/CalendarPeriodNav";
import {
  DEFAULT_ACADEMIC_SCHEDULE,
  getCalendarHolidayLabel,
  isCalendarRedDay,
  type AcademicScheduleSettings,
} from "@/lib/calendar-academic-schedule";
import { CAL_DAY_LABELS, CAL_GRID, calendarEventLabelsFromOneOff } from "@/lib/calendar-layout";
import {
  MONTH_LAYOUT,
  buildMonthCells,
  eventsForMonthDay,
  formatMonthLabel,
  isSameDay,
  monthGridMetrics,
  type MonthDayEvent,
} from "@/lib/calendar-monthly";
import {
  getOneOffLessonClass,
  oneOffLessonsForDate,
  toLocalIsoDate,
  type OneOffLesson,
} from "@/lib/calendar-one-off-lessons";
import type { TeacherClass } from "@/lib/teacher-classes";

/** 월간 셀에 바로 보이는 수업 칩 최대 개수 — 초과분은 「+N개 더보기」 */
const MAX_VISIBLE_CHIPS = 2;

const WEEKDAY_SHORT = ["일", "월", "화", "수", "목", "금", "토"] as const;

type CalendarMonthlyPanelProps = {
  classes: TeacherClass[];
  oneOffLessons: OneOffLesson[];
  academicSchedule?: AcademicScheduleSettings;
  monthStart: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onEditLesson: (target: CalendarLessonTarget) => void;
  onEmptySlot: (slot: CalendarSlotPreset) => void;
};

type DayPopoverState = {
  cellKey: string;
  date: Date;
  events: MonthDayEvent[];
  col: number;
  row: number;
};

/**
 * 월간 보기 — 오른쪽 사이드(오늘 수업)가 보이도록 폭 제한.
 * 요일(월~일) 바 · 반 범례 · 격자를 서로 떨어뜨려 배치.
 */
export function CalendarMonthlyPanel({
  classes,
  oneOffLessons,
  academicSchedule = DEFAULT_ACADEMIC_SCHEDULE,
  monthStart,
  onPrevMonth,
  onNextMonth,
  onEditLesson,
  onEmptySlot,
}: CalendarMonthlyPanelProps) {
  const cells = useMemo(() => buildMonthCells(monthStart), [monthStart]);
  const today = useMemo(() => new Date(), []);
  const label = formatMonthLabel(monthStart);
  const { gridLeft, gridWidth, colWidth, gridHeight, rowHeight } =
    monthGridMetrics();
  const nav = CAL_PERIOD_NAV_LAYOUT;
  const navLeft = nav.left - MONTH_LAYOUT.frameLeft;
  const navTop = nav.top - MONTH_LAYOUT.frameTop;

  const [popover, setPopover] = useState<DayPopoverState | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const closePopover = useCallback(() => setPopover(null), []);

  useEffect(() => {
    if (!popover) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePopover();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && popoverRef.current?.contains(target)) return;
      closePopover();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [popover, closePopover]);

  useEffect(() => {
    closePopover();
  }, [monthStart, closePopover]);

  const openDayPopover = (
    event: MouseEvent,
    state: DayPopoverState,
  ) => {
    event.stopPropagation();
    setPopover((prev) =>
      prev?.cellKey === state.cellKey ? null : state,
    );
  };

  const handleEventClick = (ev: MonthDayEvent, date: Date) => {
    closePopover();
    onEditLesson({
      classId: ev.classId,
      date: toLocalIsoDate(date),
      day: ev.day,
      start: ev.start,
      end: ev.end,
      oneOffLessonId: ev.oneOffLessonId,
    });
  };

  const popoverPlacement = popover
    ? {
        alignRight: popover.col >= 5,
        openUp: popover.row >= 4,
        left: popover.col * colWidth,
        top: popover.row * rowHeight,
        width: Math.min(220, colWidth + 48),
      }
    : null;

  return (
    <div
      className="absolute z-20 overflow-hidden bg-white"
      style={{
        left: MONTH_LAYOUT.frameLeft,
        top: MONTH_LAYOUT.frameTop,
        width: MONTH_LAYOUT.frameWidth,
        height: MONTH_LAYOUT.frameHeight,
      }}
      aria-label="월간 캘린더"
    >
      {/* 타이틀은 CalendarPageHeader (주간과 동일) */}

      {/* 월 이동 — 주간과 동일 위치·폭·간격 */}
      <CalendarPeriodNav
        className="absolute"
        style={{ left: navLeft, top: navTop }}
        width={nav.monthWidth}
        label={label}
        prevAriaLabel="이전 달"
        nextAriaLabel="다음 달"
        onPrev={onPrevMonth}
        onNext={onNextMonth}
      />

      {/* 반 범례 — 네비 오른쪽 · 요일 바와 격리 */}
      <div
        className="absolute flex items-center justify-end"
        style={{
          left: navLeft + nav.width + 24,
          right: MONTH_LAYOUT.padX,
          top: navTop,
          height: nav.height,
        }}
        aria-label="담당 반 색 범례"
      >
        {classes.length === 0 ? null : (
          <ul className="flex max-w-full flex-nowrap items-center justify-end gap-x-3">
            {classes.map((c) => {
              const color = c.colors?.class || c.color || "#A4D24C";
              return (
                <li
                  key={c.id}
                  className="flex min-w-0 max-w-[140px] shrink items-center gap-1.5"
                >
                  <span
                    className="h-[10px] w-[10px] shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <span
                    className="truncate text-[12px] font-bold text-[#15171A]"
                    title={c.name}
                  >
                    {c.name}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 요일 헤더 — 범례 아래 간격 확보 */}
      <div
        className="absolute grid items-center rounded-[14px] bg-[#F7F7F7]"
        style={{
          left: gridLeft,
          top: MONTH_LAYOUT.weekdayBarTop,
          width: gridWidth,
          height: MONTH_LAYOUT.weekdayBarHeight,
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        }}
      >
        {CAL_DAY_LABELS.map((d) => (
          <span
            key={d}
            className="text-center text-[13px] font-bold tracking-wide text-[#6E6A63]"
          >
            {d}
          </span>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div
        className="absolute"
        style={{
          left: gridLeft,
          top: MONTH_LAYOUT.gridTop,
          width: gridWidth,
          height: gridHeight,
        }}
      >
        {cells.map((cell) => {
          const cellKey = `${cell.row}-${cell.col}`;
          const recurringEvents = cell.inMonth
            ? eventsForMonthDay(
                classes,
                cell.date,
                cell.weekday,
                academicSchedule,
              )
            : [];
          const addedEvents = cell.inMonth
            ? oneOffLessonsForDate(oneOffLessons, cell.date).flatMap(
                (lesson) => {
                  const teacherClass = getOneOffLessonClass(lesson, classes);
                  if (!teacherClass) return [];
                  return [
                    {
                      key: `one-off:${lesson.id}`,
                      classId: teacherClass.id,
                      oneOffLessonId: lesson.id,
                      ...calendarEventLabelsFromOneOff(lesson, teacherClass),
                      colors: teacherClass.colors,
                      start: lesson.start,
                      end: lesson.end,
                      day: cell.weekday,
                    } satisfies MonthDayEvent,
                  ];
                },
              )
            : [];
          const events = [...recurringEvents, ...addedEvents].sort((a, b) =>
            a.start.localeCompare(b.start),
          );
          const isToday = isSameDay(cell.date, today);
          const holidayLabel = cell.inMonth
            ? getCalendarHolidayLabel(cell.date, academicSchedule.holidays)
            : null;
          const redDay =
            cell.inMonth &&
            isCalendarRedDay(cell.date, academicSchedule.holidays);
          const overflowCount = events.length - MAX_VISIBLE_CHIPS;
          const isPopoverOpen = popover?.cellKey === cellKey;

          return (
            <div
              key={cellKey}
              className="absolute box-border overflow-hidden border border-[#EFEFEF] bg-white"
              style={{
                left: cell.col * colWidth,
                top: cell.row * rowHeight,
                width: colWidth,
                height: rowHeight,
                borderRadius: 10,
                backgroundColor: isToday
                  ? "rgba(17, 23, 26, 0.035)"
                  : undefined,
              }}
              title={holidayLabel ?? undefined}
              onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                if (!cell.inMonth) return;
                closePopover();
                onEmptySlot({
                  date: `${cell.date.getFullYear()}-${String(
                    cell.date.getMonth() + 1,
                  ).padStart(2, "0")}-${String(cell.date.getDate()).padStart(
                    2,
                    "0",
                  )}`,
                  day: cell.weekday,
                  start: DEFAULT_CLASS_TIME.start,
                  end: DEFAULT_CLASS_TIME.end,
                });
              }}
            >
              <div className="flex min-w-0 items-center gap-1 px-1.5 pt-1">
                <span
                  className={`flex h-6 w-6 items-center justify-center text-[13px] font-bold ${
                    isToday
                      ? "rounded-full bg-[#FF6666] text-white"
                      : cell.inMonth
                        ? redDay
                          ? "text-[#EF4444]"
                          : "text-[#15171A]"
                        : "text-[#D1CFCC]"
                  }`}
                >
                  {cell.date.getDate()}
                </span>
                {holidayLabel ? (
                  <span className="min-w-0 truncate text-[10px] font-semibold text-[#EF4444]">
                    {holidayLabel}
                  </span>
                ) : null}
              </div>

              <div className="mt-0.5 flex flex-col gap-0.5 px-1">
                {events.slice(0, MAX_VISIBLE_CHIPS).map((ev) => (
                  <MonthEventChip
                    key={ev.key}
                    event={ev}
                    isToday={isToday}
                    onClick={() => handleEventClick(ev, cell.date)}
                  />
                ))}
                {overflowCount > 0 ? (
                  <button
                    type="button"
                    aria-expanded={isPopoverOpen}
                    aria-haspopup="dialog"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) =>
                      openDayPopover(e, {
                        cellKey,
                        date: cell.date,
                        events,
                        col: cell.col,
                        row: cell.row,
                      })
                    }
                    className={`w-full rounded-[5px] px-0.5 py-0.5 text-left text-[10px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#1AA7F2] ${
                      isPopoverOpen
                        ? "bg-[#E8F6FD] text-[#1AA7F2]"
                        : "text-[#6E6A63] hover:bg-[#F3F4F5] hover:text-[#15171A]"
                    }`}
                  >
                    +{overflowCount}개 더보기
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}

        {popover && popoverPlacement ? (
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={`${formatDayPopoverTitle(popover.date)} 수업`}
            className="absolute z-40 flex max-h-[260px] flex-col overflow-hidden rounded-[14px] border border-[#E3E7EE] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.14)]"
            style={{
              width: popoverPlacement.width,
              left: popoverPlacement.alignRight
                ? popoverPlacement.left +
                  colWidth -
                  popoverPlacement.width
                : popoverPlacement.left,
              top: popoverPlacement.openUp
                ? undefined
                : popoverPlacement.top + 28,
              bottom: popoverPlacement.openUp
                ? gridHeight - popoverPlacement.top - rowHeight + 8
                : undefined,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#F0F1F3] px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold text-[#15171A]">
                  {formatDayPopoverTitle(popover.date)}
                </p>
                <p className="text-[11px] font-semibold text-[#8B8F96]">
                  수업 {popover.events.length}개
                </p>
              </div>
              <button
                type="button"
                onClick={closePopover}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#8B8F96] hover:bg-[#F3F4F5] hover:text-[#15171A]"
                aria-label="닫기"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="flex flex-col gap-1 overflow-y-auto p-2 [scrollbar-width:thin]">
              {popover.events.map((ev) => (
                <MonthEventChip
                  key={ev.key}
                  event={ev}
                  denser={false}
                  isToday={isSameDay(popover.date, today)}
                  onClick={() => handleEventClick(ev, popover.date)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatDayPopoverTitle(date: Date): string {
  const weekday = WEEKDAY_SHORT[date.getDay()] ?? "";
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekday})`;
}

function MonthEventChip({
  event,
  onClick,
  denser = true,
  isToday = false,
}: {
  event: MonthDayEvent;
  onClick: () => void;
  denser?: boolean;
  isToday?: boolean;
}) {
  const tooltipParts = [
    event.className,
    event.lessonTitle,
    `${event.start}–${event.end}`,
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex w-full overflow-hidden rounded-[5px] text-left outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-[#1AA7F2]"
      style={{
        backgroundColor: event.colors.calendar,
        boxShadow: isToday ? "0 0 20px rgba(176, 176, 176, 0.3)" : undefined,
      }}
      title={tooltipParts.join(" · ")}
    >
      <span
        className="shrink-0 self-stretch"
        style={{
          width: CAL_GRID.barWidth,
          backgroundColor: event.colors.bar,
        }}
        aria-hidden
      />
      <span
        className={`flex min-w-0 flex-1 flex-col ${
          denser ? "px-1 py-0.5" : "px-1.5 py-1"
        }`}
      >
        <span
          className={`truncate font-bold ${denser ? "text-[11px]" : "text-[12px]"}`}
          style={{ color: event.colors.text }}
        >
          {event.className}
        </span>
        {event.lessonTitle ? (
          <span
            className={`truncate font-semibold ${denser ? "text-[10px]" : "text-[11px]"}`}
            style={{ color: event.colors.text, opacity: 0.9 }}
          >
            {event.lessonTitle}
          </span>
        ) : (
          <span
            className={`truncate font-semibold ${denser ? "text-[10px]" : "text-[11px]"}`}
            style={{ color: event.colors.text, opacity: 0.85 }}
          >
            {event.start}–{event.end}
          </span>
        )}
      </span>
    </button>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
