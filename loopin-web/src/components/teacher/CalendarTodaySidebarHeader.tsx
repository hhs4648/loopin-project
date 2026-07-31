"use client";

import type { ReactNode } from "react";
import {
  DEFAULT_ACADEMIC_SCHEDULE,
  shouldSkipRecurringClass,
  type AcademicScheduleSettings,
} from "@/lib/calendar-academic-schedule";
import {
  CAL_TODAY_SIDEBAR,
  resolveClassDayTime,
  weekdayFromDate,
} from "@/lib/calendar-layout";
import {
  getOneOffLessonClass,
  oneOffLessonsForDate,
  type OneOffLesson,
} from "@/lib/calendar-one-off-lessons";
import {
  isDateInClassPeriods,
  type TeacherClass,
} from "@/lib/teacher-classes";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * 캘린더 오른쪽 오늘 사이드바.
 * SVG 데모와 열기/닫기 아이콘을 전부 가리고 실제 오늘 수업·빈 상태를 표시한다.
 */
export function CalendarTodaySidebarHeader({
  classes,
  oneOffLessons,
  academicSchedule = DEFAULT_ACADEMIC_SCHEDULE,
}: {
  classes: TeacherClass[];
  oneOffLessons: OneOffLesson[];
  academicSchedule?: AcademicScheduleSettings;
}) {
  const today = new Date();
  const dateLabel = `${today.getMonth() + 1}월 ${today.getDate()}일`;
  const weekday = WEEKDAYS[today.getDay()];
  const classWeekday = weekdayFromDate(today);
  const recurringClasses = classes.flatMap((teacherClass) => {
    if (!teacherClass.days.includes(classWeekday)) return [];
    if (!isDateInClassPeriods(teacherClass, today)) return [];
    if (shouldSkipRecurringClass(today, academicSchedule)) return [];
    const time = resolveClassDayTime(teacherClass, classWeekday);
    const meta = teacherClass.dayLessonMeta?.[classWeekday];
    return time
      ? [
          {
            key: `recurring:${teacherClass.id}`,
            teacherClass,
            time,
            lessonTitle: meta?.title?.trim() || undefined,
          },
        ]
      : [];
  });
  const addedClasses = oneOffLessonsForDate(oneOffLessons, today).flatMap(
    (lesson) => {
      const teacherClass = getOneOffLessonClass(lesson, classes);
      return teacherClass
        ? [
            {
              key: `one-off:${lesson.id}`,
              teacherClass,
              time: { start: lesson.start, end: lesson.end },
              lessonTitle: lesson.title?.trim() || undefined,
            },
          ]
        : [];
    },
  );
  const todayClasses = [...recurringClasses, ...addedClasses].sort((a, b) =>
    a.time.start.localeCompare(b.time.start),
  );

  return (
    <>
      {/* SVG의 열기/닫기 아이콘·데모 카드까지 오른쪽 레일 전체 가림 */}
      <div
        className="pointer-events-none absolute z-[19] bg-[#F8F8F7]"
        style={{
          left: CAL_TODAY_SIDEBAR.railLeft,
          top: 0,
          width: CAL_TODAY_SIDEBAR.railWidth,
          height: 973,
        }}
        aria-hidden
      />

      <div
        className="pointer-events-none absolute z-20 flex h-11 items-center rounded-[12px] border border-[#E3E7EE] bg-white px-3.5 shadow-[0_1px_3px_rgba(15,23,42,0.05)]"
        style={{
          left: CAL_TODAY_SIDEBAR.contentLeft,
          top: CAL_TODAY_SIDEBAR.headerTop,
          width: CAL_TODAY_SIDEBAR.contentWidth,
        }}
        aria-label={`오늘 ${dateLabel} ${weekday}요일`}
      >
        <span className="text-[11px] font-bold text-[#1AA7F2]">오늘</span>
        <span className="mx-2 h-3.5 w-px bg-[#E3E7EE]" aria-hidden />
        <span className="text-[15px] font-bold tracking-[-0.02em] text-[#15171A]">
          {dateLabel}
        </span>
        <span className="ml-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F3F4F5] px-1 text-[11px] font-semibold text-[#6E6A63]">
          {weekday}
        </span>
      </div>

      <section
        className="pointer-events-none absolute z-20"
        style={{
          left: CAL_TODAY_SIDEBAR.contentLeft,
          top: CAL_TODAY_SIDEBAR.classesTop,
          width: CAL_TODAY_SIDEBAR.contentWidth,
        }}
        aria-label="오늘 수업"
      >
        <h2 className="px-1 text-[12px] font-bold text-[#3D4148]">오늘 수업</h2>
        <div className="mt-2 flex flex-col gap-2">
          {todayClasses.length > 0 ? (
            todayClasses.slice(0, 4).map(
              ({ key, teacherClass, time, lessonTitle }) => (
              <div
                key={key}
                className="flex min-h-14 overflow-hidden rounded-[12px] border border-white/70"
                style={{ backgroundColor: teacherClass.colors.calendar }}
              >
                <span
                  className="w-1 shrink-0"
                  style={{ backgroundColor: teacherClass.colors.bar }}
                  aria-hidden
                />
                <div className="flex min-w-0 flex-1 items-start justify-between gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <span
                      className="block truncate text-[13px] font-bold"
                      style={{ color: teacherClass.colors.text }}
                    >
                      {teacherClass.name}
                    </span>
                    {lessonTitle ? (
                      <span
                        className="mt-0.5 block truncate text-[11px] font-semibold"
                        style={{ color: teacherClass.colors.text, opacity: 0.92 }}
                      >
                        {lessonTitle}
                      </span>
                    ) : null}
                  </div>
                  <span
                    className="shrink-0 rounded-md bg-white/80 px-1.5 py-1 text-[10px] font-bold"
                    style={{ color: teacherClass.colors.text }}
                  >
                    {time.start}
                  </span>
                </div>
              </div>
            ),
            )
          ) : (
            <EmptyState
              icon={<CalendarEmptyIcon />}
              title="오늘은 수업이 없어요"
              description="예정된 수업이 없습니다."
            />
          )}
        </div>
      </section>

      <section
        className="pointer-events-none absolute z-20"
        style={{
          left: CAL_TODAY_SIDEBAR.contentLeft,
          top:
            CAL_TODAY_SIDEBAR.classesTop +
            CAL_TODAY_SIDEBAR.assignmentsOffset,
          width: CAL_TODAY_SIDEBAR.contentWidth,
        }}
        aria-label="과제 제출"
      >
        <h2 className="px-1 text-[12px] font-bold text-[#3D4148]">과제 제출</h2>
        <div className="mt-2">
          <EmptyState
            icon={<InboxIcon />}
            title="새로운 과제 제출이 없어요"
            description="제출된 과제가 여기에 표시됩니다."
          />
        </div>
      </section>
    </>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[108px] flex-col items-center justify-center rounded-[14px] border border-[#E8E7E3] bg-white px-3 text-center shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F3F8FB] text-[#7BAECC]">
        {icon}
      </span>
      <p className="mt-2 text-[12px] font-bold text-[#4A4843]">{title}</p>
      <p className="mt-1 text-[10px] font-medium text-[#AAA69D]">
        {description}
      </p>
    </div>
  );
}

function CalendarEmptyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect
        x="3"
        y="4.5"
        width="14"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M3 8h14M7 2.5v3M13 2.5v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M3.5 4.5h13l1.25 7v4H2.25v-4l1.25-7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M2.5 11.5h4l1.2 2h4.6l1.2-2h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
