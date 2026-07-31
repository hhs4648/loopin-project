"use client";

export type CalendarViewMode = "week" | "month";

type CalendarViewToggleProps = {
  mode: CalendarViewMode;
  onChange: (mode: CalendarViewMode) => void;
};

/** SVG 주간/월간 토글 — 라벨 「주간」「월간」 */
const TOGGLE = {
  left: 1126,
  top: 43,
  width: 128,
  height: 40,
} as const;

export function CalendarViewToggle({ mode, onChange }: CalendarViewToggleProps) {
  return (
    <div
      className="absolute z-30 flex items-center rounded-full bg-[#E5E5E5] p-1"
      style={{
        left: TOGGLE.left,
        top: TOGGLE.top,
        width: TOGGLE.width,
        height: TOGGLE.height,
      }}
      role="tablist"
      aria-label="캘린더 보기"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "week"}
        onClick={() => onChange("week")}
        className={`h-full flex-1 rounded-full text-[13px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-[#1AA7F2] ${
          mode === "week"
            ? "bg-white text-[#15171A] shadow-sm"
            : "bg-transparent text-[#6B7280]"
        }`}
      >
        주간
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "month"}
        onClick={() => onChange("month")}
        className={`h-full flex-1 rounded-full text-[13px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-[#1AA7F2] ${
          mode === "month"
            ? "bg-white text-[#15171A] shadow-sm"
            : "bg-transparent text-[#6B7280]"
        }`}
      >
        월간
      </button>
    </div>
  );
}
