"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ClassScheduleFields,
  DEFAULT_CLASS_TIME,
} from "@/components/teacher/ClassScheduleFields";
import { ModalCloseButton } from "@/components/teacher/ModalCloseButton";
import {
  CLASS_COLOR_THEMES,
  CLASS_GRADE_OPTIONS,
  type ClassScheduleMode,
  type ClassTimeRange,
  type TeacherClass,
  type Weekday,
  classScheduleTimeError,
  createClassId,
  createNewInviteCode,
  getColorTheme,
  loadTeacherClasses,
} from "@/lib/teacher-classes";

export type ClassModalPreset = {
  day: Weekday;
  start: string;
  end: string;
};

type CreateClassModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (item: TeacherClass) => void;
  /** 있으면 수정 모드 */
  editing?: TeacherClass | null;
  onUpdate?: (item: TeacherClass) => void;
  /** 빈 칸 클릭으로 열 때 요일·시간 미리 채움 */
  preset?: ClassModalPreset | null;
};

export function CreateClassModal({
  open,
  onClose,
  onCreate,
  editing = null,
  onUpdate,
  preset = null,
}: CreateClassModalProps) {
  const titleId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState<(typeof CLASS_GRADE_OPTIONS)[number] | "">(
    "",
  );
  const [themeId, setThemeId] = useState(CLASS_COLOR_THEMES[2].id);
  const [days, setDays] = useState<Weekday[]>([]);
  const [scheduleMode, setScheduleMode] =
    useState<ClassScheduleMode>("unified");
  const [unifiedTime, setUnifiedTime] =
    useState<ClassTimeRange>(DEFAULT_CLASS_TIME);
  const [dayTimes, setDayTimes] = useState<
    Partial<Record<Weekday, ClassTimeRange>>
  >({});
  const [error, setError] = useState("");
  /*
    색상·시간은 **기본값이 이미 들어 있다.** 그래서 「값이 있으면 끝」으로 보면
    시작 가이드가 두 단계를 그냥 지나쳐 버린다. 선생님이 실제로 만졌는지를 따로 센다.
  */
  const [colorTouched, setColorTouched] = useState(false);
  const [timeTouched, setTimeTouched] = useState(false);

  const isEdit = Boolean(editing);
  /** 시작 가이드가 짚을 자리 — 수정 모달에는 붙이지 않는다 */
  const guide = !isEdit;

  useEffect(() => {
    if (!open) return;

    if (editing) {
      setName(editing.name);
      setGrade(
        (CLASS_GRADE_OPTIONS.find((g) => g === editing.grade) as
          | (typeof CLASS_GRADE_OPTIONS)[number]
          | undefined) ?? "",
      );
      setThemeId(editing.colorThemeId || CLASS_COLOR_THEMES[2].id);
      setDays([...editing.days]);
      setScheduleMode(editing.scheduleMode);
      setUnifiedTime(
        editing.unifiedTime
          ? { ...editing.unifiedTime }
          : { ...DEFAULT_CLASS_TIME },
      );
      setDayTimes(editing.dayTimes ? { ...editing.dayTimes } : {});
    } else if (preset) {
      setName("");
      setGrade("");
      setThemeId(CLASS_COLOR_THEMES[2].id);
      setDays([preset.day]);
      setScheduleMode("unified");
      setUnifiedTime({ start: preset.start, end: preset.end });
      setDayTimes({
        [preset.day]: { start: preset.start, end: preset.end },
      });
    } else {
      setName("");
      setGrade("");
      setThemeId(CLASS_COLOR_THEMES[2].id);
      setDays([]);
      setScheduleMode("unified");
      setUnifiedTime(DEFAULT_CLASS_TIME);
      setDayTimes({});
    }

    setError("");
    setColorTouched(false);
    setTimeTouched(Boolean(editing || preset));
    const t = window.setTimeout(() => nameRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open, editing, preset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function toggleDay(day: Weekday) {
    setDays((prev) => {
      if (prev.includes(day)) {
        return prev.filter((d) => d !== day);
      }
      setDayTimes((times) => ({
        ...times,
        [day]: times[day] ?? { ...unifiedTime },
      }));
      return [...prev, day];
    });
    if (error) setError("");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
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
      unifiedTime,
    );
    if (timeError) {
      setError(timeError);
      return;
    }

    const theme = getColorTheme(themeId);
    const perDayTimes: Partial<Record<Weekday, ClassTimeRange>> = {};
    if (scheduleMode === "per-day") {
      for (const day of days) {
        perDayTimes[day] = dayTimes[day] ?? { ...unifiedTime };
      }
    }

    const schedule = {
      days,
      scheduleMode,
      unifiedTime:
        scheduleMode === "unified" ? { ...unifiedTime } : undefined,
      dayTimes: scheduleMode === "per-day" ? perDayTimes : undefined,
      colorThemeId: theme.id,
      color: theme.class,
      colors: {
        class: theme.class,
        calendar: theme.calendar,
        bar: theme.bar,
        text: theme.text,
      },
      grade: grade,
      name: trimmed,
    };

    if (isEdit && editing && onUpdate) {
      onUpdate({
        ...editing,
        ...schedule,
      });
      return;
    }

    onCreate({
      id: createClassId(trimmed),
      ...schedule,
      periods: [],
      inviteCode: createNewInviteCode(loadTeacherClasses()),
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 p-6"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92%] w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#E8E8EA] px-8 py-6">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-[20px] font-semibold tracking-tight text-[#15171A]"
            >
              {isEdit ? "수업 수정" : "새 반 만들기"}
            </h2>
            <p className="mt-1 text-[13px] text-[#6B7280]">
              {isEdit
                ? "반 이름 · 색 · 요일 · 수업 시간을 수정할 수 있어요. 저장해야 반영됩니다."
                : "반 이름 · 색 · 요일 · 수업 시간을 정한 뒤, 수업 기간까지 확인해야 담당 반에 추가됩니다."}
            </p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>

        <form
          className="no-scrollbar flex min-h-0 flex-1 flex-col"
          onSubmit={submit}
        >
          <div className="no-scrollbar flex-1 space-y-6 overflow-y-auto px-8 py-6">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-[#3D4148]">
                반 이름 <span className="text-[#EF4444]">*</span>
              </span>
              <input
                ref={nameRef}
                data-guide={guide ? "class-name" : undefined}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError("");
                }}
                placeholder="예: 중1 영어"
                className="h-11 rounded-[10px] border border-[#E1E2E4] px-3 text-[14px] font-semibold text-[#15171A] outline-none placeholder:font-normal placeholder:text-[#9CA3AF] focus:border-[#1AA7F2]"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-[#3D4148]">
                학년 <span className="text-[#EF4444]">*</span>
              </span>
              <select
                data-guide={guide ? "class-grade" : undefined}
                value={grade}
                aria-required
                onChange={(e) => {
                  setGrade(
                    e.target.value as (typeof CLASS_GRADE_OPTIONS)[number] | "",
                  );
                  if (error) setError("");
                }}
                className="h-11 rounded-[10px] border border-[#E1E2E4] px-3 text-[14px] font-semibold text-[#15171A] outline-none focus:border-[#1AA7F2]"
              >
                <option value="" disabled hidden />
                {CLASS_GRADE_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>

            <fieldset
              className="flex flex-col gap-2.5"
              data-guide={guide ? "class-color" : undefined}
              data-guide-done={colorTouched ? "true" : undefined}
            >
              <legend className="text-[13px] font-semibold text-[#3D4148]">
                반 색상 <span className="font-normal text-[#9CA3AF]">8색</span>
              </legend>
              <div className="flex flex-wrap gap-2.5">
                {CLASS_COLOR_THEMES.map((theme) => {
                  const selected = themeId === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      aria-label={theme.label}
                      aria-pressed={selected}
                      title={theme.label}
                      onClick={() => {
                        setThemeId(theme.id);
                        setColorTouched(true);
                      }}
                      className="h-10 w-10 rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-[#1AA7F2] focus-visible:ring-offset-2"
                      style={{
                        backgroundColor: theme.class,
                        boxShadow: selected
                          ? "inset 0 0 0 2px #fff, 0 0 0 2px #15171A"
                          : undefined,
                      }}
                    />
                  );
                })}
              </div>
            </fieldset>

            <ClassScheduleFields
              guide={guide}
              timeDone={timeTouched}
              days={days}
              onToggleDay={toggleDay}
              scheduleMode={scheduleMode}
              onScheduleMode={(mode) => {
                setScheduleMode(mode);
                setTimeTouched(true);
                if (error) setError("");
              }}
              unifiedTime={unifiedTime}
              onUnifiedTime={(next) => {
                setUnifiedTime(next);
                setTimeTouched(true);
                if (error) setError("");
              }}
              dayTimes={dayTimes}
              onDayTime={(day, next) => {
                setDayTimes((prev) => ({ ...prev, [day]: next }));
                setTimeTouched(true);
                if (error) setError("");
              }}
            />

            {error ? (
              <p className="text-[13px] font-medium text-[#EF4444]">{error}</p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-[#E8E8EA] px-8 py-4">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-[10px] px-5 text-[14px] font-semibold text-[#3D4148] hover:bg-[#F3F4F5]"
            >
              취소
            </button>
            <button
              type="submit"
              data-guide={guide ? "class-save" : undefined}
              className="h-11 rounded-[10px] bg-[#1AA7F2] px-5 text-[14px] font-semibold text-white hover:bg-[#1596d9]"
            >
              {isEdit ? "저장" : "만들기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
