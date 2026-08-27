"use client";

import { useEffect, useState } from "react";
import {
  ClassPeriodModal,
  formatClassPeriodSummary,
} from "@/components/teacher/ClassPeriodModal";
import {
  ClassScheduleFields,
  DEFAULT_CLASS_TIME,
} from "@/components/teacher/ClassScheduleFields";
import { DeleteClassModal } from "@/components/teacher/DeleteClassModal";
import {
  CLASS_COLOR_THEMES,
  CLASS_GRADE_OPTIONS,
  type ClassPeriod,
  type ClassScheduleMode,
  type ClassTimeRange,
  type TeacherClass,
  type Weekday,
  classScheduleTimeError,
  createPeriodId,
  getColorTheme,
} from "@/lib/teacher-classes";

type ClassSettingsPanelProps = {
  teacherClass: TeacherClass;
  onSave: (next: TeacherClass) => void;
  onDelete: () => void;
};

/**
 * 반 설정: 이름·색·학년·수업 기간·요일/시간·반 삭제.
 * 설명 필드 없음 (uiux).
 */
export function ClassSettingsPanel({
  teacherClass,
  onSave,
  onDelete,
}: ClassSettingsPanelProps) {
  const [name, setName] = useState(teacherClass.name);
  const [grade, setGrade] = useState(teacherClass.grade ?? "");
  const [themeId, setThemeId] = useState(teacherClass.colorThemeId);
  const [periods, setPeriods] = useState<ClassPeriod[]>(
    teacherClass.periods ?? [],
  );
  const [days, setDays] = useState<Weekday[]>(teacherClass.days ?? []);
  const [scheduleMode, setScheduleMode] = useState<ClassScheduleMode>(
    teacherClass.scheduleMode ?? "unified",
  );
  const [unifiedTime, setUnifiedTime] = useState<ClassTimeRange>(
    teacherClass.unifiedTime ?? DEFAULT_CLASS_TIME,
  );
  const [dayTimes, setDayTimes] = useState<
    Partial<Record<Weekday, ClassTimeRange>>
  >(teacherClass.dayTimes ?? {});
  const [error, setError] = useState("");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  /*
    다른 반으로 바뀌면 편집 중이던 값을 그 반 값으로 되돌린다.

    effect가 아니라 **렌더 중 조정**이다(React가 권장하는 방식). effect에서 setState하면
    이전 반의 값으로 한 번 그린 뒤 다시 그리게 되어, 반을 바꾼 순간 옛 이름이 한 프레임
    비친다. 렌더 중에 조정하면 그 중간 화면이 아예 없다.
  */
  const [syncedClass, setSyncedClass] = useState(teacherClass);
  if (syncedClass !== teacherClass) {
    setSyncedClass(teacherClass);
    setName(teacherClass.name);
    setGrade(teacherClass.grade ?? "");
    setThemeId(teacherClass.colorThemeId);
    setPeriods(teacherClass.periods ?? []);
    setDays(teacherClass.days ?? []);
    setScheduleMode(teacherClass.scheduleMode ?? "unified");
    setUnifiedTime(teacherClass.unifiedTime ?? DEFAULT_CLASS_TIME);
    setDayTimes(teacherClass.dayTimes ?? {});
    setError("");
    setPeriodOpen(false);
    setEditingId(null);
    setDeleteOpen(false);
  }

  const theme = getColorTheme(themeId);
  const editing = editingId
    ? periods.find((p) => p.id === editingId)
    : null;
  const dirty =
    name.trim() !== teacherClass.name ||
    (grade || "") !== (teacherClass.grade ?? "") ||
    themeId !== teacherClass.colorThemeId ||
    JSON.stringify(periods) !== JSON.stringify(teacherClass.periods ?? []) ||
    JSON.stringify(days) !== JSON.stringify(teacherClass.days ?? []) ||
    scheduleMode !== (teacherClass.scheduleMode ?? "unified") ||
    JSON.stringify(unifiedTime) !==
      JSON.stringify(teacherClass.unifiedTime ?? DEFAULT_CLASS_TIME) ||
    JSON.stringify(dayTimes) !==
      JSON.stringify(teacherClass.dayTimes ?? {});

  function revert() {
    setName(teacherClass.name);
    setGrade(teacherClass.grade ?? "");
    setThemeId(teacherClass.colorThemeId);
    setPeriods(teacherClass.periods ?? []);
    setDays(teacherClass.days ?? []);
    setScheduleMode(teacherClass.scheduleMode ?? "unified");
    setUnifiedTime(teacherClass.unifiedTime ?? DEFAULT_CLASS_TIME);
    setDayTimes(teacherClass.dayTimes ?? {});
    setError("");
  }

  function toggleDay(day: Weekday) {
    setDays((prev) => {
      if (prev.includes(day)) {
        return prev.filter((d) => d !== day);
      }
      setDayTimes((times) => ({
        ...times,
        [day]: times[day] ?? { ...DEFAULT_CLASS_TIME },
      }));
      return [...prev, day];
    });
    if (error) setError("");
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("반 이름을 입력해 주세요");
      return;
    }
    if (!grade) {
      setError("학년 설정이 필요합니다");
      return;
    }
    if (days.length === 0) {
      setError("수업 요일을 하나 이상 선택해 주세요");
      return;
    }
    const timeError = classScheduleTimeError(
      scheduleMode,
      unifiedTime,
      days,
      dayTimes,
      DEFAULT_CLASS_TIME,
    );
    if (timeError) {
      setError(timeError);
      return;
    }
    const t = getColorTheme(themeId);
    const perDayTimes: Partial<Record<Weekday, ClassTimeRange>> = {};
    if (scheduleMode === "per-day") {
      for (const day of days) {
        perDayTimes[day] = dayTimes[day] ?? { ...DEFAULT_CLASS_TIME };
      }
    }
    onSave({
      ...teacherClass,
      name: trimmed,
      grade: grade || undefined,
      colorThemeId: t.id,
      color: t.class,
      colors: {
        class: t.class,
        calendar: t.calendar,
        bar: t.bar,
        text: t.text,
      },
      days,
      scheduleMode,
      unifiedTime:
        scheduleMode === "unified" ? { ...unifiedTime } : undefined,
      dayTimes: scheduleMode === "per-day" ? perDayTimes : undefined,
      periods,
      periodName: undefined,
      startDate: undefined,
      endDate: undefined,
      description: undefined,
    });
    setError("");
  }

  function openAdd() {
    setEditingId(null);
    setPeriodOpen(true);
  }

  function openEdit(id: string) {
    setEditingId(id);
    setPeriodOpen(true);
  }

  function removePeriod(id: string) {
    setPeriods((prev) => prev.filter((p) => p.id !== id));
  }

  /** 탭 바 · 콘텐츠 세로선과 동일 (ClassTabsBar) */
  const CONTENT_LEFT = 324.375;
  const CONTENT_WIDTH = 929.875;
  const TAB_LINE_Y = 121.1;
  const PANEL_TOP = TAB_LINE_Y + 12;
  const PANEL_HEIGHT = 973 - PANEL_TOP - 16;

  return (
    <>
      {/* 콘텐츠 우측 여백 SVG 잔상 */}
      <div
        className="pointer-events-none absolute z-[19] bg-white"
        style={{
          left: CONTENT_LEFT + CONTENT_WIDTH,
          top: 16,
          width: 1557 - (CONTENT_LEFT + CONTENT_WIDTH) - 8,
          height: 941,
        }}
        aria-hidden
      />

      <div
        className="absolute z-20 flex flex-col overflow-hidden rounded-[10px] border border-[#E8E8EA] bg-white"
        style={{
          left: CONTENT_LEFT,
          top: PANEL_TOP,
          width: CONTENT_WIDTH,
          height: PANEL_HEIGHT,
        }}
      >
        <div className="flex shrink-0 items-center justify-end gap-2 border-b border-[#E8E8EA] px-6 py-3">
          <button
            type="button"
            disabled={!dirty}
            onClick={revert}
            className="flex h-9 items-center justify-center rounded-[10px] px-4 text-[14px] font-bold outline-none disabled:cursor-not-allowed"
            style={{
              backgroundColor: "#FFFFFF",
              border: "1.5px solid #15171A",
              color: "#15171A",
              opacity: dirty ? 1 : 0.45,
            }}
          >
            되돌리기
          </button>
          <button
            type="button"
            disabled={!dirty}
            onClick={save}
            className="flex h-9 items-center justify-center rounded-[10px] px-5 text-[14px] font-bold outline-none disabled:cursor-not-allowed"
            style={{
              backgroundColor: dirty ? "#1AA7F2" : "#E5E7EB",
              color: dirty ? "#FFFFFF" : "#374151",
            }}
          >
            저장
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-8 py-5">
          <label className="flex items-center gap-4">
            <span className="w-[100px] shrink-0 text-[14px] font-semibold text-[#3D4148]">
              반 이름
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              className="h-10 flex-1 max-w-[420px] rounded-[10px] border border-[#E1E2E4] px-3 text-[15px] font-semibold text-[#15171A] outline-none focus:border-[#1AA7F2]"
            />
          </label>

          <div className="flex items-start gap-4">
            <span className="w-[100px] shrink-0 pt-2 text-[14px] font-semibold text-[#3D4148]">
              색상
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              <div
                className="h-9 w-9 shrink-0 rounded-[10px]"
                style={{ backgroundColor: theme.class }}
                aria-hidden
              />
              <span className="mr-1 text-[14px] font-semibold text-[#3D4148]">
                {theme.label}
              </span>
              {CLASS_COLOR_THEMES.map((t) => {
                const selected = themeId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-label={t.label}
                    aria-pressed={selected}
                    onClick={() => setThemeId(t.id)}
                    className="h-8 w-8 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#1AA7F2]"
                    style={{
                      backgroundColor: t.class,
                      boxShadow: selected
                        ? "inset 0 0 0 2px #fff, 0 0 0 2px #15171A"
                        : "0 0 0 1.5px rgba(0,0,0,0.08)",
                    }}
                  />
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-4">
            <span className="w-[100px] shrink-0 text-[14px] font-semibold text-[#3D4148]">
              학년 <span className="text-[#EF4444]">*</span>
            </span>
            <select
              value={grade}
              aria-required
              onChange={(e) => {
                setGrade(e.target.value);
                if (error) setError("");
              }}
              className="h-10 w-[200px] rounded-[10px] border border-[#E1E2E4] bg-white px-3 text-[15px] font-semibold text-[#15171A] outline-none focus:border-[#1AA7F2]"
            >
              <option value="" disabled hidden />
              {CLASS_GRADE_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-start gap-4">
            <span className="w-[100px] shrink-0 pt-2.5 text-[14px] font-semibold text-[#3D4148]">
              수업 기간
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              {periods.map((period) => {
                const summary = formatClassPeriodSummary(period);
                if (!summary) return null;
                return (
                  <div
                    key={period.id}
                    className="flex min-w-0 flex-wrap items-center gap-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[#15171A]">
                      {summary}
                    </span>
                    <button
                      type="button"
                      onClick={() => openEdit(period.id)}
                      className="h-9 shrink-0 rounded-[8px] border border-[#E1E2E4] bg-white px-3 text-[13px] font-bold text-[#3D4148] hover:bg-[#F3F4F5]"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => removePeriod(period.id)}
                      className="h-9 shrink-0 rounded-[8px] px-2 text-[13px] font-semibold text-[#9CA3AF] hover:text-[#6B7280]"
                    >
                      삭제
                    </button>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={openAdd}
                className="flex h-10 w-fit items-center gap-1.5 rounded-[10px] border border-dashed border-[#D1D5DB] bg-[#FAFAFA] px-4 text-[14px] font-bold text-[#6B7280] hover:border-[#1AA7F2] hover:text-[#1AA7F2]"
              >
                <span className="text-[18px] leading-none" aria-hidden>
                  +
                </span>
                추가
              </button>
            </div>
          </div>

          <ClassScheduleFields
            layout="inline"
            days={days}
            onToggleDay={toggleDay}
            scheduleMode={scheduleMode}
            onScheduleMode={(mode) => {
              setScheduleMode(mode);
              if (error) setError("");
            }}
            unifiedTime={unifiedTime}
            onUnifiedTime={(next) => {
              setUnifiedTime(next);
              if (error) setError("");
            }}
            dayTimes={dayTimes}
            onDayTime={(day, next) => {
              setDayTimes((prev) => ({ ...prev, [day]: next }));
              if (error) setError("");
            }}
          />

          {error ? (
            <p className="text-[13px] font-medium text-[#C52B2B]">{error}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-end border-t border-[#E8E8EA] px-8 py-4">
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="h-10 rounded-[10px] border border-[#F16163] bg-white px-5 text-[14px] font-bold text-[#C52B2B] hover:bg-[#FEE7E7]"
          >
            반 삭제
          </button>
        </div>
      </div>

      <DeleteClassModal
        open={deleteOpen}
        classLabel={teacherClass.name}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          onDelete();
        }}
      />

      <ClassPeriodModal
        open={periodOpen}
        onClose={() => {
          setPeriodOpen(false);
          setEditingId(null);
        }}
        periodName={editing?.name ?? ""}
        startDate={editing?.startDate ?? ""}
        endDate={editing?.endDate ?? ""}
        onConfirm={({ periodName: pn, startDate: s, endDate: e }) => {
          if (editingId) {
            setPeriods((prev) =>
              prev.map((p) =>
                p.id === editingId
                  ? {
                      ...p,
                      name: pn,
                      startDate: s,
                      endDate: e || undefined,
                    }
                  : p,
              ),
            );
          } else {
            setPeriods((prev) => [
              ...prev,
              {
                id: createPeriodId(),
                name: pn,
                startDate: s,
                endDate: e || undefined,
              },
            ]);
          }
          setPeriodOpen(false);
          setEditingId(null);
          setError("");
        }}
      />
    </>
  );
}
