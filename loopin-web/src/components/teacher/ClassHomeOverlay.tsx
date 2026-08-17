"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import {
  DEFAULT_ACADEMIC_SCHEDULE,
  type AcademicScheduleSettings,
} from "@/lib/calendar-academic-schedule";
import {
  formatNextClassDate,
  getNextClassOccurrence,
} from "@/lib/calendar-layout";
import { classTabHref } from "@/lib/class-tabs";
import type { ClassStudent } from "@/lib/class-students";
import type { OneOffLesson } from "@/lib/calendar-one-off-lessons";
import {
  CLASS_COLOR_THEMES,
  formatClassOpeningDate,
  formatClassWeeklySchedule,
  type TeacherClass,
} from "@/lib/teacher-classes";
import {
  formatAssignmentSchedule,
  classHomeStudentStatusLabel,
  resolveClassHomeStudentStatus,
  type AssignedProblemView,
  type ClassHomeStudentStatus,
} from "@/lib/class-assignments";
import type { AttemptProgress } from "@/lib/sync/types";
import {
  problemSetItemCount,
  type SavedProblemSet,
} from "@/lib/problem-sets";
import {
  buildUnitPartProgress,
  continueUnitHref,
} from "@/lib/problem-set-parts";

/** SVG 히어로 카드 (담당 반 색으로 다시 칠함) */
const HERO = {
  left: 293.875,
  top: 134.074,
  width: 1207.12,
  height: 121.1,
  radius: 12.975,
  barWidth: 4.14071,
} as const;

/** 왼쪽 텍스트 블록 */
const CONTENT = {
  left: 320,
  labelTop: 150,
  titleTop: 168,
  todoTop: 214.629,
  todoLeft: 313.052,
  todoWidth: 429.744,
  todoHeight: 27.0312,
} as const;

/**
 * 히어로 우측 통계 듀오 — 수강 인원 | 미완료 과제.
 * 배경·숫자 모두 담당 반 색 계열로 통일.
 */
const STATS = {
  left: 1248,
  top: 158,
  width: 236,
  height: 78,
  colW: 108,
  gap: 14,
} as const;

/** SVG 과제 현황 카드 — 데모 제거 · 미부여 시 빈 상태 */
const ASSIGNMENT_CARD = {
  left: 294.416,
  top: 273.015,
  width: 595.78,
  height: 241.119,
  radius: 12.4344,
} as const;

/** SVG 학생 현황 카드 — 데모 4명 덮고 실데이터 */
const STUDENT_CARD = {
  left: 904.681,
  top: 273.015,
  width: 595.78,
  height: 241.119,
  radius: 12.4344,
  maxVisible: 4,
} as const;

/**
 * 「진행 중인 단원」 — 과제/학생 현황 카드(하단 514) 와 반 정보 헤더(639) 사이 빈 구간.
 * 파트로 나눈 단원의 다음 파트를 여기서 바로 부여한다.
 */
const UNIT_PROGRESS_CARD = {
  left: 294.375,
  top: 530,
  width: 1206.12,
  height: 100,
  radius: 12.4344,
} as const;

/** SVG 반 정보 — 네모칸(보더) 제거하고 실데이터 */
const CLASS_INFO = {
  left: 294.375,
  headerTop: 638.975,
  headerHeight: 43,
  bodyTop: 686.975,
  bodyHeight: 79,
  width: 1206.12,
  cols: [294.375, 595.656, 897.438, 1199.22, 1500.5] as const,
} as const;

const AVATAR_PALETTE = CLASS_COLOR_THEMES.map((t) => ({
  bg: t.calendar,
  fg: t.text,
}));

type ClassHomeOverlayProps = {
  studentCount: number;
  teacherClass: TeacherClass | null;
  students?: ClassStudent[];
  classId?: string;
  assignments?: AssignedProblemView[];
  /** 「진행 중인 단원」에서 아직 부여하지 않은 파트를 찾기 위해 전체 문제집이 필요하다 */
  problemSets?: SavedProblemSet[];
  attempts?: AttemptProgress[];
  incompleteAssignmentCount?: number;
  oneOffLessons?: OneOffLesson[];
  academicSchedule?: AcademicScheduleSettings;
  /** 다음 수업 「메모」= 캘린더 수업 메모 저장 */
  onUpdateNextLessonTitle?: (title: string) => void;
};

/**
 * 반 홈 개편안 보정:
 * - 히어로 배경·왼쪽 바·통계를 **담당 반 색**으로 통일
 * - 「N차시」개념 제거 → **다음 수업**(오늘 기준) 날짜·시간 표시
 * - **메모** = 캘린더 수업 메모와 동일 값 (정규 dayLessonMeta / 추가 OneOffLesson)
 * - **과제 현황**: SVG 데모 삭제 · 미부여 시 빈 상태 · 부여 시 수업일 ≫ 마감 표시
 * - **학생 현황**: 등록 학생 최대 4명 · 없으면 빈 상태 문구
 * - **반 정보**: 주간 시간표·개강일·학년·초대코드 네모칸
 */
export function ClassHomeOverlay({
  studentCount,
  teacherClass,
  students = [],
  classId,
  assignments = [],
  problemSets = [],
  attempts = [],
  incompleteAssignmentCount = 0,
  oneOffLessons = [],
  academicSchedule = DEFAULT_ACADEMIC_SCHEDULE,
  onUpdateNextLessonTitle,
}: ClassHomeOverlayProps) {
  const colors = teacherClass?.colors;
  const heroBg = colors?.calendar || "#F2FEE7";
  const barColor = colors?.bar || "#A4D24C";
  const accent = colors?.text || "#6AA912";
  const todoInputId = useId();

  const next = teacherClass
    ? getNextClassOccurrence(
        teacherClass,
        new Date(),
        oneOffLessons,
        academicSchedule,
      )
    : null;
  const savedTitle = next?.title ?? "";
  const [draftTitle, setDraftTitle] = useState(savedTitle);
  const [focused, setFocused] = useState(false);
  const [justApplied, setJustApplied] = useState(false);

  useEffect(() => {
    setDraftTitle(savedTitle);
  }, [savedTitle, next?.source, next?.oneOffLessonId, next?.weekday]);

  useEffect(() => {
    if (!justApplied) return;
    const timer = window.setTimeout(() => setJustApplied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [justApplied]);

  const trimmedDraft = draftTitle.trim();
  const isDirty = trimmedDraft !== savedTitle;
  const isApplied = Boolean(savedTitle) && !isDirty;

  const commitTitle = () => {
    if (!next || !onUpdateNextLessonTitle || !isDirty) return;
    onUpdateNextLessonTitle(trimmedDraft);
    setDraftTitle(trimmedDraft);
    setJustApplied(true);
  };

  const onTodoKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitTitle();
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      setDraftTitle(savedTitle);
      event.currentTarget.blur();
    }
  };

  const memoShellClass = (() => {
    if (!next) {
      return "border-[#E0DFDC] bg-white";
    }
    if (justApplied || isApplied) {
      return "border-transparent shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]";
    }
    if (isDirty || focused) {
      return "border-[#C9CCD2] bg-white ring-1 ring-[#1AA7F2]/25";
    }
    return "border-[#E0DFDC] bg-white";
  })();

  const memoShellStyle =
    next && (justApplied || isApplied)
      ? {
          backgroundColor: `${barColor}28`,
          boxShadow: `inset 0 0 0 1px ${barColor}`,
        }
      : undefined;

  const preview = students.slice(0, STUDENT_CARD.maxVisible);
  const studentsHref = classId ? classTabHref(classId, "students") : undefined;
  const assignmentsHref = classId
    ? classTabHref(classId, "assignments")
    : undefined;
  const assignmentPreview = assignments.slice(0, 3);

  const scheduleLabel = teacherClass
    ? formatClassWeeklySchedule(teacherClass)
    : "미설정";
  const openingLabel = teacherClass
    ? formatClassOpeningDate(teacherClass)
    : "미설정";
  const gradeLabel = teacherClass?.grade?.trim() || "미설정";
  const inviteCode = teacherClass?.inviteCode || "—";

  /** 파트가 1개 이상 부여됐고 아직 안 낸 파트가 남은 단원 */
  const unitProgress = useMemo(
    () =>
      classId
        ? buildUnitPartProgress(
            problemSets,
            assignments.map((view) => view.assignment),
            classId,
          )
        : [],
    [problemSets, assignments, classId],
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-[22]">
      {/* SVG 우상단 「N차시 진행중」 알약 가림 (차시 개념 제거) */}
      <div
        className="absolute bg-white"
        style={{ left: 1382, top: 58, width: 145, height: 55 }}
        aria-hidden
      />

      {/* 라운드 코너 밖으로 SVG 초록 바가 비치지 않도록 흰 스트립 */}
      <div
        className="absolute bg-white"
        style={{
          left: HERO.left,
          top: HERO.top,
          width: 8,
          height: HERO.height,
        }}
        aria-hidden
      />
      {/* 히어로 배경(반 색) + 왼쪽 바 — 라운드에 맞춰 바까지 클리핑 */}
      <div
        className="absolute overflow-hidden"
        style={{
          left: HERO.left,
          top: HERO.top,
          width: HERO.width,
          height: HERO.height,
          borderRadius: HERO.radius,
          backgroundColor: heroBg,
        }}
        aria-hidden
      >
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: HERO.barWidth + 1, backgroundColor: barColor }}
        />
      </div>

      {/* 왼쪽: 다음 수업 */}
      <span
        className="absolute font-bold"
        style={{
          left: CONTENT.left,
          top: CONTENT.labelTop,
          fontSize: 13,
          lineHeight: "16px",
          color: accent,
        }}
      >
        다음 수업
      </span>

      {next ? (
        <span
          className="absolute flex items-center gap-2"
          style={{ left: CONTENT.left, top: CONTENT.titleTop }}
        >
          {/* 캘린더 카드와 동일한 흰색 시간 칩 */}
          <span
            className="inline-flex items-center rounded-[6px] bg-white px-1.5 font-bold"
            style={{ fontSize: 12, lineHeight: "22px", color: accent }}
          >
            {formatTimeChip(next.start)}
          </span>
          <span
            className="font-bold"
            style={{
              fontSize: 22,
              lineHeight: "28px",
              letterSpacing: "-0.01em",
              color: accent,
            }}
          >
            {formatNextClassDate(next.date)}
          </span>
          <span
            className="font-semibold text-[#5B5B5B]"
            style={{ fontSize: 14, lineHeight: "28px" }}
          >
            {next.start}–{next.end}
          </span>
        </span>
      ) : (
        <span
          className="absolute font-bold text-[#16150F]"
          style={{
            left: CONTENT.left,
            top: CONTENT.titleTop,
            fontSize: 20,
            lineHeight: "28px",
          }}
        >
          예정된 수업이 없어요
        </span>
      )}

      {/* 메모 = 캘린더 수업 메모 공유 · 적용 버튼 + 저장 상태 */}
      <div
        className={`absolute flex items-center gap-1.5 rounded-[6px] border px-2.5 transition-[background-color,border-color,box-shadow] duration-200 ${
          next ? "pointer-events-auto" : "pointer-events-none"
        } ${memoShellClass}`}
        style={{
          left: CONTENT.todoLeft,
          top: CONTENT.todoTop,
          width: CONTENT.todoWidth,
          height: CONTENT.todoHeight,
          ...memoShellStyle,
        }}
      >
        <label
          htmlFor={todoInputId}
          className="shrink-0 text-[12px] font-medium"
          style={{ color: isApplied || justApplied ? accent : "#9A958E" }}
        >
          메모:
        </label>
        {next ? (
          <>
            <input
              id={todoInputId}
              value={draftTitle}
              maxLength={40}
              disabled={!onUpdateNextLessonTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={onTodoKeyDown}
              placeholder="아직 입력되지 않았어요"
              className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-[#3D4148] outline-none placeholder:font-normal placeholder:text-[#9A958E] disabled:cursor-default"
              style={
                isApplied || justApplied ? { color: accent, fontWeight: 600 } : undefined
              }
              aria-label="다음 수업 메모 (캘린더와 동일)"
            />
            {isDirty ? (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={commitTitle}
                className="shrink-0 rounded-[5px] px-2 py-0.5 text-[11px] font-bold text-white transition-colors hover:brightness-95"
                style={{ backgroundColor: accent }}
              >
                적용
              </button>
            ) : justApplied || isApplied ? (
              <span
                className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-bold"
                style={{ color: accent }}
                aria-live="polite"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path
                    d="M2.5 6.2 4.8 8.5 9.5 3.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {justApplied ? "적용됨" : "저장됨"}
              </span>
            ) : null}
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[12px] text-[#9A958E]">
            예정된 수업이 없어요
          </span>
        )}
      </div>

      {/* 오른쪽: 통계 (반 색 계열) */}
      <div
        className="absolute flex items-center rounded-[12px]"
        style={{
          left: STATS.left,
          top: STATS.top,
          width: STATS.width,
          height: STATS.height,
          backgroundColor: `${barColor}22`,
        }}
      >
        <StatCol
          value={studentCount}
          label="명 수강"
          width={STATS.colW}
          valueColor={accent}
        />
        <div
          className="shrink-0 self-center"
          style={{
            width: 1,
            height: 44,
            marginLeft: STATS.gap / 2,
            marginRight: STATS.gap / 2,
            backgroundColor: `${accent}40`,
          }}
          aria-hidden
        />
        <StatCol
          value={incompleteAssignmentCount}
          label="미완료 과제"
          width={STATS.colW}
          valueColor={accent}
        />
      </div>

      {/* 과제 현황 — SVG 데모 삭제 · 미부여 시 빈 상태 */}
      <div
        className="absolute flex flex-col overflow-hidden border border-[#E0E4EA] bg-white"
        style={{
          left: ASSIGNMENT_CARD.left,
          top: ASSIGNMENT_CARD.top,
          width: ASSIGNMENT_CARD.width,
          height: ASSIGNMENT_CARD.height,
          borderRadius: ASSIGNMENT_CARD.radius,
        }}
        aria-label="과제 현황"
      >
        <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-2">
          <h3 className="text-[16px] font-bold text-[#16150F]">과제 현황</h3>
          {assignmentsHref ? (
            <Link
              href={assignmentsHref}
              className="pointer-events-auto text-[13px] font-semibold text-[#9A958E] outline-none hover:text-[#5B5B5B] focus-visible:ring-2 focus-visible:ring-[#1AA7F2]"
            >
              전체 보기
            </Link>
          ) : (
            <span className="text-[13px] font-semibold text-[#9A958E]">
              전체 보기
            </span>
          )}
        </div>

        {assignmentPreview.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-4 text-center">
            <p className="text-[14px] font-bold text-[#16150F]">
              아직 부여한 과제가 없어요
            </p>
            <p className="mt-1.5 text-[12px] font-medium text-[#9A958E]">
              과제를 부여하면 진행 현황이 여기에 보여요
            </p>
          </div>
        ) : (
          <ul className="flex flex-1 flex-col px-4 pb-3">
            {assignmentPreview.map(({ assignment, problemSet }) => (
              <li
                key={assignment.id}
                className="flex min-h-[50px] items-center gap-3 border-b border-[#F0F0F0] last:border-b-0"
              >
                <span
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: barColor }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-[#16150F]">
                    {problemSet.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] font-medium text-[#9A958E]">
                    {formatAssignmentSchedule(assignment)}
                  </span>
                </span>
                <span
                  className="shrink-0 rounded-full px-2 py-1 text-[10px] font-bold"
                  style={{
                    backgroundColor: `${barColor}18`,
                    color: accent,
                  }}
                >
                  {problemSetItemCount(problemSet)}문제
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 학생 현황 — SVG 데모 목록 덮고 실제 학생 표시 */}
      <div
        className="absolute flex flex-col overflow-hidden border border-[#E0E4EA] bg-white"
        style={{
          left: STUDENT_CARD.left,
          top: STUDENT_CARD.top,
          width: STUDENT_CARD.width,
          height: STUDENT_CARD.height,
          borderRadius: STUDENT_CARD.radius,
        }}
        aria-label="학생 현황"
      >
        <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-2">
          <h3 className="text-[16px] font-bold text-[#16150F]">학생 현황</h3>
          {studentsHref ? (
            <Link
              href={studentsHref}
              className="pointer-events-auto text-[13px] font-semibold text-[#9A958E] outline-none hover:text-[#5B5B5B] focus-visible:ring-2 focus-visible:ring-[#1AA7F2]"
            >
              전체 보기
            </Link>
          ) : (
            <span className="text-[13px] font-semibold text-[#9A958E]">
              전체 보기
            </span>
          )}
        </div>

        {preview.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-4 text-center">
            <p className="text-[14px] font-bold text-[#16150F]">
              아직 등록된 학생이 없어요
            </p>
            <p className="mt-1.5 text-[12px] font-medium text-[#9A958E]">
              학생 탭에서 등록하면 여기에 보여요
            </p>
          </div>
        ) : (
          <ul className="flex flex-1 flex-col px-4 pb-3">
            {preview.map((s, i) => {
              const tone = AVATAR_PALETTE[i % AVATAR_PALETTE.length]!;
              const status = resolveClassHomeStudentStatus(
                s.id,
                assignments,
                attempts,
              );
              const badge = homeStudentStatusBadge(status, accent, barColor);
              return (
                <li
                  key={s.id}
                  className="flex h-[46px] items-center gap-2.5 border-b border-[#F0F0F0] last:border-b-0"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
                    style={{ backgroundColor: tone.bg, color: tone.fg }}
                    aria-hidden
                  >
                    {s.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-[#16150F]">
                    {s.name}
                  </span>
                  <span
                    className="shrink-0 rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold"
                    style={{
                      borderColor: badge.border,
                      color: badge.color,
                      backgroundColor: badge.bg,
                    }}
                  >
                    {classHomeStudentStatusLabel(status)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 진행 중인 단원 — 파트로 나눈 단원의 다음 파트를 여기서 바로 부여 */}
      {unitProgress.length > 0 ? (
        <div
          className="pointer-events-auto absolute flex flex-col overflow-hidden border border-[#E0E4EA] bg-white"
          style={{
            left: UNIT_PROGRESS_CARD.left,
            top: UNIT_PROGRESS_CARD.top,
            width: UNIT_PROGRESS_CARD.width,
            height: UNIT_PROGRESS_CARD.height,
            borderRadius: UNIT_PROGRESS_CARD.radius,
          }}
          aria-label="진행 중인 단원"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 pb-1.5">
            <h3 className="shrink-0 text-[15px] font-bold text-[#16150F]">
              진행 중인 단원
            </h3>
            <span className="min-w-0 truncate text-[11px] font-medium text-[#9A958E]">
              이어서 내면 다음 파트가 미리 골라져요
            </span>
          </div>
          <ul className="flex flex-1 flex-col gap-1 overflow-y-auto px-5 pb-3">
            {unitProgress.map((unit) => (
              <li
                key={unit.unitKey}
                className="flex min-h-[36px] shrink-0 items-center gap-2.5"
              >
                <span
                  className="h-6 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: barColor }}
                  aria-hidden
                />
                <span className="max-w-[260px] shrink-0 truncate text-[13px] font-bold text-[#16150F]">
                  {unit.unitTitle}
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  {unit.categories.map((category) => (
                    <span
                      key={category.category}
                      className="flex h-7 shrink-0 items-center gap-1.5 rounded-[8px] border border-[#E0E4EA] bg-[#F7F8FA] px-2.5 text-[11px] font-semibold text-[#5B5B5B]"
                    >
                      {category.label}
                      <span
                        className="font-bold"
                        style={{
                          color:
                            category.nextIndex === null ? "#1B7A45" : accent,
                        }}
                      >
                        {category.doneIndices.length} / {category.total}
                      </span>
                      {category.nextIndex === null ? (
                        <span className="font-medium text-[#1B7A45]">완료</span>
                      ) : (
                        <span className="font-medium text-[#9A958E]">
                          다음 {category.nextIndex}파트
                        </span>
                      )}
                    </span>
                  ))}
                </span>
                <Link
                  href={continueUnitHref(unit, classId ?? "")}
                  className="flex h-7 shrink-0 items-center rounded-[8px] border border-[#BAE6FD] bg-[#F0F9FF] px-2.5 text-[11px] font-bold text-[#1274A9] outline-none transition-colors hover:border-[#1AA7F2] hover:bg-[#E0F2FE] focus-visible:ring-2 focus-visible:ring-[#1AA7F2]"
                >
                  이어서 내기 →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 반 정보 — SVG 네모칸 가리고 보더 없이 실데이터 */}
      <div
        className="absolute bg-white"
        style={{
          left: CLASS_INFO.left,
          top: CLASS_INFO.headerTop,
          width: CLASS_INFO.width,
          height: CLASS_INFO.headerHeight + 5 + CLASS_INFO.bodyHeight,
        }}
        aria-label="반 정보"
      >
        <div
          className="flex items-center"
          style={{ height: CLASS_INFO.headerHeight, paddingInline: 8 }}
        >
          <h3 className="text-[16px] font-bold text-[#16150F]">반 정보</h3>
        </div>

        <div
          className="flex"
          style={{ height: CLASS_INFO.bodyHeight, gap: 10 }}
        >
          <InfoCell
            label="주간 시간표"
            value={scheduleLabel}
            flex={2.4}
            clamp
          />
          <InfoCell label="개강일" value={openingLabel} flex={1.2} />
          <InfoCell label="학년" value={gradeLabel} flex={0.6} />
          <div
            className="flex min-w-0 flex-col justify-center rounded-[10px] border border-[#E0E4EA] bg-white px-4"
            style={{ flex: "1.1 1 0" }}
          >
            <span className="text-[12px] font-medium text-[#9A958E]">
              초대 코드
            </span>
            <div className="mt-1 flex items-center gap-2">
              <span className="truncate text-[15px] font-bold text-[#16150F]">
                {inviteCode}
              </span>
              <button
                type="button"
                className="pointer-events-auto shrink-0 rounded-[6px] border border-[#E0E4EA] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#6B6B6B] outline-none hover:bg-[#F7F7F7] focus-visible:ring-2 focus-visible:ring-[#1AA7F2]"
                onClick={() => {
                  void navigator.clipboard?.writeText(inviteCode);
                }}
              >
                복사
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCell({
  label,
  value,
  flex,
  clamp = false,
}: {
  label: string;
  value: string;
  flex: number;
  clamp?: boolean;
}) {
  return (
    <div
      className="flex min-w-0 flex-col justify-center rounded-[10px] border border-[#E0E4EA] bg-white px-4"
      style={{ flex: `${flex} 1 0` }}
    >
      <span className="text-[12px] font-medium text-[#9A958E]">{label}</span>
      <span
        className={`mt-1 text-[15px] font-bold text-[#16150F] ${
          clamp ? "line-clamp-2 leading-[19px]" : "truncate"
        }`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/** "오전 9:00" — 캘린더 이벤트 카드와 동일한 시간 칩 포맷 */
function formatTimeChip(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${am ? "오전" : "오후"} ${h12}:${String(m).padStart(2, "0")}`;
}

function homeStudentStatusBadge(
  status: ClassHomeStudentStatus,
  accent: string,
  barColor: string,
): { color: string; border: string; bg: string } {
  switch (status) {
    case "completed":
      return { color: "#059669", border: "#A7F3D0", bg: "#ECFDF5" };
    case "in_progress":
      return { color: "#D97706", border: "#FDE68A", bg: "#FFFBEB" };
    case "missing":
      return { color: "#DC2626", border: "#FECACA", bg: "#FEF2F2" };
    case "none":
      return { color: "#9A958E", border: "#E5E2DC", bg: "#F7F6F3" };
    default:
      return {
        color: accent,
        border: `${accent}55`,
        bg: `${barColor}18`,
      };
  }
}

function StatCol({
  value,
  label,
  width,
  valueColor,
}: {
  value: number;
  label: string;
  width: number;
  valueColor: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ width }}
      aria-label={`${value} ${label}`}
    >
      <span
        className="font-bold tabular-nums"
        style={{
          fontSize: 34,
          lineHeight: "38px",
          letterSpacing: "-0.02em",
          color: valueColor,
        }}
      >
        {value}
      </span>
      <span
        className="font-medium"
        style={{ fontSize: 13, lineHeight: "18px", marginTop: 4, color: "#7C7C7C" }}
      >
        {label}
      </span>
    </div>
  );
}
