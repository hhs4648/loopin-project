"use client";

import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  createAcademicHolidayId,
  formatHolidayRange,
  type AcademicHoliday,
  type AcademicScheduleSettings,
} from "@/lib/calendar-academic-schedule";

type CalendarAcademicScheduleModalProps = {
  open: boolean;
  settings: AcademicScheduleSettings;
  onClose: () => void;
  onSave: (next: AcademicScheduleSettings) => void;
};

export function CalendarAcademicScheduleModal({
  open,
  settings,
  onClose,
  onSave,
}: CalendarAcademicScheduleModalProps) {
  const titleId = useId();
  const [holidays, setHolidays] = useState<AcademicHoliday[]>([]);
  const [includePublicHolidays, setIncludePublicHolidays] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setHolidays(
      [...settings.holidays].sort((a, b) =>
        a.startDate.localeCompare(b.startDate),
      ),
    );
    setIncludePublicHolidays(settings.includePublicHolidays);
    resetForm();
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function resetForm() {
    setName("");
    setStartDate("");
    setEndDate("");
    setEditingId(null);
    setError("");
  }

  function startEdit(holiday: AcademicHoliday) {
    setEditingId(holiday.id);
    setName(holiday.name);
    setStartDate(holiday.startDate);
    setEndDate(
      holiday.endDate === holiday.startDate ? "" : holiday.endDate,
    );
    setError("");
  }

  function upsertHoliday(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("휴일 이름을 입력해 주세요.");
      return;
    }
    if (!startDate) {
      setError("시작일을 선택해 주세요.");
      return;
    }
    const resolvedEnd = endDate || startDate;
    if (resolvedEnd < startDate) {
      setError("종료일은 시작일 이후로 설정해 주세요.");
      return;
    }

    const nextHoliday: AcademicHoliday = {
      id: editingId ?? createAcademicHolidayId(),
      name: trimmed,
      startDate,
      endDate: resolvedEnd,
    };

    setHolidays((prev) => {
      const without = prev.filter((h) => h.id !== nextHoliday.id);
      return [...without, nextHoliday].sort((a, b) =>
        a.startDate.localeCompare(b.startDate),
      );
    });
    resetForm();
  }

  function removeHoliday(id: string) {
    setHolidays((prev) => prev.filter((h) => h.id !== id));
    if (editingId === id) resetForm();
  }

  function submitAll(event: FormEvent) {
    event.preventDefault();
    onSave({
      holidays,
      includePublicHolidays,
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
        className="flex max-h-[min(720px,90%)] w-[560px] flex-col rounded-[20px] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#F0F1F3] px-6 py-5">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-[20px] font-bold tracking-[-0.02em] text-[#15171A]"
            >
              학사일정 관리
            </h2>
            <p className="mt-1 text-[13px] font-medium text-[#8B8F96]">
              등록한 휴일에는 정규 시간표 수업이 자동으로 생기지 않아요.
              직접 추가한 수업은 그대로 유지됩니다.
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

        <div className="flex-1 overflow-y-auto px-6 py-5 [scrollbar-width:thin]">
          <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-[#E8E8EA] bg-[#F9FAFB] px-4 py-3.5">
            <input
              type="checkbox"
              checked={!includePublicHolidays}
              onChange={(e) => setIncludePublicHolidays(!e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[#C9CDD3] text-[#1AA7F2] focus:ring-[#1AA7F2]"
            />
            <span className="min-w-0">
              <span className="block text-[14px] font-bold text-[#15171A]">
                공휴일에는 정규 수업을 제외해요
              </span>
            </span>
          </label>

          <section className="mt-5" aria-label="학교 휴일">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-bold text-[#3D4148]">
                학교 휴일
              </h3>
              <span className="text-[12px] font-semibold text-[#8B8F96]">
                {holidays.length}개
              </span>
            </div>

            {holidays.length === 0 ? (
              <div className="rounded-[14px] border border-dashed border-[#E1E2E4] px-4 py-6 text-center">
                <p className="text-[13px] font-bold text-[#6E6A63]">
                  등록된 휴일이 없어요
                </p>
                <p className="mt-1 text-[12px] font-medium text-[#9CA3AF]">
                  방학·재량휴업일 등을 추가해 주세요.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {holidays.map((holiday) => (
                  <li
                    key={holiday.id}
                    className={`flex items-center gap-3 rounded-[12px] border px-3.5 py-3 ${
                      editingId === holiday.id
                        ? "border-[#1AA7F2] bg-[#E8F6FD]"
                        : "border-[#E8E8EA] bg-white"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-[#15171A]">
                        {holiday.name}
                      </p>
                      <p className="mt-0.5 text-[12px] font-semibold text-[#8B8F96]">
                        {formatHolidayRange(holiday)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startEdit(holiday)}
                      className="rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-[#3D4148] hover:bg-[#F3F4F5]"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => removeHoliday(holiday.id)}
                      className="rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-[#C52B2B] hover:bg-[#FEE7E7]"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <form
            onSubmit={upsertHoliday}
            className="mt-5 rounded-[14px] border border-[#E8E8EA] p-4"
          >
            <h3 className="text-[13px] font-bold text-[#3D4148]">
              {editingId ? "휴일 수정" : "휴일 추가"}
            </h3>
            <div className="mt-3 flex flex-col gap-3">
              <Field label="휴일 이름" required>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError("");
                  }}
                  placeholder="예: 여름방학, 개교기념일"
                  className="h-11 w-full rounded-[10px] border border-[#E1E2E4] px-3 text-[14px] font-semibold text-[#30343A] outline-none focus:border-[#1AA7F2]"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="시작일" required>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setError("");
                    }}
                    className="h-11 w-full rounded-[10px] border border-[#E1E2E4] px-3 text-[14px] font-semibold text-[#30343A] outline-none focus:border-[#1AA7F2]"
                  />
                </Field>
                <Field label="종료일" hint="하루면 비워두기">
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setError("");
                    }}
                    className="h-11 w-full rounded-[10px] border border-[#E1E2E4] px-3 text-[14px] font-semibold text-[#30343A] outline-none focus:border-[#1AA7F2]"
                  />
                </Field>
              </div>
              {error ? (
                <p className="text-[12px] font-semibold text-[#C52B2B]">
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                {editingId ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="h-10 rounded-[10px] border border-[#E1E2E4] bg-white px-4 text-[13px] font-bold text-[#3D4148] hover:bg-[#F7F7F7]"
                  >
                    작성 취소
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="h-10 rounded-[10px] bg-[#1AA7F2] px-4 text-[13px] font-bold text-white hover:bg-[#1596d9]"
                >
                  {editingId ? "휴일 반영" : "목록에 추가"}
                </button>
              </div>
            </div>
          </form>
        </div>

        <form
          onSubmit={submitAll}
          className="flex items-center justify-end gap-2 border-t border-[#F0F1F3] px-6 py-4"
        >
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-[12px] border border-[#E1E2E4] bg-white px-5 text-[14px] font-bold text-[#3D4148] hover:bg-[#F7F7F7]"
          >
            취소
          </button>
          <button
            type="submit"
            className="h-11 rounded-[12px] bg-[#1AA7F2] px-5 text-[14px] font-bold text-white hover:bg-[#1596d9]"
          >
            저장
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[12px] font-bold text-[#3D4148]">{label}</span>
        {required ? (
          <span className="text-[11px] font-bold text-[#1AA7F2]">*</span>
        ) : null}
        {hint ? (
          <span className="text-[11px] font-medium text-[#9CA3AF]">{hint}</span>
        ) : null}
      </div>
      {children}
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
