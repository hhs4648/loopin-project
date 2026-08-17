"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  SIDEBAR_GROUP_CARD_CLASS,
  sidebarIconClass,
  sidebarNavItemClass,
} from "@/components/teacher/SidebarSurface";
import {
  PROBLEMS_VIEWS,
  type ProblemsView,
} from "@/lib/problem-routes";
import {
  type TeacherClass,
  classIdsEqual,
} from "@/lib/teacher-classes";

const GRADE_KEYS = ["중1", "중2", "중3"] as const;
type GradeKey = (typeof GRADE_KEYS)[number];

const OPEN_GRADES_STORAGE_KEY = "loopin-sidebar-open-grades";

type OpenGradesState = Record<GradeKey, boolean>;

/** 기본값: 전부 접힘 (사용자가 연 것만 유지) */
const DEFAULT_OPEN_GRADES: OpenGradesState = {
  중1: false,
  중2: false,
  중3: false,
};

function loadOpenGrades(): OpenGradesState {
  if (typeof window === "undefined") return { ...DEFAULT_OPEN_GRADES };
  try {
    const raw = window.localStorage.getItem(OPEN_GRADES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_OPEN_GRADES };
    const parsed = JSON.parse(raw) as Partial<Record<string, boolean>>;
    return {
      중1: Boolean(parsed.중1),
      중2: Boolean(parsed.중2),
      중3: Boolean(parsed.중3),
    };
  } catch {
    return { ...DEFAULT_OPEN_GRADES };
  }
}

function saveOpenGrades(state: OpenGradesState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OPEN_GRADES_STORAGE_KEY, JSON.stringify(state));
}

type AssignedClassesPanelProps = {
  classes: TeacherClass[];
  onAddClass: () => void;
  activeClassId?: string;
  /** 문제 관리 화면 — submit 기본 · saved 사용자 지정 과제 */
  problemsView?: ProblemsView | null;
};

/**
 * SVG 데모 담당 반을 가리고 동적 목록을 표시.
 * uiux.md: 모든 교사 화면 동일 · 메뉴 글자 bold · 반 클릭 시 항상 홈
 * · 반 없는 학년 숨김 · 학년 토글 열림/닫힘 localStorage 유지
 */
export function AssignedClassesPanel({
  classes,
  onAddClass,
  activeClassId,
  problemsView = null,
}: AssignedClassesPanelProps) {
  const [openGrades, setOpenGrades] = useState<OpenGradesState>(DEFAULT_OPEN_GRADES);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOpenGrades(loadOpenGrades());
    setHydrated(true);
  }, []);

  const groupedClasses = useMemo(
    () => ({
      중1: classes.filter((item) => item.grade === "중1"),
      중2: classes.filter((item) => item.grade === "중2"),
      중3: classes.filter((item) => item.grade === "중3"),
    }),
    [classes]
  );

  const visibleGrades = useMemo(
    () => GRADE_KEYS.filter((grade) => groupedClasses[grade].length > 0),
    [groupedClasses]
  );

  const toggleGrade = (grade: GradeKey) => {
    setOpenGrades((prev) => {
      const next = { ...prev, [grade]: !prev[grade] };
      saveOpenGrades(next);
      return next;
    });
  };

  return (
    <div
      className="absolute z-[16] flex flex-col overflow-y-auto"
      style={{
        left: 0,
        top: 200,
        width: 238.93,
        maxHeight: 600,
        backgroundColor: "#F8F8F7",
        padding: "0 16px 8px",
      }}
    >
      <p className="mb-1.5 px-2 text-[11px] font-bold tracking-[0.08em] text-[#15171A]">
        문제 관리
      </p>
      <div className={`${SIDEBAR_GROUP_CARD_CLASS} flex flex-col gap-0.5`}>
        {PROBLEMS_VIEWS.map((item) => {
          const active = problemsView === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`box-border h-10 w-full overflow-hidden ${sidebarNavItemClass(active)}`}
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {item.id === "submit" ? (
                <SendIcon active={active} />
              ) : (
                <FolderIcon active={active} />
              )}
              {item.label}
            </Link>
          );
        })}
      </div>

      <p className="mb-1.5 mt-5 px-2 text-[11px] font-bold tracking-[0.08em] text-[#15171A]">
        담당 반
      </p>

      {visibleGrades.length > 0 ? (
        <div className={SIDEBAR_GROUP_CARD_CLASS}>
          {visibleGrades.map((grade, gradeIndex) => {
            const items = groupedClasses[grade];
            /* hydration 전엔 접힌 상태로 그려 flash 방지 */
            const open = hydrated && Boolean(openGrades[grade]);
            return (
              <div key={grade}>
                {gradeIndex > 0 ? (
                  <div className="mx-2 my-1 h-px bg-[#F2F0EB]" aria-hidden />
                ) : null}
                <button
                  type="button"
                  onClick={() => toggleGrade(grade)}
                  aria-expanded={open}
                  className="group flex h-10 w-full cursor-pointer items-center justify-between rounded-[10px] px-2.5 text-left outline-none transition-all duration-150 hover:bg-[#F5F4F0] active:scale-[0.98] focus:outline-none focus-visible:outline-none"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-[#4A4843] transition-colors group-hover:text-[#15171A]">
                      {grade}
                    </span>
                    <span className="min-w-[18px] rounded-full bg-[#F0EEE9] px-1.5 py-[1px] text-center text-[11px] font-semibold leading-[16px] text-[#8A867D]">
                      {items.length}
                    </span>
                  </span>
                  <ChevronIcon open={open} />
                </button>

                {open ? (
                  <ul className="flex flex-col gap-0.5 pb-1">
                    {items.map((item) => {
                      const active = classIdsEqual(item.id, activeClassId);
                      const href = `/teacher/classes/${item.id}`;
                      return (
                        <li key={item.id}>
                          <Link
                            href={href}
                            className={`flex h-9 items-center gap-2.5 rounded-[10px] py-1 pl-7 pr-2.5 text-[13.5px] outline-none transition-all duration-150 active:scale-[0.98] focus:outline-none focus-visible:outline-none ${
                              active
                                ? "bg-[#EAF6FE] font-bold text-[#127DB8]"
                                : "font-medium text-[#5C594F] hover:bg-[#F5F4F0] hover:text-[#15171A]"
                            }`}
                            style={{ WebkitTapHighlightColor: "transparent" }}
                          >
                            <span
                              className="shrink-0 rounded-full"
                              style={{
                                width: 8,
                                height: 8,
                                backgroundColor: item.color,
                                boxShadow: `0 0 0 3px ${item.color}22`,
                              }}
                              aria-hidden
                            />
                            <span className="truncate">{item.name}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onAddClass}
        className="mt-2 flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-[#DBD8D1] text-[13px] font-semibold text-[#15171A] outline-none transition-all duration-150 hover:-translate-y-[1px] hover:border-[#1AA7F2] hover:bg-[#F0F9FE] hover:text-[#1AA7F2] hover:shadow-[0_3px_10px_rgba(26,167,242,0.10)] active:translate-y-0 active:scale-[0.98] focus:outline-none focus-visible:outline-none"
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center text-[15px] font-semibold leading-none"
          aria-hidden
        >
          +
        </span>
        새 반 추가
      </button>
    </div>
  );
}

function SendIcon({ active }: { active?: boolean }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={`shrink-0 transition-colors ${sidebarIconClass(active)}`}
    >
      <path
        d="M17 3 9.5 10.5M17 3l-4.8 14-2.7-6.5L3 7.8 17 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderIcon({ active }: { active?: boolean }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={`shrink-0 transition-colors ${sidebarIconClass(active)}`}
    >
      <path
        d="M2.75 5.5A1.75 1.75 0 0 1 4.5 3.75h3.2c.47 0 .92.19 1.24.53l1.06 1.1c.33.34.78.53 1.25.53h4.25c.97 0 1.75.78 1.75 1.75v6.59a1.75 1.75 0 0 1-1.75 1.75H4.5a1.75 1.75 0 0 1-1.75-1.75V5.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      className={`shrink-0 text-[#B5B1A8] transition-transform ${
        open ? "rotate-180" : ""
      }`}
    >
      <path
        d="M3.5 5.25 7 8.75l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
