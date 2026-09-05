"use client";

import { ClassTimeRangeRow } from "@/components/teacher/ClassTimePicker";
import {
  WEEKDAYS,
  type ClassScheduleMode,
  type ClassTimeRange,
  type Weekday,
} from "@/lib/teacher-classes";

export const DEFAULT_CLASS_TIME: ClassTimeRange = {
  start: "09:00",
  end: "09:50",
};

type ClassScheduleFieldsProps = {
  days: Weekday[];
  onToggleDay: (day: Weekday) => void;
  scheduleMode: ClassScheduleMode;
  onScheduleMode: (mode: ClassScheduleMode) => void;
  unifiedTime: ClassTimeRange;
  onUnifiedTime: (next: ClassTimeRange) => void;
  dayTimes: Partial<Record<Weekday, ClassTimeRange>>;
  onDayTime: (day: Weekday, next: ClassTimeRange) => void;
  /** stacked: 모달 / inline: 반 설정 행 레이아웃 */
  layout?: "stacked" | "inline";
  /** 시작 가이드가 짚을 자리를 달아 준다 (새 반 만들기 모달에서만) */
  guide?: boolean;
  /** 수업 시간을 실제로 만졌는지 — 기본값이 있어서 값만으로는 알 수 없다 */
  timeDone?: boolean;
};

/**
 * 수업 요일 + 수업 시간 (새 반 만들기 · 반 설정 공통)
 */
export function ClassScheduleFields({
  days,
  onToggleDay,
  scheduleMode,
  onScheduleMode,
  unifiedTime,
  onUnifiedTime,
  dayTimes,
  onDayTime,
  layout = "stacked",
  guide = false,
  timeDone = false,
}: ClassScheduleFieldsProps) {
  const inline = layout === "inline";

  const dayButtons = (
    <div className="flex flex-wrap gap-2">
      {WEEKDAYS.map((day) => {
        const selected = days.includes(day.id);
        return (
          <button
            key={day.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggleDay(day.id)}
            className={`h-10 w-10 rounded-full text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#1AA7F2] focus-visible:ring-offset-2 ${
              selected
                ? "bg-[#1AA7F2] text-white"
                : "bg-[#F3F4F5] text-[#3D4148] hover:bg-[#E8E8EA]"
            }`}
          >
            {day.label}
          </button>
        );
      })}
    </div>
  );

  const timeBody = (
    <>
      <div className="flex gap-2">
        {(
          [
            ["unified", "요일 시간 통일"],
            ["per-day", "요일마다 따로"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={scheduleMode === mode}
            onClick={() => onScheduleMode(mode)}
            className={`h-10 rounded-[10px] px-4 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#1AA7F2] ${
              scheduleMode === mode
                ? "bg-[#15171A] text-white"
                : "bg-[#F3F4F5] text-[#3D4148] hover:bg-[#E8E8EA]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {scheduleMode === "unified" ? (
        <ClassTimeRangeRow
          value={unifiedTime}
          onChange={onUnifiedTime}
          label="모든 선택 요일"
        />
      ) : (
        <div className="space-y-2">
          {days.length === 0 ? (
            <p className="text-[13px] text-[#9CA3AF]">
              위에서 요일을 먼저 선택해 주세요.
            </p>
          ) : (
            days.map((day) => {
              const meta = WEEKDAYS.find((w) => w.id === day)!;
              return (
                <ClassTimeRangeRow
                  key={day}
                  label={`${meta.label}요일`}
                  value={dayTimes[day] ?? DEFAULT_CLASS_TIME}
                  onChange={(next) => onDayTime(day, next)}
                />
              );
            })
          )}
        </div>
      )}
    </>
  );

  if (inline) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <span className="w-[100px] shrink-0 pt-2 text-[14px] font-semibold text-[#3D4148]">
            수업 요일
            <span className="mt-0.5 block text-[12px] font-medium text-[#9CA3AF]">
              중복 선택
            </span>
          </span>
          <div className="min-w-0 flex-1">{dayButtons}</div>
        </div>
        <div className="flex items-start gap-4">
          <span className="w-[100px] shrink-0 pt-2 text-[14px] font-semibold text-[#3D4148]">
            수업 시간
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-3">{timeBody}</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <fieldset
        className="flex flex-col gap-2.5"
        data-guide={guide ? "class-days" : undefined}
        data-guide-done={days.length > 0 ? "true" : undefined}
      >
        <legend className="text-[13px] font-semibold text-[#3D4148]">
          수업 요일 <span className="text-[#EF4444]">*</span>
          <span className="ml-1 font-normal text-[#9CA3AF]">중복 선택 가능</span>
        </legend>
        {dayButtons}
      </fieldset>
      <fieldset
        className="flex flex-col gap-3"
        data-guide={guide ? "class-time" : undefined}
        data-guide-done={timeDone ? "true" : undefined}
      >
        <legend className="text-[13px] font-semibold text-[#3D4148]">
          수업 시간
        </legend>
        {timeBody}
      </fieldset>
    </>
  );
}
