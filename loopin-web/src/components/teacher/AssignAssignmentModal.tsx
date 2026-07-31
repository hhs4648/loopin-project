"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { ClassTimePicker } from "@/components/teacher/ClassTimePicker";
import {
  formatLessonDateKo,
  type CreateClassAssignmentInput,
} from "@/lib/class-assignments";
import {
  loadAcademicSchedule,
  type AcademicScheduleSettings,
} from "@/lib/calendar-academic-schedule";
import {
  loadOneOffLessons,
  toLocalIsoDate,
  type OneOffLesson,
} from "@/lib/calendar-one-off-lessons";
import {
  listLessonCandidates,
  type LessonCandidate,
} from "@/lib/lesson-candidates";
import {
  addMonths,
  buildMonthCells,
  formatMonthLabel,
  startOfMonth,
} from "@/lib/calendar-monthly";
import type { TeacherClass } from "@/lib/teacher-classes";

type DeadlineMode = "custom" | "nextLesson";

type ClassPick = {
  lesson: LessonCandidate;
  deadlineMode: DeadlineMode;
  /** YYYY-MM-DD */
  deadlineDate: string;
  deadlineTime: string;
};

type AssignAssignmentModalProps = {
  open: boolean;
  classes: TeacherClass[];
  classIds: string[];
  onClose: () => void;
  onConfirm: (assignments: CreateClassAssignmentInput[]) => void;
  /** 다른 모달 위에 띄울 때 (기본 z-[80]) */
  overlayClassName?: string;
};

const CALENDAR_WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;

export function AssignAssignmentModal({
  open,
  classes,
  classIds,
  onClose,
  onConfirm,
  overlayClassName = "z-[80]",
}: AssignAssignmentModalProps) {
  const titleId = useId();
  const [picks, setPicks] = useState<Record<string, ClassPick>>({});
  const [focusClassId, setFocusClassId] = useState<string>("");
  const [error, setError] = useState("");
  const [oneOffLessons, setOneOffLessons] = useState<OneOffLesson[]>([]);
  const [academicSchedule, setAcademicSchedule] =
    useState<AcademicScheduleSettings | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(new Date()),
  );

  const selectedClasses = useMemo(
    () =>
      classIds
        .map((id) => classes.find((item) => item.id === id))
        .filter((item): item is TeacherClass => Boolean(item)),
    [classes, classIds],
  );

  useEffect(() => {
    if (!open) return;
    setOneOffLessons(loadOneOffLessons());
    setAcademicSchedule(loadAcademicSchedule());
    setPicks({});
    setFocusClassId(classIds[0] ?? "");
    setVisibleMonth(startOfMonth(new Date()));
    setError("");
  }, [open, classIds]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const candidates = useMemo(() => {
    if (!open || !academicSchedule) return [];
    return listLessonCandidates({
      classes,
      classIds,
      oneOffLessons,
      academicSchedule,
    });
  }, [open, classes, classIds, oneOffLessons, academicSchedule]);

  const candidatesByDate = useMemo(() => {
    const map = new Map<string, LessonCandidate[]>();
    for (const lesson of candidates) {
      const lessons = map.get(lesson.date) ?? [];
      lessons.push(lesson);
      map.set(lesson.date, lessons);
    }
    return map;
  }, [candidates]);

  const monthCells = useMemo(
    () => buildMonthCells(visibleMonth),
    [visibleMonth],
  );

  if (!open) return null;

  const focusPick = focusClassId ? picks[focusClassId] : undefined;
  const allReady = classIds.every((id) => {
    const pick = picks[id];
    return Boolean(pick?.lesson && pick.deadlineDate && pick.deadlineTime);
  });

  /** 같은 반의 다음 예정 수업(선택한 수업 이후) — candidates는 날짜순 정렬돼 있어 인접 항목만 확인하면 된다. */
  function findNextLesson(
    classId: string,
    current: LessonCandidate,
  ): LessonCandidate | undefined {
    const sameClass = candidates.filter((c) => c.classId === classId);
    const idx = sameClass.findIndex((c) => c.key === current.key);
    return idx >= 0 ? sameClass[idx + 1] : undefined;
  }

  function resolveDeadline(
    mode: DeadlineMode,
    lesson: LessonCandidate,
    fallback: { deadlineDate: string; deadlineTime: string },
  ): { deadlineDate: string; deadlineTime: string } {
    if (mode === "custom") return fallback;
    const next = findNextLesson(lesson.classId, lesson);
    return next
      ? { deadlineDate: next.date, deadlineTime: next.start }
      : { deadlineDate: "", deadlineTime: "" };
  }

  function selectLesson(lesson: LessonCandidate) {
    setFocusClassId(lesson.classId);
    setPicks((prev) => {
      const existing = prev[lesson.classId];
      const mode: DeadlineMode = existing?.deadlineMode ?? "custom";
      const fallback = {
        deadlineDate: existing?.deadlineDate || lesson.date,
        deadlineTime: existing?.deadlineTime || lesson.end,
      };
      return {
        ...prev,
        [lesson.classId]: {
          lesson,
          deadlineMode: mode,
          ...resolveDeadline(mode, lesson, fallback),
        },
      };
    });
    setError("");
  }

  function setDeadlineMode(mode: DeadlineMode) {
    if (!focusClassId) return;
    setPicks((prev) => {
      const current = prev[focusClassId];
      if (!current) return prev;
      const fallback = {
        deadlineDate: current.lesson.date,
        deadlineTime: current.lesson.end,
      };
      return {
        ...prev,
        [focusClassId]: {
          ...current,
          deadlineMode: mode,
          ...resolveDeadline(mode, current.lesson, fallback),
        },
      };
    });
    setError("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!allReady) {
      setError("모든 반의 수업과 마감 날짜·시간을 선택해 주세요.");
      return;
    }
    const invalidDate = classIds.some((id) => {
      const pick = picks[id]!;
      return pick.deadlineDate < pick.lesson.date;
    });
    if (invalidDate) {
      setError("마감 날짜는 수업 날짜 이후로 설정해 주세요.");
      return;
    }
    onConfirm(
      classIds.map((classId) => {
        const pick = picks[classId]!;
        return {
          problemSetId: "",
          classId,
          lessonDate: pick.lesson.date,
          deadlineDate: pick.deadlineDate,
          deadlineTime: pick.deadlineTime,
          deadlineUntilNextLesson: pick.deadlineMode === "nextLesson",
        };
      }),
    );
  }

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/35 p-6 ${overlayClassName}`}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-[min(840px,94vh)] w-[860px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#F0F1F3] px-6 py-5">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-[20px] font-bold tracking-[-0.02em] text-[#15171A]"
            >
              과제 부여
            </h2>
            <p className="mt-1 text-[13px] font-medium text-[#8B8F96]">
              반마다 수업을 고르고, 마감 날짜와 시간을 정해 주세요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#8B8F96] hover:bg-[#F3F4F5] hover:text-[#15171A]"
            aria-label="닫기"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="shrink-0 border-b border-[#F0F1F3] px-6 py-3">
          <div className="flex flex-wrap gap-2">
            {selectedClasses.map((teacherClass) => {
              const pick = picks[teacherClass.id];
              const focused = focusClassId === teacherClass.id;
              return (
                <button
                  key={teacherClass.id}
                  type="button"
                  onClick={() => setFocusClassId(teacherClass.id)}
                  className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#1AA7F2] ${
                    pick
                      ? ""
                      : focused
                        ? "border-[#1AA7F2] bg-[#EAF6FE] text-[#1274A9]"
                        : "border-[#E5E7EB] bg-white text-[#6E6A63]"
                  }`}
                  style={
                    pick
                      ? {
                          borderColor: teacherClass.colors.bar,
                          backgroundColor: teacherClass.colors.calendar,
                          color: teacherClass.colors.text,
                        }
                      : undefined
                  }
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: teacherClass.colors.class }}
                    aria-hidden
                  />
                  <span className="text-[12px] font-bold leading-none">
                    {teacherClass.name}
                  </span>
                  {pick ? (
                    <span className="text-[11px] font-semibold leading-none opacity-80">
                      {formatLessonDateKo(pick.lesson.date)}
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold leading-none opacity-70">
                      미선택
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 가운데 캘린더 — 스크롤 없음 */}
        <div className="min-h-0 flex-1 overflow-hidden px-6 py-4">
          {candidates.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-[14px] border border-dashed border-[#E1E2E4] px-4 py-10 text-center">
              <div>
                <p className="text-[14px] font-bold text-[#6E6A63]">
                  다가오는 수업이 없어요
                </p>
                <p className="mt-1 text-[12px] font-medium text-[#9CA3AF]">
                  수업 기간·요일을 확인하거나 캘린더에서 수업을 추가해 주세요.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="mb-3 flex shrink-0 items-center justify-between">
                <button
                  type="button"
                  onClick={() =>
                    setVisibleMonth((month) => addMonths(month, -1))
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E5E7EB] text-[#6E6A63] hover:bg-[#F7F7F7]"
                  aria-label="이전 달"
                >
                  <ChevronIcon direction="left" />
                </button>
                <div className="text-center">
                  <h3 className="text-[16px] font-bold text-[#15171A]">
                    {formatMonthLabel(visibleMonth)}
                  </h3>
                  <p className="mt-0.5 text-[11px] font-medium text-[#9CA3AF]">
                    수업을 눌러 해당 반의 수업일을 선택하세요
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setVisibleMonth((month) => addMonths(month, 1))
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E5E7EB] text-[#6E6A63] hover:bg-[#F7F7F7]"
                  aria-label="다음 달"
                >
                  <ChevronIcon direction="right" />
                </button>
              </div>

              <div className="grid shrink-0 grid-cols-7 overflow-hidden rounded-t-[12px] border border-b-0 border-[#E5E7EB] bg-[#F8F9FA]">
                {CALENDAR_WEEKDAYS.map((weekday, index) => (
                  <div
                    key={weekday}
                    className={`py-2 text-center text-[11px] font-bold ${
                      index === 6
                        ? "text-[#E15B5B]"
                        : index === 5
                          ? "text-[#4D83C5]"
                          : "text-[#8B8F96]"
                    }`}
                  >
                    {weekday}
                  </div>
                ))}
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-hidden rounded-b-[12px] border-l border-t border-[#E5E7EB]">
                {monthCells.map((cell) => {
                  const dateKey = toLocalIsoDate(cell.date);
                  const lessons = candidatesByDate.get(dateKey) ?? [];
                  const today = toLocalIsoDate(new Date()) === dateKey;
                  const hasSelectedLesson = lessons.some(
                    (lesson) =>
                      picks[lesson.classId]?.lesson.key === lesson.key,
                  );
                  return (
                    <div
                      key={dateKey}
                      className={`relative flex min-h-0 flex-col overflow-hidden border-r border-b border-[#E5E7EB] p-1 ${
                        cell.inMonth ? "bg-white" : "bg-[#FAFAFB]"
                      }`}
                    >
                      {hasSelectedLesson ? (
                        <div
                          className="pointer-events-none absolute -inset-px z-10 rounded-[9px] border-2 border-[#2F80ED]"
                          aria-hidden
                        />
                      ) : null}
                      <div
                        className={`mb-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                          today
                            ? "bg-[#FF6666] text-white"
                            : cell.inMonth
                              ? cell.date.getDay() === 0
                                ? "text-[#E15B5B]"
                                : "text-[#5F6368]"
                              : "text-[#C5C8CE]"
                        }`}
                      >
                        {cell.date.getDate()}
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                        {lessons.slice(0, 2).map((lesson) => {
                          return (
                            <button
                              key={lesson.key}
                              type="button"
                              onClick={() => selectLesson(lesson)}
                              title={`${lesson.name} ${lesson.start}–${lesson.end}`}
                              className="min-w-0 shrink-0 rounded-[5px] border-l-[3px] px-1 py-0.5 text-left outline-none transition-all hover:brightness-95 focus-visible:ring-2 focus-visible:ring-[#1AA7F2]"
                              style={{
                                backgroundColor: lesson.colors.calendar,
                                borderLeftColor: lesson.colors.bar,
                                color: lesson.colors.text,
                              }}
                            >
                              <span className="block truncate text-[10px] font-bold leading-tight">
                                {lesson.name} {lesson.start}
                              </span>
                            </button>
                          );
                        })}
                        {lessons.length > 2 ? (
                          <span className="truncate px-0.5 text-[9px] font-semibold text-[#9CA3AF]">
                            +{lessons.length - 2}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <form
          onSubmit={submit}
          className="shrink-0 border-t border-[#F0F1F3] px-6 py-4"
        >
          <div className="mb-3 rounded-[14px] border border-[#E8E8EA] bg-[#F9FAFB] px-4 py-3.5">
            {focusPick ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-[#8B8F96]">
                      선택한 수업
                    </p>
                    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2">
                      <div
                        className="inline-flex max-w-full items-center gap-1.5 rounded-[6px] border-l-[3px] px-2 py-1"
                        style={{
                          backgroundColor: focusPick.lesson.colors.calendar,
                          borderLeftColor: focusPick.lesson.colors.bar,
                        }}
                      >
                        <span
                          className="truncate text-[13px] font-bold leading-none"
                          style={{ color: focusPick.lesson.colors.text }}
                        >
                          {focusPick.lesson.name}
                        </span>
                        <span
                          className="shrink-0 text-[12px] font-semibold leading-none opacity-75"
                          style={{ color: focusPick.lesson.colors.text }}
                        >
                          {formatLessonDateKo(focusPick.lesson.date)}
                        </span>
                      </div>
                      <span className="text-[13px] font-semibold leading-none text-[#6E6A63]">
                        {focusPick.lesson.start} ~ {focusPick.lesson.end}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1 self-start rounded-[10px] bg-[#EEEFF1] p-1">
                    <button
                      type="button"
                      onClick={() => setDeadlineMode("custom")}
                      className={`h-8 rounded-[8px] px-3 text-[12px] font-bold transition-colors ${
                        focusPick.deadlineMode === "custom"
                          ? "bg-white text-[#15171A] shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                          : "text-[#8B8F96] hover:text-[#3D4148]"
                      }`}
                    >
                      직접 설정
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeadlineMode("nextLesson")}
                      className={`h-8 rounded-[8px] px-3 text-[12px] font-bold transition-colors ${
                        focusPick.deadlineMode === "nextLesson"
                          ? "bg-white text-[#15171A] shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                          : "text-[#8B8F96] hover:text-[#3D4148]"
                      }`}
                    >
                      다음 수업 전까지
                    </button>
                  </div>
                </div>

                {focusPick.deadlineMode === "custom" ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="min-w-0">
                      <p className="mb-1.5 text-[11px] font-bold text-[#8B8F96]">
                        마감 날짜
                      </p>
                      <div className="relative">
                        <input
                          type="date"
                          min={focusPick.lesson.date}
                          value={focusPick.deadlineDate}
                          onChange={(event) => {
                            const next = event.target.value;
                            setPicks((prev) => {
                              const current = prev[focusClassId];
                              if (!current) return prev;
                              return {
                                ...prev,
                                [focusClassId]: {
                                  ...current,
                                  deadlineDate: next,
                                },
                              };
                            });
                            setError("");
                          }}
                          className="h-11 w-full rounded-[10px] border border-[#E1E2E4] bg-white px-3 pr-10 text-[13px] font-semibold text-[#15171A] outline-none focus:border-[#1AA7F2]"
                        />
                        <span
                          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[#9CA3AF]"
                          aria-hidden
                        >
                          <CalendarIcon />
                        </span>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1.5 text-[11px] font-bold text-[#8B8F96]">
                        마감 시간
                      </p>
                      <ClassTimePicker
                        align="right"
                        className="w-full"
                        value={focusPick.deadlineTime}
                        onChange={(next) => {
                          setPicks((prev) => {
                            const current = prev[focusClassId];
                            if (!current) return prev;
                            return {
                              ...prev,
                              [focusClassId]: {
                                ...current,
                                deadlineTime: next,
                              },
                            };
                          });
                          setError("");
                        }}
                      />
                    </div>
                  </div>
                ) : focusPick.deadlineDate && focusPick.deadlineTime ? (
                  <div className="overflow-hidden rounded-[12px] border border-[#D6EDFB] bg-[#F2FAFF]">
                    <div className="flex items-start gap-3 px-3.5 py-3">
                      <span
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E7F5FE] text-[#1AA7F2]"
                        aria-hidden
                      >
                        <DeadlineClockIcon />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold tracking-[0.02em] text-[#1274A9]">
                          자동 마감
                        </p>
                        <p className="mt-1 text-[18px] font-bold leading-none tracking-[-0.02em] text-[#15171A]">
                          {formatLessonDateKo(focusPick.deadlineDate)}{" "}
                          <span className="text-[#1AA7F2]">
                            {focusPick.deadlineTime}
                          </span>
                        </p>
                        <p className="mt-1.5 text-[12px] font-medium leading-5 text-[#5F6368]">
                          다음 수업이 시작되기 직전까지 제출할 수 있어요.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 border-t border-[#D6EDFB] bg-white/70 px-3.5 py-2.5">
                      <span className="truncate text-[12px] font-semibold text-[#6B7280]">
                        {formatLessonDateKo(focusPick.lesson.date)}{" "}
                        {focusPick.lesson.start}
                      </span>
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E7F5FE] text-[#1AA7F2]"
                        aria-hidden
                      >
                        <ArrowRightIcon />
                      </span>
                      <span className="truncate text-[12px] font-bold text-[#1274A9]">
                        {formatLessonDateKo(focusPick.deadlineDate)}{" "}
                        {focusPick.deadlineTime}
                      </span>
                      <span className="ml-auto shrink-0 rounded-full bg-[#EAF6FE] px-2 py-0.5 text-[10px] font-bold text-[#1274A9]">
                        다음 수업
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[12px] border border-[#F5D0D0] bg-[#FFF7F7] px-3.5 py-3">
                    <p className="text-[13px] font-bold text-[#C52B2B]">
                      예정된 다음 수업을 찾을 수 없어요
                    </p>
                    <p className="mt-1 text-[12px] font-medium text-[#8B8F96]">
                      「직접 설정」으로 마감 날짜와 시간을 정해 주세요.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[13px] font-semibold text-[#8B8F96]">
                {focusClassId
                  ? "위에서 해당 반의 수업을 선택해 주세요."
                  : "받을 반을 확인해 주세요."}
              </p>
            )}
          </div>

          {error ? (
            <p className="mb-3 text-[12px] font-semibold text-[#C52B2B]">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-[12px] border border-[#E1E2E4] bg-white px-5 text-[14px] font-bold text-[#3D4148] hover:bg-[#F7F7F7]"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!allReady}
              className={`h-11 rounded-[12px] px-5 text-[14px] font-bold ${
                allReady
                  ? "bg-[#2F80ED] text-white hover:bg-[#2569C4]"
                  : "cursor-not-allowed bg-[#E5E7EB] text-[#6B7280]"
              }`}
            >
              과제 부여
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 4L12 12M12 4L4 12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="2.5"
        y="3.5"
        width="11"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M2.5 6.5h11" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5.5 2v2.5M10.5 2v2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DeadlineClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle
        cx="9"
        cy="9"
        r="6.25"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M9 5.75V9l2.25 1.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2.5 6h7M6.5 3.5 9.5 6 6.5 8.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d={direction === "left" ? "M10 3.5L5.5 8L10 12.5" : "M6 3.5L10.5 8L6 12.5"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
