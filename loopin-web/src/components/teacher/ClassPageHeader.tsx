"use client";

import type { TeacherClass } from "@/lib/teacher-classes";
import { WEEKDAYS } from "@/lib/teacher-classes";
import { CLASS_LAYOUT } from "@/lib/class-layout";

type ClassPageHeaderProps = {
  teacherClass: TeacherClass | null;
  studentCount?: number;
};

/**
 * 반 이름·색·메타 — 전 탭 동일 위치 (CLASS_LAYOUT.contentLeft).
 */
export function ClassPageHeader({
  teacherClass,
  studentCount = 0,
}: ClassPageHeaderProps) {
  const name = teacherClass?.name?.trim() || "";
  const color =
    teacherClass?.colors?.class || teacherClass?.color || "#A4D24C";
  const meta = teacherClass
    ? formatClassMeta(teacherClass, studentCount)
    : "";

  return (
    <div
      className="absolute z-30 flex items-center gap-3"
      style={{
        left: CLASS_LAYOUT.contentLeft,
        top: CLASS_LAYOUT.headerTop,
        width: 560,
        height: CLASS_LAYOUT.headerHeight,
        backgroundColor: "#FFFFFF",
        paddingTop: 2,
        paddingBottom: 2,
      }}
    >
      <span
        className="shrink-0 rounded-[9.24px]"
        style={{
          width: 30.275,
          height: 30.275,
          backgroundColor: color,
        }}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <span
          className="truncate text-[18px] font-bold text-[#15171A]"
          style={{ lineHeight: "22px" }}
          title={name || undefined}
        >
          {name || "반"}
        </span>
        {meta ? (
          <span
            className="truncate text-[12px] font-medium text-[#9CA3AF]"
            style={{ lineHeight: "16px" }}
            title={meta}
          >
            {meta}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function formatClassMeta(c: TeacherClass, studentCount: number): string {
  const parts: string[] = [];
  if (c.grade) parts.push(c.grade);
  parts.push(`학생 ${studentCount}명`);

  const dayLabels = c.days
    .map((d) => WEEKDAYS.find((w) => w.id === d)?.label)
    .filter(Boolean);
  if (c.scheduleMode === "unified" && c.unifiedTime) {
    const t = `${c.unifiedTime.start}–${c.unifiedTime.end}`;
    parts.push(dayLabels.length ? `${dayLabels.join("·")} ${t}` : t);
  } else if (dayLabels.length) {
    parts.push(dayLabels.join("·"));
  } else {
    parts.push("시간 미정");
  }

  return parts.join(" · ");
}
