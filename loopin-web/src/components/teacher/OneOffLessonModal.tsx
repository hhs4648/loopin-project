"use client";

import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { CalendarSlotPreset } from "@/components/teacher/CalendarEventsOverlay";
import { ClassTimePicker } from "@/components/teacher/ClassTimePicker";
import {
  createOneOffLessonId,
  type OneOffLesson,
} from "@/lib/calendar-one-off-lessons";
import type { TeacherClass, Weekday } from "@/lib/teacher-classes";
import { parseIsoDateLocal } from "@/lib/teacher-classes";
import { weekdayFromDate } from "@/lib/calendar-layout";

/** 정규 시간표 수업 — 빈 칸·추가 수업과 동일 팝업으로 수정 */
export type RecurringLessonEdit = {
  classId: string;
  fromDay: Weekday;
  date: string;
  start: string;
  end: string;
};

type OneOffLessonModalProps = {
  open: boolean;
  classes: TeacherClass[];
  preset: CalendarSlotPreset | null;
  editing?: OneOffLesson | null;
  recurring?: RecurringLessonEdit | null;
  onClose: () => void;
  onSave: (lesson: OneOffLesson) => void;
  onSaveRecurring?: (next: {
    classId: string;
    fromDay: Weekday;
    toDay: Weekday;
    start: string;
    end: string;
    title?: string;
  }) => void;
  onDelete?: (lessonId: string) => void;
  onDeleteRecurring?: (classId: string, day: Weekday) => void;
};

export function OneOffLessonModal({
  open,
  classes,
  preset,
  editing = null,
  recurring = null,
  onClose,
  onSave,
  onSaveRecurring,
  onDelete,
  onDeleteRecurring,
}: OneOffLessonModalProps) {
  const titleId = useId();
  const isEdit = Boolean(editing || recurring);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const recurringMeta = recurring
      ? classes.find((item) => item.id === recurring.classId)?.dayLessonMeta?.[
          recurring.fromDay
        ]
      : undefined;
    setClassId(
      editing?.classId ??
        recurring?.classId ??
        (classes.length === 1 ? classes[0]!.id : ""),
    );
    setDate(editing?.date ?? recurring?.date ?? preset?.date ?? "");
    setStart(editing?.start ?? recurring?.start ?? preset?.start ?? "");
    setEnd(editing?.end ?? recurring?.end ?? preset?.end ?? "");
    setTitle(editing?.title ?? recurringMeta?.title ?? "");
    setError("");
  }, [open, editing, recurring, preset, classes]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!classId) {
      setError("수업을 추가할 반을 선택해 주세요.");
      return;
    }
    if (!date || !start || !end) {
      setError("수업 날짜와 시간을 확인해 주세요.");
      return;
    }
    if (end <= start) {
      setError("종료 시간은 시작 시간보다 늦어야 해요.");
      return;
    }

    if (recurring && onSaveRecurring) {
      const parsed = parseIsoDateLocal(date);
      const toDay = parsed
        ? weekdayFromDate(parsed)
        : recurring.fromDay;
      onSaveRecurring({
        classId,
        fromDay: recurring.fromDay,
        toDay,
        start,
        end,
        title: title.trim() || undefined,
      });
      return;
    }

    onSave({
      id: editing?.id ?? createOneOffLessonId(),
      classId,
      date,
      start,
      end,
      title: title.trim() || undefined,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    });
  };

  const heading = isEdit ? "수업 수정" : "수업 추가";
  const description = recurring
    ? "선택한 정규 수업의 요일·시간을 수정합니다."
    : editing
      ? "이 날짜에만 있는 추가 수업을 수정합니다."
      : "정규 시간표와 별개로 이 날짜에만 수업을 추가합니다.";

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-[540px] rounded-[20px] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[#ECEDEF] px-7 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id={titleId}
                className="text-[20px] font-bold tracking-[-0.02em] text-[#15171A]"
              >
                {heading}
              </h2>
              <p className="mt-1 text-[13px] font-medium text-[#8A8F98]">
                {description}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[20px] text-[#9CA3AF] transition-colors hover:bg-[#F3F4F5] hover:text-[#3D4148]"
            >
              ×
            </button>
          </div>
        </div>

        <form onSubmit={submit}>
          <div className="space-y-5 px-7 py-6">
            <fieldset>
              <legend className="text-[13px] font-bold text-[#3D4148]">
                반 선택 <span className="text-[#EF4444]">*</span>
              </legend>
              {classes.length > 0 ? (
                <div className="mt-2 grid max-h-[150px] grid-cols-2 gap-2 overflow-y-auto">
                  {classes.map((teacherClass) => {
                    const selected = teacherClass.id === classId;
                    return (
                      <button
                        key={teacherClass.id}
                        type="button"
                        onClick={() => {
                          setClassId(teacherClass.id);
                          setError("");
                        }}
                        className={`flex h-12 items-center gap-2.5 rounded-[12px] border px-3 text-left transition-all ${
                          selected
                            ? "border-[#1AA7F2] bg-[#F0F9FE] shadow-[0_0_0_1px_#1AA7F2]"
                            : "border-[#E3E5E8] bg-white hover:border-[#BFC5CC] hover:bg-[#FAFAFA]"
                        }`}
                      >
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{
                            backgroundColor: teacherClass.color,
                            boxShadow: `0 0 0 3px ${teacherClass.color}22`,
                          }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-[#30343A]">
                          {teacherClass.name}
                        </span>
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                            selected
                              ? "border-[#1AA7F2] bg-[#1AA7F2] text-white"
                              : "border-[#D5D8DC] text-transparent"
                          }`}
                          aria-hidden
                        >
                          ✓
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 rounded-[12px] border border-dashed border-[#D8DCE1] bg-[#FAFAFA] px-4 py-5 text-center text-[13px] font-medium text-[#8A8F98]">
                  먼저 담당 반을 만들어 주세요.
                </div>
              )}
            </fieldset>

            <div className="grid grid-cols-[1fr_132px_132px] gap-3">
              <Field label="수업 날짜" required>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setError("");
                  }}
                  className="h-11 w-full rounded-[10px] border border-[#E1E2E4] px-3 text-[14px] font-semibold text-[#30343A] outline-none focus:border-[#1AA7F2]"
                />
              </Field>
              <Field label="시작 시간" required>
                <ClassTimePicker
                  value={start}
                  onChange={(next) => {
                    setStart(next);
                    setError("");
                  }}
                />
              </Field>
              <Field label="종료 시간" required>
                <ClassTimePicker
                  align="right"
                  value={end}
                  onChange={(next) => {
                    setEnd(next);
                    setError("");
                  }}
                />
              </Field>
            </div>

            <Field label="메모" hint="선택">
              <input
                value={title}
                maxLength={40}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="비워두면 반 이름만 표시"
                className="h-11 w-full rounded-[10px] border border-[#E1E2E4] px-3 text-[14px] font-semibold text-[#30343A] outline-none placeholder:font-normal placeholder:text-[#A8ADB5] focus:border-[#1AA7F2]"
              />
            </Field>

            {error ? (
              <p className="text-[13px] font-semibold text-[#D83A3A]">{error}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-between border-t border-[#ECEDEF] px-7 py-4">
            <div>
              {editing && onDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(editing.id)}
                  className="h-10 rounded-[10px] border border-[#F0B4B4] bg-white px-5 text-[14px] font-bold text-[#D83A3A] transition-colors hover:bg-[#FFF1F1]"
                >
                  삭제
                </button>
              ) : null}
              {recurring && onDeleteRecurring ? (
                <button
                  type="button"
                  onClick={() =>
                    onDeleteRecurring(recurring.classId, recurring.fromDay)
                  }
                  className="h-10 rounded-[10px] border border-[#F0B4B4] bg-white px-5 text-[14px] font-bold text-[#D83A3A] transition-colors hover:bg-[#FFF1F1]"
                >
                  삭제
                </button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-[10px] border border-[#E1E2E4] bg-white px-5 text-[14px] font-bold text-[#4A4F57] hover:bg-[#F7F8F9]"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={classes.length === 0}
                className="h-10 rounded-[10px] bg-[#1AA7F2] px-5 text-[14px] font-bold text-white transition-colors hover:bg-[#1596D9] disabled:cursor-not-allowed disabled:bg-[#B9DFF4]"
              >
                {isEdit ? "저장" : "수업 추가"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required = false,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13px] font-bold text-[#3D4148]">
        {label} {required ? <span className="text-[#EF4444]">*</span> : null}
        {hint ? (
          <span className="ml-1 text-[11px] font-medium text-[#A0A5AD]">
            ({hint})
          </span>
        ) : null}
      </span>
      {children}
    </div>
  );
}
