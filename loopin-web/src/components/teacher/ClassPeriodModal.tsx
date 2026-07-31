"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

type ClassPeriodModalProps = {
  open: boolean;
  onClose: () => void;
  periodName: string;
  startDate: string;
  endDate: string;
  onConfirm: (next: {
    periodName: string;
    startDate: string;
    endDate: string;
  }) => void;
  /** `frame`: 교사 Figma 프레임 안에서 띄움 (새 반 만들기 직후) */
  overlay?: "fixed" | "frame";
  /** false면 취소·딤 클릭·Esc로 닫을 수 없음 — 수업 기간 입력을 필수로 강제 */
  dismissible?: boolean;
};

const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * 반 설정 — 수업 기간 팝업.
 * 수업 이름 + 개강일 ≫ 종강일 + 커스텀 캘린더.
 */
export function ClassPeriodModal({
  open,
  onClose,
  periodName: initialName,
  startDate: initialStart,
  endDate: initialEnd,
  onConfirm,
  overlay = "fixed",
  dismissible = true,
}: ClassPeriodModalProps) {
  const titleId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [periodName, setPeriodName] = useState(initialName);
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState<"start" | "end" | null>(null);

  useEffect(() => {
    if (!open) return;
    setPeriodName(initialName);
    setStartDate(initialStart);
    setEndDate(initialEnd);
    setError("");
    setPicker(null);
    const t = window.setTimeout(() => nameRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open, initialName, initialStart, initialEnd]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (picker) setPicker(null);
        else if (dismissible) onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, picker, dismissible]);

  if (!open) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = periodName.trim();
    if (!trimmed) {
      setError("수업 이름을 입력해 주세요");
      return;
    }
    if (!startDate) {
      setError("개강일을 선택해 주세요");
      return;
    }
    if (endDate && startDate > endDate) {
      setError("종강일은 개강일 이후로 설정해 주세요");
      return;
    }
    onConfirm({
      periodName: trimmed,
      startDate,
      endDate,
    });
  }

  function selectStart(iso: string) {
    setStartDate(iso);
    if (endDate && iso > endDate) setEndDate("");
    setPicker(null);
    setError("");
  }

  function selectEnd(iso: string) {
    setEndDate(iso);
    setPicker(null);
    setError("");
  }

  const isFrameOverlay = overlay === "frame";

  return (
    <div
      className={`flex items-center justify-center ${
        isFrameOverlay
          ? "absolute inset-0 z-[60] bg-black/35 p-6"
          : "fixed inset-0 z-[80] p-4"
      }`}
      onClick={isFrameOverlay && dismissible ? onClose : undefined}
      role="presentation"
    >
      {!isFrameOverlay ? (
        <button
          type="button"
          aria-label="닫기"
          disabled={!dismissible}
          className="absolute inset-0 bg-black/35 disabled:cursor-default"
          onClick={dismissible ? onClose : undefined}
        />
      ) : null}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 flex w-full max-w-[420px] flex-col overflow-visible rounded-2xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] ${
          isFrameOverlay ? "" : "z-10"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 pt-7 pb-2">
          <h2
            id={titleId}
            className="text-[18px] font-bold tracking-tight text-[#15171A]"
          >
            수업 기간 설정
          </h2>
          {!dismissible ? (
            <p className="mt-1 text-[13px] font-medium text-[#8B8F96]">
              캘린더에 반영하려면 수업 기간을 설정해야 해요.
            </p>
          ) : null}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-5 px-8 pb-7 pt-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-[#3D4148]">
              수업 이름 <span className="text-[#EF4444]">*</span>
            </span>
            <input
              ref={nameRef}
              value={periodName}
              onChange={(e) => {
                setPeriodName(e.target.value);
                if (error) setError("");
              }}
              maxLength={40}
              placeholder="예: 1학기, 보충수업"
              className="h-11 rounded-[10px] border border-[#E1E2E4] px-3 text-[15px] font-semibold text-[#15171A] outline-none placeholder:font-normal placeholder:text-[#9CA3AF] focus:border-[#1AA7F2]"
            />
          </label>

          {/* 개강일 · 종강일 */}
          <div className="flex flex-col items-stretch gap-2">
            <DateField
              label="개강일"
              required
              value={startDate}
              placeholder="날짜 선택"
              open={picker === "start"}
              onToggle={() =>
                setPicker((p) => (p === "start" ? null : "start"))
              }
              onSelect={selectStart}
              onClose={() => setPicker(null)}
            />

            <DateField
              label="종강일"
              value={endDate}
              placeholder="미정"
              optional
              minDate={startDate || undefined}
              open={picker === "end"}
              onToggle={() => setPicker((p) => (p === "end" ? null : "end"))}
              onSelect={selectEnd}
              onClear={() => {
                setEndDate("");
                setPicker(null);
              }}
              onClose={() => setPicker(null)}
            />

            <p className="text-[12px] font-medium text-[#9CA3AF]">
              비워두면 개강일 다음 해 2월 말까지 캘린더에 표시돼요.
            </p>
          </div>

          {error ? (
            <p className="text-[13px] font-medium text-[#C52B2B]">{error}</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            {dismissible ? (
              <button
                type="button"
                onClick={onClose}
                className="h-10 min-w-[72px] rounded-[10px] border border-[#E1E2E4] bg-white px-4 text-[14px] font-bold text-[#3D4148] hover:bg-[#F3F4F5]"
              >
                취소
              </button>
            ) : null}
            <button
              type="submit"
              className="h-10 min-w-[72px] rounded-[10px] bg-[#1AA7F2] px-5 text-[14px] font-bold text-white hover:bg-[#1596d9]"
            >
              확인
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  placeholder,
  required,
  optional,
  minDate,
  open,
  onToggle,
  onSelect,
  onClear,
  onClose,
}: {
  label: string;
  value: string;
  placeholder: string;
  required?: boolean;
  optional?: boolean;
  minDate?: string;
  open: boolean;
  onToggle: () => void;
  onSelect: (iso: string) => void;
  onClear?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="relative flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-[#3D4148]">
        {label}
        {required ? <span className="text-[#EF4444]"> *</span> : null}
        {optional ? (
          <span className="ml-1 font-medium text-[#9CA3AF]">(선택)</span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex h-11 items-center justify-between rounded-[10px] border bg-white px-3 text-left text-[14px] font-semibold outline-none ${
          open
            ? "border-[#1AA7F2] ring-2 ring-[#1AA7F2]/20"
            : "border-[#E1E2E4] hover:border-[#1AA7F2]"
        }`}
      >
        {value ? (
          <span className="text-[#15171A]">{formatDisplayDate(value)}</span>
        ) : (
          <span className="font-medium text-[#9CA3AF]">{placeholder}</span>
        )}
        <CalendarIcon />
      </button>

      {open ? (
        <MiniCalendar
          value={value}
          minDate={minDate}
          onSelect={onSelect}
          onClear={optional ? onClear : undefined}
          onClose={onClose}
        />
      ) : null}
    </div>
  );
}

function MiniCalendar({
  value,
  minDate,
  onSelect,
  onClear,
  onClose,
}: {
  value: string;
  minDate?: string;
  onSelect: (iso: string) => void;
  onClear?: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const seed = parseIso(value) ?? parseIso(minDate) ?? new Date();
  const [cursor, setCursor] = useState(
    () => new Date(seed.getFullYear(), seed.getMonth(), 1),
  );

  useEffect(() => {
    const d = parseIso(value) ?? parseIso(minDate) ?? new Date();
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [value, minDate]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) onClose();
    };
    const t = window.setTimeout(
      () => document.addEventListener("mousedown", onDoc),
      0,
    );
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [onClose]);

  const cells = useMemo(() => buildMonthCells(cursor), [cursor]);
  const todayIso = toIso(new Date());
  const yearNow = new Date().getFullYear();
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = yearNow - 3; y <= yearNow + 5; y++) list.push(y);
    return list;
  }, [yearNow]);

  return (
    <div
      ref={panelRef}
      className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-[14px] border border-[#E8E8EA] bg-white p-4 shadow-[0_8px_24px_rgba(21,23,26,0.12)]"
    >
      <div className="mb-3 flex items-center gap-2">
        <label className="sr-only" htmlFor="cal-year">
          연도
        </label>
        <select
          id="cal-year"
          value={cursor.getFullYear()}
          onChange={(e) => {
            const y = Number(e.target.value);
            setCursor((d) => new Date(y, d.getMonth(), 1));
          }}
          className="h-9 flex-1 rounded-[8px] border border-[#E1E2E4] bg-white px-2.5 text-[13px] font-bold text-[#15171A] outline-none focus:border-[#1AA7F2]"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="cal-month">
          월
        </label>
        <select
          id="cal-month"
          value={cursor.getMonth()}
          onChange={(e) => {
            const m = Number(e.target.value);
            setCursor((d) => new Date(d.getFullYear(), m, 1));
          }}
          className="h-9 w-[88px] rounded-[8px] border border-[#E1E2E4] bg-white px-2.5 text-[13px] font-bold text-[#15171A] outline-none focus:border-[#1AA7F2]"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i}>
              {i + 1}월
            </option>
          ))}
        </select>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-0.5">
        {WEEK_LABELS.map((w) => (
          <div
            key={w}
            className="flex h-8 items-center justify-center text-[12px] font-semibold text-[#9CA3AF]"
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, i) => {
          if (!cell) {
            return <div key={`empty-${i}`} className="h-9" />;
          }
          const disabled = Boolean(minDate && cell.iso < minDate);
          const selected = value === cell.iso;
          const isToday = cell.iso === todayIso;
          return (
            <button
              key={cell.iso}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(cell.iso)}
              className={`flex h-9 items-center justify-center rounded-[10px] text-[13px] font-semibold outline-none transition-colors ${
                selected
                  ? "bg-[#1AA7F2] text-white"
                  : disabled
                    ? "cursor-not-allowed text-[#D1D5DB]"
                    : isToday
                      ? "bg-[#F0F9FF] text-[#1AA7F2] hover:bg-[#E0F2FE]"
                      : "text-[#15171A] hover:bg-[#F3F4F5]"
              }`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-3 w-full rounded-[8px] py-2 text-[13px] font-semibold text-[#6B7280] hover:bg-[#F3F4F5]"
        >
          종강일 미정으로 두기
        </button>
      ) : null}
    </div>
  );
}

function buildMonthCells(
  monthStart: Date,
): ({ day: number; iso: string } | null)[] {
  const y = monthStart.getFullYear();
  const m = monthStart.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: ({ day: number; iso: string } | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, iso: toIso(new Date(y, m, d)) });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIso(iso?: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatDisplayDate(iso: string): string {
  const d = parseIso(iso);
  if (!d) return iso;
  const week = WEEK_LABELS[d.getDay()];
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} (${week})`;
}

export function formatClassPeriodSummary(period: {
  name?: string;
  startDate?: string;
  endDate?: string;
}): string | null {
  const periodName = period.name;
  const startDate = period.startDate;
  const endDate = period.endDate;
  if (!startDate && !periodName?.trim()) return null;
  const range = startDate
    ? endDate
      ? `${formatDisplayDate(startDate)} ≫ ${formatDisplayDate(endDate)}`
      : `${formatDisplayDate(startDate)} ≫ 종강 미정`
    : null;
  if (periodName?.trim() && range) return `${periodName.trim()} · ${range}`;
  if (periodName?.trim()) return periodName.trim();
  return range;
}

function CalendarIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className="shrink-0 text-[#9CA3AF]"
    >
      <rect
        x="3"
        y="4.5"
        width="14"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M3 8h14" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 2.5v3M13 2.5v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
