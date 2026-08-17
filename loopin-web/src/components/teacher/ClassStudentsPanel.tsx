"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { CLASS_LAYOUT } from "@/lib/class-layout";
import type { ClassStudent } from "@/lib/class-students";
import type { StudentProgressRow } from "@/lib/sync/types";
import { AlertCircleGlyph } from "@/components/teacher/AlertBadgeIcon";

type ClassStudentsPanelProps = {
  students: ClassStudent[];
  progressRows?: StudentProgressRow[];
  onRemove: (id: string) => void;
  onUpdateMemo: (id: string, memo: string) => void;
  onUpdateName: (id: string, name: string) => void;
};

type StudentFilter = "all" | "completed" | "inProgress" | "idle";
type StudentSort = "recent" | "streak" | "name";

/** 헤더·행 공통 열 폭 — 위아래 정렬을 위해 동일 값 사용 */
const COL = {
  name: "w-[168px]",
  status: "w-[84px]",
  avgAccuracy: "w-[72px]",
  firstAttempt: "w-[64px]",
  latestAttempt: "w-[64px]",
  submit: "w-[56px]",
  streak: "w-[64px]",
  last: "w-[96px]",
  manage: "w-[44px]",
} as const;

function progressForStudent(
  rows: StudentProgressRow[],
  studentId: string,
): StudentProgressRow | undefined {
  return rows.find((r) => r.studentId === studentId);
}

/**
 * 학생 관리 탭 — 가입·진도 데이터가 있으면 실제 상태로 표시.
 */
export function ClassStudentsPanel({
  students,
  progressRows = [],
  onRemove,
  onUpdateMemo,
  onUpdateName,
}: ClassStudentsPanelProps) {
  const left = CLASS_LAYOUT.contentLeft;
  const width = CLASS_LAYOUT.contentRight - left;
  const [filter, setFilter] = useState<StudentFilter>("all");
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const skipNameBlurSave = useRef(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<StudentSort>("recent");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  function openStudentMenu(studentId: string, button: HTMLButtonElement) {
    if (menuOpenId === studentId) {
      setMenuOpenId(null);
      setMenuPos(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    const menuWidth = 120;
    const menuHeight = 84;
    const gap = 4;
    const left = Math.min(
      Math.max(8, rect.right - menuWidth),
      window.innerWidth - menuWidth - 8,
    );
    const openUp = rect.bottom + gap + menuHeight > window.innerHeight - 8;
    const top = openUp
      ? Math.max(8, rect.top - gap - menuHeight)
      : rect.bottom + gap;
    setMenuPos({ top, left });
    setMenuOpenId(studentId);
  }

  function startRename(student: ClassStudent) {
    skipNameBlurSave.current = false;
    setMenuOpenId(null);
    setMenuPos(null);
    setEditingNameId(student.id);
    setNameDraft(student.name);
  }

  function cancelRename() {
    skipNameBlurSave.current = true;
    setEditingNameId(null);
    setNameDraft("");
  }

  function saveRename(studentId: string) {
    const next = nameDraft.trim();
    if (!next) return;
    skipNameBlurSave.current = true;
    onUpdateName(studentId, next);
    setEditingNameId(null);
    setNameDraft("");
  }

  useEffect(() => {
    if (!menuOpenId) return;
    const closeMenu = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-student-menu]")
      ) {
        return;
      }
      setMenuOpenId(null);
      setMenuPos(null);
    };
    const closeOnScroll = () => {
      setMenuOpenId(null);
      setMenuPos(null);
    };
    window.addEventListener("mousedown", closeMenu);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnScroll);
    return () => {
      window.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnScroll);
    };
  }, [menuOpenId]);

  const enriched = useMemo(() => {
    return students.map((student) => {
      const progress = progressForStudent(progressRows, student.id);
      return {
        student,
        progress: progress ?? {
          studentId: student.id,
          studentName: student.name,
          status: "idle" as const,
          progressPercent: 0,
          latestAccuracy: null,
          averageAccuracy: null,
          firstScore: null,
          latestScore: null,
          submittedAt: null,
          lastLearnedAt: null,
          studyStreakDays: 0,
        },
      };
    });
  }, [students, progressRows]);

  const counts = useMemo(() => {
    const completed = enriched.filter((e) => e.progress.status === "completed").length;
    const inProgress = enriched.filter(
      (e) => e.progress.status === "in_progress",
    ).length;
    const idle = enriched.filter((e) => e.progress.status === "idle").length;
    const scores = enriched
      .map((e) => e.progress.latestScore)
      .filter((s): s is number => s != null);
    const avg =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;
    return { completed, inProgress, idle, avg };
  }, [enriched]);

  const visibleStudents = useMemo(() => {
    let items = enriched;
    if (filter === "completed") {
      items = items.filter((e) => e.progress.status === "completed");
    } else if (filter === "inProgress") {
      items = items.filter((e) => e.progress.status === "in_progress");
    } else if (filter === "idle") {
      items = items.filter((e) => e.progress.status === "idle");
    }
    const q = query.trim();
    if (q) items = items.filter((e) => e.student.name.includes(q));
    if (sort === "name") {
      return [...items].sort((a, b) =>
        a.student.name.localeCompare(b.student.name, "ko"),
      );
    }
    if (sort === "streak") {
      return [...items].sort((a, b) => {
        const diff =
          (b.progress.studyStreakDays ?? 0) - (a.progress.studyStreakDays ?? 0);
        if (diff !== 0) return diff;
        return a.student.name.localeCompare(b.student.name, "ko");
      });
    }
    return [...items].sort((a, b) => {
      const at = a.progress.lastLearnedAt ?? a.student.createdAt;
      const bt = b.progress.lastLearnedAt ?? b.student.createdAt;
      return bt.localeCompare(at);
    });
  }, [enriched, filter, query, sort]);

  const filterChips: {
    id: StudentFilter;
    label: string;
    count: number;
    dot?: string;
  }[] = [
    { id: "all", label: "전체", count: students.length },
    { id: "completed", label: "완료", count: counts.completed, dot: "#10B981" },
    {
      id: "inProgress",
      label: "진행중",
      count: counts.inProgress,
      dot: "#F59E0B",
    },
    { id: "idle", label: "미학습", count: counts.idle, dot: "#EF4444" },
  ];

  return (
    <section
      className="no-scrollbar absolute z-[22] overflow-y-auto bg-white px-1 pb-8"
      style={{
        left,
        top: 133,
        width,
        height: 973 - 149,
      }}
      aria-label="학생 관리"
    >
      <header className="flex items-start justify-between gap-4 py-5">
        <div>
          <h2 className="text-[22px] font-bold text-[#15171A]">학생 관리</h2>
          <p className="mt-1 text-[13px] text-[#9CA3AF]">
            반 학생들의 학습 현황을 확인하고 관리할 수 있습니다.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-5 gap-3">
        <StatCard
          iconBg="#E7F5FE"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1AA7F2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9.5" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16.5 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
          label="전체 학생"
          value={`${students.length}명`}
          valueClass="text-[#15171A]"
          detail="이번 반 학생 수"
        />
        <StatCard
          iconBg="#F1E7FE"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6D28D9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 19V9M10 19V5M16 19v-7M22 19V3" />
            </svg>
          }
          label="평균 점수"
          value={counts.avg != null ? `${counts.avg}점` : "—"}
          valueClass="text-[#6D28D9]"
          detail="최근 완료 시도 기준"
        />
        <StatCard
          iconBg="#E8F8EF"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 22c5 0 8-3 8-9V5l-8-3-8 3v8c0 6 3 9 8 9Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          }
          label="완료"
          value={`${counts.completed}명`}
          valueClass="text-[#10B981]"
          detail="마지막 학습 완료 기준"
        />
        <StatCard
          iconBg="#FEF9E7"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
          }
          label="진행중"
          value={`${counts.inProgress}명`}
          valueClass="text-[#D97706]"
          detail="학습을 시작한 학생"
        />
        <StatCard
          iconBg="#FEE7E7"
          icon={<AlertCircleGlyph size={18} color="#C52B2B" />}
          label="미학습"
          value={`${counts.idle}명`}
          valueClass="text-[#C52B2B]"
          detail={
            students.length > 0
              ? `${Math.round((counts.idle / students.length) * 100)}%`
              : "—"
          }
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          {filterChips.map((chip) => {
            const active = chip.id === filter;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilter(chip.id)}
                className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-bold outline-none transition-colors focus:outline-none focus-visible:outline-none ${
                  active
                    ? "bg-[#E7F5FE] text-[#1274A9]"
                    : "text-[#6B7280] hover:bg-[#F3F4F6]"
                }`}
              >
                {chip.dot ? (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: chip.dot }}
                    aria-hidden
                  />
                ) : null}
                {chip.label} ({chip.count})
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex h-10 w-[200px] items-center gap-2 rounded-[10px] border border-[#E5E7EB] bg-white px-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="학생 이름 검색"
              aria-label="학생 이름 검색"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[#15171A] outline-none placeholder:text-[#B0B4BB]"
            />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </div>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as StudentSort)}
            aria-label="학생 정렬"
            className="h-10 cursor-pointer rounded-[10px] border border-[#E5E7EB] bg-white px-3.5 text-[13px] font-medium text-[#6B7280] outline-none focus:border-[#1AA7F2]"
          >
            <option value="recent">정렬: 최근 학습순</option>
            <option value="streak">정렬: 연속 학습순</option>
            <option value="name">정렬: 이름순</option>
          </select>
        </div>
      </div>

      <div className="mt-4 rounded-[14px] border border-[#EDEFF2] bg-white">
        <div className="flex h-12 items-center gap-3 border-b border-[#EDEFF2] px-5 text-[12px] font-semibold text-[#9CA3AF]">
          <span className={`${COL.name} shrink-0`}>이름</span>
          <span className={`${COL.status} shrink-0`}>학습 현황</span>
          <span
            className={`${COL.avgAccuracy} shrink-0 text-center`}
            title="과제마다 마지막 시도 점수만 모아 평균 (중간 재도전 제외)"
          >
            평균 정답률
          </span>
          <span
            className={`${COL.firstAttempt} shrink-0 text-center`}
            title="가장 먼저 완료한 시도의 정답률"
          >
            첫 시도
          </span>
          <span
            className={`${COL.latestAttempt} shrink-0 text-center`}
            title="가장 최근 완료(또는 진행) 시도의 정답률"
          >
            최근 시도
          </span>
          <span className={`${COL.submit} shrink-0 text-center`}>제출률</span>
          <span
            className={`${COL.streak} shrink-0 text-center`}
            title="오늘 또는 어제까지 이어진 학습 활동 연속 일수"
          >
            연속 학습
          </span>
          <span className={`${COL.last} shrink-0 text-center`}>마지막 학습</span>
          <span className="min-w-0 flex-1">메모</span>
          <span className={`${COL.manage} shrink-0 text-right`}>관리</span>
        </div>

        {visibleStudents.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center">
            <p className="text-[14px] font-bold text-[#15171A]">
              {students.length === 0
                ? "아직 등록된 학생이 없어요"
                : "조건에 맞는 학생이 없어요"}
            </p>
            <p className="mt-1.5 text-[12px] text-[#9CA3AF]">
              {students.length === 0
                ? "학생이 가입하면 이곳에 표시돼요"
                : "필터나 검색어를 바꿔 보세요"}
            </p>
          </div>
        ) : (
          <ul>
            {visibleStudents.map((item) => {
              const { student, progress } = item;
              const statusLabel =
                progress.status === "completed"
                  ? "완료"
                  : progress.status === "in_progress"
                    ? "진행중"
                    : "미학습";
              const statusClass =
                progress.status === "completed"
                  ? "bg-[#E8F8EF] text-[#047857]"
                  : progress.status === "in_progress"
                    ? "bg-[#FEF9E7] text-[#B45309]"
                    : "bg-[#FEE7E7] text-[#C52B2B]";
              const statusDot =
                progress.status === "completed"
                  ? "#10B981"
                  : progress.status === "in_progress"
                    ? "#F59E0B"
                    : "#EF4444";
              const lastAt = progress.lastLearnedAt
                ? new Date(progress.lastLearnedAt)
                : null;
              const lastLabel =
                lastAt && !Number.isNaN(lastAt.getTime())
                  ? `${lastAt.getMonth() + 1}/${lastAt.getDate()} ${String(lastAt.getHours()).padStart(2, "0")}:${String(lastAt.getMinutes()).padStart(2, "0")}`
                  : null;
              const streakDays = progress.studyStreakDays ?? 0;
              const streakLabel = streakDays > 0 ? `${streakDays}일` : "—";
              return (
                <li
                  key={student.id}
                  className="relative flex h-16 items-center gap-3 border-b border-[#F3F4F6] px-5 last:border-b-0"
                >
                  <span
                    className={`flex ${COL.name} shrink-0 items-center`}
                  >
                    {editingNameId === student.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={nameDraft}
                        maxLength={20}
                        onChange={(event) => setNameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            saveRename(student.id);
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelRename();
                          }
                        }}
                        onBlur={() => {
                          if (skipNameBlurSave.current) {
                            skipNameBlurSave.current = false;
                            return;
                          }
                          if (nameDraft.trim()) saveRename(student.id);
                          else cancelRename();
                        }}
                        aria-label={`${student.name} 이름 수정`}
                        className="h-8 min-w-0 flex-1 rounded-[8px] border border-[#1AA7F2] bg-white px-2 text-[13px] font-bold text-[#15171A] outline-none ring-1 ring-[#1AA7F2]"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startRename(student)}
                        title="이름 수정"
                        className="group flex min-w-0 flex-1 items-center gap-1 rounded-[8px] px-1 py-0.5 text-left outline-none transition-colors hover:bg-[#F3F4F6] focus:outline-none focus-visible:bg-[#F3F4F6]"
                      >
                        <span className="truncate text-[14px] font-bold text-[#15171A]">
                          {student.name}
                        </span>
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="shrink-0 text-[#C3C7CD] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                          aria-hidden
                        >
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          <path d="m15 5 4 4" />
                        </svg>
                      </button>
                    )}
                  </span>
                  <span
                    className={`flex ${COL.status} shrink-0 items-center`}
                  >
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass}`}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: statusDot }}
                        aria-hidden
                      />
                      {statusLabel}
                    </span>
                  </span>
                  <span
                    className={`flex ${COL.avgAccuracy} shrink-0 items-center justify-center text-[13px] font-medium ${
                      progress.averageAccuracy != null
                        ? "text-[#6B7280]"
                        : "text-[#C3C7CD]"
                    }`}
                  >
                    {progress.averageAccuracy != null
                      ? `${Math.round(progress.averageAccuracy)}%`
                      : "—"}
                  </span>
                  <span
                    className={`flex ${COL.firstAttempt} shrink-0 items-center justify-center text-[13px] font-medium ${
                      progress.firstScore != null
                        ? "text-[#6B7280]"
                        : "text-[#C3C7CD]"
                    }`}
                  >
                    {progress.firstScore != null
                      ? `${Math.round(progress.firstScore)}%`
                      : "—"}
                  </span>
                  <span
                    className={`flex ${COL.latestAttempt} shrink-0 items-center justify-center text-[13px] font-medium ${
                      progress.latestScore != null
                        ? "text-[#6B7280]"
                        : "text-[#C3C7CD]"
                    }`}
                  >
                    {progress.latestScore != null
                      ? `${Math.round(progress.latestScore)}%`
                      : "—"}
                  </span>
                  <span
                    className={`flex ${COL.submit} shrink-0 items-center justify-center text-[13px] font-medium text-[#6B7280]`}
                  >
                    {progress.progressPercent}%
                  </span>
                  <span
                    className={`flex ${COL.streak} shrink-0 items-center justify-center text-[13px] font-medium ${
                      streakDays > 0 ? "text-[#6B7280]" : "text-[#C3C7CD]"
                    }`}
                    title={
                      streakDays > 0
                        ? `${streakDays}일 연속 학습`
                        : "연속 학습 없음"
                    }
                  >
                    {streakLabel}
                  </span>
                  <span
                    className={`flex ${COL.last} shrink-0 flex-col items-center justify-center leading-tight`}
                  >
                    {lastLabel ? (
                      <>
                        <span className="block text-[13px] font-medium text-[#6B7280]">
                          {lastLabel}
                        </span>
                        <span className="block text-[11px] text-[#B0B4BB]">
                          최근 학습
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="block text-[13px] font-medium text-[#C3C7CD]">
                          -
                        </span>
                        <span className="block text-[11px] text-[#B0B4BB]">
                          학습 기록 없음
                        </span>
                      </>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 items-center">
                    <input
                      type="text"
                      value={student.memo ?? ""}
                      maxLength={50}
                      onChange={(event) =>
                        onUpdateMemo(student.id, event.target.value)
                      }
                      placeholder="메모 입력"
                      aria-label={`${student.name} 메모`}
                      className="h-9 w-full rounded-[10px] border border-transparent bg-transparent px-2 text-[13px] text-[#4B5563] outline-none placeholder:text-[#C3C7CD] hover:border-[#E5E7EB] focus:border-[#1AA7F2] focus:bg-white"
                    />
                  </span>
                  <span
                    className={`flex ${COL.manage} shrink-0 items-center justify-end`}
                  >
                    <button
                      type="button"
                      data-student-menu
                      aria-label={`${student.name} 관리`}
                      aria-expanded={menuOpenId === student.id}
                      onClick={(event) =>
                        openStudentMenu(student.id, event.currentTarget)
                      }
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-[8px] text-[#9CA3AF] outline-none transition-colors hover:bg-[#F3F4F6] hover:text-[#4B5563] focus:outline-none focus-visible:outline-none"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <circle cx="12" cy="5" r="1.7" />
                        <circle cx="12" cy="12" r="1.7" />
                        <circle cx="12" cy="19" r="1.7" />
                      </svg>
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {menuOpenId && menuPos ? (
        <div
          data-student-menu
          className="fixed z-[90] w-[120px] overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          <button
            type="button"
            onClick={() => {
              const target = students.find((s) => s.id === menuOpenId);
              if (target) startRename(target);
            }}
            className="w-full cursor-pointer px-3.5 py-2.5 text-left text-[13px] font-semibold text-[#3D4148] hover:bg-[#F3F4F6]"
          >
            이름 수정
          </button>
          <button
            type="button"
            onClick={() => {
              const id = menuOpenId;
              setMenuOpenId(null);
              setMenuPos(null);
              onRemove(id);
            }}
            className="w-full cursor-pointer px-3.5 py-2.5 text-left text-[13px] font-semibold text-[#C52B2B] hover:bg-[#FEF2F2]"
          >
            학생 삭제
          </button>
        </div>
      ) : null}
    </section>
  );
}

function StatCard({
  iconBg,
  icon,
  label,
  value,
  valueClass,
  detail,
}: {
  iconBg: string;
  icon: ReactNode;
  label: string;
  value: string;
  valueClass: string;
  detail: string;
}) {
  return (
    <article className="flex min-w-0 items-center gap-3 rounded-[16px] border border-[#EDEFF2] bg-white px-4 py-4">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        style={{ background: iconBg }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium text-[#9CA3AF]">
          {label}
        </span>
        <span
          className={`mt-0.5 block text-[22px] font-bold leading-none ${valueClass}`}
        >
          {value}
        </span>
        <span className="mt-1 block truncate text-[11px] text-[#B0B4BB]">
          {detail}
        </span>
      </span>
    </article>
  );
}
