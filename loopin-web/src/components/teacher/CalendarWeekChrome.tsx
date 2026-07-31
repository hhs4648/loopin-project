"use client";

import {
  CAL_PERIOD_NAV_LAYOUT,
  CalendarPeriodNav,
} from "@/components/teacher/CalendarPeriodNav";
import {
  getCalendarHolidayLabel,
  isCalendarRedDay,
  type AcademicHoliday,
} from "@/lib/calendar-academic-schedule";
import {
  CAL_DAY_LABELS,
  CAL_GRID,
  addDays,
  formatWeekRangeLabel,
  isSameDay,
} from "@/lib/calendar-layout";

type CalendarWeekChromeProps = {
  weekMonday: Date;
  academicHolidays?: AcademicHoliday[];
  onPrevWeek: () => void;
  onNextWeek: () => void;
};

/**
 * 주간 라벨 · 이전/다음 주 버튼 · 월~일 요일 헤더.
 */
export function CalendarWeekChrome({
  weekMonday,
  academicHolidays = [],
  onPrevWeek,
  onNextWeek,
}: CalendarWeekChromeProps) {
  const today = new Date();
  const label = formatWeekRangeLabel(weekMonday);
  const nav = CAL_PERIOD_NAV_LAYOUT;

  return (
    <div className="pointer-events-none absolute inset-0 z-[25]">
      {/* SVG 타이틀·부제 하단 잔여 글자 가림 (월간 네비보다 위까지만) */}
      <div
        className="absolute bg-white"
        style={{
          left: 268,
          top: 100,
          width: 700,
          height: 30,
        }}
        aria-hidden
      />

      {/* SVG 주차 `<` `>` · 라벨 전부 가림 (데모 왼쪽 화살표 포함) */}
      <div
        className="absolute bg-white"
        style={{
          left: 268,
          top: nav.top - 6,
          width: 380,
          height: nav.height + 12,
        }}
        aria-hidden
      />
      {/* SVG 오른쪽 화살표(구 위치 ~610) 가림 */}
      <div
        className="absolute bg-white"
        style={{
          left: 600,
          top: nav.top - 6,
          width: 48,
          height: nav.height + 12,
        }}
        aria-hidden
      />

      <CalendarPeriodNav
        className="pointer-events-auto absolute"
        style={{ left: nav.left, top: nav.top }}
        width={nav.weekWidth}
        label={label}
        prevAriaLabel="이전 주"
        nextAriaLabel="다음 주"
        onPrev={onPrevWeek}
        onNext={onNextWeek}
      />

      {/* SVG 요일·날짜 헤더 가림 */}
      <div
        className="absolute bg-white"
        style={{
          left: CAL_GRID.gutterLeft,
          top: CAL_GRID.headerTop,
          width: CAL_GRID.right - CAL_GRID.gutterLeft,
          height: CAL_GRID.top - CAL_GRID.headerTop,
        }}
        aria-hidden
      />

      {/* 월간과 동일 — 월~일 회색 바 · 그리드 열에 정렬 */}
      <div
        className="absolute grid items-center rounded-[14px] bg-[#F7F7F7]"
        style={{
          left: CAL_GRID.left,
          top: CAL_GRID.weekdayBarTop,
          width: CAL_GRID.right - CAL_GRID.left,
          height: CAL_GRID.weekdayBarHeight,
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        }}
      >
        {CAL_DAY_LABELS.map((dayLabel, i) => {
          const date = addDays(weekMonday, i);
          const redDay = isCalendarRedDay(date, academicHolidays);
          return (
            <span
              key={dayLabel}
              className={`text-center text-[13px] font-bold tracking-wide ${
                redDay ? "text-[#EF4444]" : "text-[#6E6A63]"
              }`}
            >
              {dayLabel}
            </span>
          );
        })}
      </div>

      {/* 날짜 — 요일 바 아래 · 각 열 중앙 */}
      <div
        className="absolute grid items-center"
        style={{
          left: CAL_GRID.left,
          top: CAL_GRID.dateRowTop,
          width: CAL_GRID.right - CAL_GRID.left,
          height: CAL_GRID.dateRowHeight,
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        }}
      >
        {CAL_DAY_LABELS.map((dayLabel, i) => {
          const date = addDays(weekMonday, i);
          const isToday = isSameDay(date, today);
          const holidayLabel = getCalendarHolidayLabel(date, academicHolidays);
          const redDay = isCalendarRedDay(date, academicHolidays);
          return (
            <div
              key={dayLabel}
              className="flex items-center justify-center"
              title={holidayLabel ?? undefined}
              aria-label={
                holidayLabel
                  ? `${date.getMonth() + 1}월 ${date.getDate()}일 ${holidayLabel}`
                  : undefined
              }
            >
              <span
                className={`flex h-8 w-8 items-center justify-center text-[16px] font-bold ${
                  isToday
                    ? "rounded-full bg-[#FF6666] text-white"
                    : redDay
                      ? "text-[#EF4444]"
                      : "text-[#15171A]"
                }`}
              >
                {date.getDate()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
