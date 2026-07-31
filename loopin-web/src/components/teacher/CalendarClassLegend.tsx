"use client";

import { CAL_PERIOD_NAV_LAYOUT } from "@/components/teacher/CalendarPeriodNav";
import type { TeacherClass } from "@/lib/teacher-classes";
import { CAL_GRID } from "@/lib/calendar-layout";

/**
 * 생성된 담당 반만 색점+이름으로 **오른쪽 정렬** · 한 줄.
 * SVG 데모 범례(구 위치 y≈172)까지 흰 덮개로 가림.
 */
const LEGEND = {
  left: CAL_PERIOD_NAV_LAYOUT.left + CAL_PERIOD_NAV_LAYOUT.width + 16,
  top: CAL_PERIOD_NAV_LAYOUT.top,
  right: CAL_GRID.right,
  /** 네비 행 + 아래 SVG 데모 범례 구간까지 */
  height: CAL_GRID.weekdayBarTop - CAL_PERIOD_NAV_LAYOUT.top,
} as const;

type CalendarClassLegendProps = {
  classes: TeacherClass[];
};

export function CalendarClassLegend({ classes }: CalendarClassLegendProps) {
  const width = Math.max(0, LEGEND.right - LEGEND.left);

  return (
    <div
      className="pointer-events-none absolute z-[28] overflow-hidden bg-white"
      style={{
        left: LEGEND.left,
        top: LEGEND.top,
        width,
        height: LEGEND.height,
        paddingRight: 4,
      }}
      aria-label="담당 반 색 범례"
    >
      {classes.length === 0 ? null : (
        <ul
          className="flex max-w-full flex-nowrap items-center justify-end gap-x-3"
          style={{ height: CAL_PERIOD_NAV_LAYOUT.height }}
        >
          {classes.map((c) => {
            const color = c.colors?.class || c.color || "#A4D24C";
            return (
              <li
                key={c.id}
                className="flex min-w-0 max-w-[140px] shrink items-center gap-1.5"
              >
                <span
                  className="h-[10.5px] w-[10.5px] shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span
                  className="truncate text-[12px] font-bold text-[#15171A]"
                  style={{ lineHeight: "16px" }}
                  title={c.name}
                >
                  {c.name}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
