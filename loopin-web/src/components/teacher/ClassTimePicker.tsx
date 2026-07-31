"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ClassTimeRange } from "@/lib/teacher-classes";

/** 오전 6시 ~ 오후 10시 */
const MIN_MINUTES = 6 * 60;
const MAX_MINUTES = 22 * 60;

const MINUTES_5 = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const;

type Period = "am" | "pm";

type HourSlot = {
  key: string;
  period: Period;
  hour12: number;
  label: string;
};

/** 시간 휠: 오전6 → … → 오전11 → 오후12 → … → 오후10 */
const HOUR_SLOTS: HourSlot[] = [
  ...[6, 7, 8, 9, 10, 11].map((h) => ({
    key: `am-${h}`,
    period: "am" as const,
    hour12: h,
    label: String(h).padStart(2, "0"),
  })),
  {
    key: "pm-12",
    period: "pm",
    hour12: 12,
    label: "12",
  },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((h) => ({
    key: `pm-${h}`,
    period: "pm" as const,
    hour12: h,
    label: String(h).padStart(2, "0"),
  })),
];

type Parsed = {
  period: Period;
  hour12: number;
  minute: number;
};

function toMinutes(period: Period, hour12: number, minute: number): number {
  let h = hour12 % 12;
  if (period === "pm") h += 12;
  if (period === "am" && hour12 === 12) h = 0;
  return h * 60 + minute;
}

function clampToRange(
  period: Period,
  hour12: number,
  minute: number,
): Parsed {
  let m = Math.round(minute / 5) * 5;
  if (m >= 60) m = 55;
  let total = toMinutes(period, hour12, m);
  if (total < MIN_MINUTES) {
    return { period: "am", hour12: 6, minute: 0 };
  }
  if (total > MAX_MINUTES) {
    return { period: "pm", hour12: 10, minute: 0 };
  }
  return { period, hour12, minute: m };
}

function parseTime(hhmm: string): Parsed {
  const [hStr, mStr] = hhmm.split(":");
  let h = Number(hStr) || 0;
  let m = Number(mStr) || 0;
  m = Math.round(m / 5) * 5;
  if (m >= 60) {
    m = 0;
    h = (h + 1) % 24;
  }
  const period: Period = h >= 12 ? "pm" : "am";
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return clampToRange(period, hour12, m);
}

function toHhmm(period: Period, hour12: number, minute: number): string {
  const c = clampToRange(period, hour12, minute);
  let h = c.hour12 % 12;
  if (c.period === "pm") h += 12;
  if (c.period === "am" && c.hour12 === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`;
}

function formatDisplay(hhmm: string): string {
  const { period, hour12, minute } = parseTime(hhmm);
  const label = period === "am" ? "오전" : "오후";
  return `${label} ${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function slotKey(period: Period, hour12: number): string {
  return `${period}-${hour12}`;
}

/**
 * 수업 시간 피커 — 오전 6시 ~ 오후 10시 · 5분 단위.
 * 06–11 → 오전, 12·01–10 → 오후 자동.
 */
export function ClassTimePicker({
  value,
  onChange,
  align = "left",
  className = "w-[132px] shrink-0",
}: {
  value: string;
  onChange: (next: string) => void;
  /** 드롭다운 정렬 — 오른쪽 끝 필드는 "right"로 잘림 방지 */
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const parsed = parseTime(value);
  const selectedKey = slotKey(parsed.period, parsed.hour12);

  const minuteOptions = useMemo(() => {
    return MINUTES_5.filter((m) => {
      const total = toMinutes(parsed.period, parsed.hour12, m);
      return total >= MIN_MINUTES && total <= MAX_MINUTES;
    }).map((m) => ({
      value: String(m),
      label: String(m).padStart(2, "0"),
    }));
  }, [parsed.period, parsed.hour12]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const t = window.setTimeout(
      () => document.addEventListener("mousedown", onDoc),
      0,
    );
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

  function commit(next: Partial<Parsed>) {
    const period = next.period ?? parsed.period;
    const hour12 = next.hour12 ?? parsed.hour12;
    const minute = next.minute ?? parsed.minute;
    onChange(toHhmm(period, hour12, minute));
  }

  /** 시 선택: 06–11 → 오전 / 12·01–10 → 오후 */
  function selectHourSlot(slot: HourSlot) {
    commit({ period: slot.period, hour12: slot.hour12 });
  }

  function selectPeriod(period: Period) {
    if (period === "am") {
      let hour12 = parsed.hour12;
      if (hour12 === 12 || hour12 <= 5) hour12 = 6;
      if (hour12 > 11) hour12 = 11;
      commit({ period: "am", hour12 });
      return;
    }
    let hour12 = parsed.hour12;
    if (hour12 >= 6 && hour12 <= 11 && parsed.period === "am") {
      hour12 = 1;
    }
    if (hour12 > 10 && hour12 !== 12) hour12 = 10;
    commit({ period: "pm", hour12 });
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex h-11 w-full items-center justify-between gap-1.5 rounded-[10px] border bg-white px-3 text-left text-[13px] font-semibold outline-none ${
          open
            ? "border-[#1AA7F2] ring-2 ring-[#1AA7F2]/20"
            : "border-[#E1E2E4] hover:border-[#1AA7F2]"
        }`}
      >
        <span className="truncate text-[#15171A]">{formatDisplay(value)}</span>
        <ClockIcon />
      </button>

      {open ? (
        <div
          className={`absolute top-[calc(100%+6px)] z-30 flex rounded-[14px] border border-[#E8E8EA] bg-white p-2 shadow-[0_8px_24px_rgba(21,23,26,0.12)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <WheelColumn
            ariaLabel="오전 오후"
            options={[
              { value: "am", label: "오전" },
              { value: "pm", label: "오후" },
            ]}
            selected={parsed.period}
            onSelect={(v) => selectPeriod(v as Period)}
          />
          <WheelColumn
            ariaLabel="시"
            options={HOUR_SLOTS.map((s) => ({
              value: s.key,
              label: s.label,
            }))}
            selected={selectedKey}
            onSelect={(key) => {
              const slot = HOUR_SLOTS.find((s) => s.key === key);
              if (slot) selectHourSlot(slot);
            }}
          />
          <WheelColumn
            ariaLabel="분"
            options={minuteOptions}
            selected={String(parsed.minute)}
            onSelect={(v) => commit({ minute: Number(v) })}
          />
        </div>
      ) : null}
    </div>
  );
}

function WheelColumn({
  ariaLabel,
  options,
  selected,
  onSelect,
}: {
  ariaLabel: string;
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-value="${selected}"]`,
    );
    el?.scrollIntoView({ block: "center" });
  }, [selected]);

  return (
    <div
      className="flex w-[64px] flex-col"
      role="listbox"
      aria-label={ariaLabel}
      id={listId}
    >
      <div
        ref={listRef}
        className="no-scrollbar flex max-h-[196px] flex-col gap-0.5 overflow-y-auto px-0.5 py-1"
      >
        {options.map((opt) => {
          const active = opt.value === selected;
          return (
            <button
              key={opt.value}
              type="button"
              role="option"
              data-value={opt.value}
              aria-selected={active}
              onClick={() => onSelect(opt.value)}
              className={`flex h-9 shrink-0 items-center justify-center rounded-[8px] text-[14px] font-semibold outline-none ${
                active
                  ? "bg-[#EEEEED] text-[#15171A] ring-1 ring-[#15171A]"
                  : "text-[#6B7280] hover:bg-[#F3F4F5]"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ClassTimeRangeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ClassTimeRange;
  onChange: (next: ClassTimeRange) => void;
}) {
  return (
    <div className="flex w-fit max-w-full flex-wrap items-center gap-2 rounded-[10px] bg-[#F8F8F7] px-3 py-2.5">
      <span className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-[#3D4148]">
        {label}
      </span>
      <ClassTimePicker
        value={value.start}
        onChange={(start) => onChange({ ...value, start })}
      />
      <span className="shrink-0 text-[#9CA3AF]">~</span>
      <ClassTimePicker
        value={value.end}
        onChange={(end) => onChange({ ...value, end })}
      />
    </div>
  );
}

function ClockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="shrink-0 text-[#9CA3AF]"
    >
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 5.5V8l2 1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
