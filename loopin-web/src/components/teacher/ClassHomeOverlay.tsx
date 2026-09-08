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
  classGradeLabel,
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
  continueUnitHref,
  visibleUnitPartProgress,
} from "@/lib/problem-set-parts";
import { dismissUnitProgress } from "@/lib/unit-progress-dismiss";
import { CopyToast, copyToClipboard } from "@/components/teacher/CopyToast";

/** 다음 수업 카드 — `assets/next-class-card.svg` */
const NEXT_CARD = {
  left: 293.875,
  top: 134.074,
  width: 1207.12,
  height: 132,
  radius: 14,
  /** 카드 왼쪽 세로 줄 — 라운드에 맞춰 잘림 */
  barWidth: 6,
} as const;

/** 다음 수업 카드 색 — 반 팔레트(`calendar`/`bar`/`text`)에서 만든다 */
function nextCardTheme(colors?: TeacherClass["colors"]) {
  const bar = colors?.bar || "#A4D24C";
  const text = colors?.text || "#6AA912";
  const calendar = colors?.calendar || "#F2FEE7";
  return {
    bg: calendar,
    title: text,
    ink: text,
    chipBorder: mixHex(calendar, bar, 0.35),
    chipText: text,
    boxBorder: mixHex("#FFFFFF", bar, 0.14),
    muted: "#8A8FA8",
    bar,
    button: bar,
    statsBg: mixHex(calendar, bar, 0.22),
    statsNum: text,
    statsLabel: mixHex("#8A8FA8", text, 0.35),
    statsLine: mixHex(calendar, bar, 0.45),
  };
}

function mixHex(from: string, to: string, amount: number): string {
  const a = parseHexRgb(from);
  const b = parseHexRgb(to);
  if (!a || !b) return from;
  const mix = (x: number, y: number) => Math.round(x + (y - x) * amount);
  return `#${[mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`;
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return null;
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
  };
}

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
 * - 히어로 = **다음 수업 카드**(`next-class-card.svg` 레이아웃 · **색은 반 팔레트**)
 *   왼쪽 시간 칩·날짜·메모 · **가운데 초대 코드 흰 카드** · 오른쪽 수강/미완료
 * - 「N차시」개념 제거 → **다음 수업**(오늘 기준) 날짜·시간 표시
 * - **메모** = 캘린더 수업 메모와 동일 값 (정규 dayLessonMeta / 추가 OneOffLesson)
 * - **과제 현황**: SVG 데모 삭제 · 미부여 시 빈 상태 · 부여 시 수업일 ≫ 마감 표시
 * - **학생 현황**: 등록 학생 최대 4명 · 없으면 빈 상태 문구
 * - **반 정보**: 주간 시간표·개강일·학년
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
  const barColor = colors?.bar || "#A4D24C";
  const accent = colors?.text || "#6AA912";
  const cardTheme = nextCardTheme(colors);
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
  const [copyToastTick, setCopyToastTick] = useState(0);
  const [progressTick, setProgressTick] = useState(0);

  useEffect(() => {
    setDraftTitle(savedTitle);
  }, [savedTitle, next?.source, next?.oneOffLessonId, next?.weekday]);

  useEffect(() => {
    if (!justApplied) return;
    const timer = window.setTimeout(() => setJustApplied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [justApplied]);

  useEffect(() => {
    if (!copyToastTick) return;
    const timer = window.setTimeout(() => setCopyToastTick(0), 2000);
    return () => window.clearTimeout(timer);
  }, [copyToastTick]);

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

  const memoTinted = Boolean(next && (justApplied || isApplied));
  const memoShellClass = !next
    ? "border bg-white"
    : memoTinted
      ? "border-transparent"
      : "border bg-white";
  const memoShellStyle = memoTinted
    ? {
        backgroundColor: `${cardTheme.bar}18`,
        boxShadow: `inset 0 0 0 1px ${cardTheme.bar}`,
      }
    : {
        borderColor: cardTheme.boxBorder,
        ...(isDirty || focused
          ? { boxShadow: `0 0 0 1px ${cardTheme.bar}55` }
          : {}),
      };

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
  const gradeLabel = classGradeLabel(teacherClass?.grade);
  const inviteCode = teacherClass?.inviteCode || "—";

  /** 파트가 1개 이상 부여됐고 아직 안 낸 파트가 남은 단원 */
  const unitProgress = useMemo(
    () =>
      classId
        ? visibleUnitPartProgress(
            problemSets,
            assignments.map((view) => view.assignment),
            classId,
          )
        : [],
    [problemSets, assignments, classId, progressTick],
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-[22]">
      {/* SVG 우상단 「N차시 진행중」 알약 가림 (차시 개념 제거) */}
      <div
        className="absolute bg-white"
        style={{ left: 1382, top: 58, width: 145, height: 55 }}
        aria-hidden
      />

      {/*
        class-home.svg 히어로(연두 배경 + 반 색 세로 바 4px)가
        다음 수업 카드 라운드 밖으로 비치지 않게 먼저 가린다.
      */}
      <div
        className="absolute bg-white"
        style={{
          left: NEXT_CARD.left,
          top: NEXT_CARD.top,
          width: NEXT_CARD.width,
          height: NEXT_CARD.height,
        }}
        aria-hidden
      />

      {/* 다음 수업 카드 — 가운데가 초대 코드 (`next-class-card.svg`) */}
      <div
        className="pointer-events-none absolute flex items-center gap-4 overflow-hidden px-6"
        style={{
          left: NEXT_CARD.left,
          top: NEXT_CARD.top,
          width: NEXT_CARD.width,
          height: NEXT_CARD.height,
          borderRadius: NEXT_CARD.radius,
          backgroundColor: cardTheme.bg,
        }}
        aria-label="다음 수업"
      >
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: NEXT_CARD.barWidth,
            backgroundColor: barColor,
          }}
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 py-1.5">
          <span
            className="text-[15px] font-bold leading-none"
            style={{ color: cardTheme.title }}
          >
            다음 수업
          </span>
          {next ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span
                className="inline-flex h-[27px] items-center rounded-[8px] border bg-white px-2.5 text-[13px] font-bold"
                style={{
                  borderColor: cardTheme.chipBorder,
                  color: cardTheme.chipText,
                }}
              >
                {formatTimeChip(next.start)}
              </span>
              <span
                className="text-[22px] font-bold leading-none tracking-[-0.01em]"
                style={{ color: cardTheme.ink }}
              >
                {formatNextClassDate(next.date)}
              </span>
              <span
                className="text-[14px] font-semibold leading-none"
                style={{ color: cardTheme.muted }}
              >
                {next.start}–{next.end}
              </span>
            </div>
          ) : (
            <span
              className="text-[16px] font-bold"
              style={{ color: cardTheme.ink }}
            >
              예정된 수업이 없어요
            </span>
          )}
          <div
            className={`flex h-[33px] max-w-[430px] items-center gap-1.5 rounded-[8px] border px-2.5 transition-[background-color,border-color,box-shadow] duration-200 ${
              next ? "pointer-events-auto" : "pointer-events-none"
            } ${memoShellClass}`}
            style={memoShellStyle}
          >
            <label
              htmlFor={todoInputId}
              className="shrink-0 text-[12px] font-medium"
              style={{
                color: memoTinted ? cardTheme.chipText : cardTheme.muted,
              }}
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
                  className="min-w-0 flex-1 bg-transparent text-[12px] font-medium outline-none placeholder:font-normal placeholder:text-[#A0A5BD] disabled:cursor-default"
                  style={{
                    color: memoTinted
                      ? cardTheme.chipText
                      : cardTheme.ink,
                    fontWeight: memoTinted ? 600 : 500,
                  }}
                  aria-label="다음 수업 메모 (캘린더와 동일)"
                />
                {isDirty ? (
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={commitTitle}
                    className="shrink-0 rounded-[8px] px-2 py-0.5 text-[11px] font-bold text-white outline-none transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-black/20"
                    style={{ backgroundColor: cardTheme.button }}
                  >
                    적용
                  </button>
                ) : justApplied || isApplied ? (
                  <span
                    className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-bold"
                    style={{ color: cardTheme.chipText }}
                    aria-live="polite"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      aria-hidden
                    >
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
              <span
                className="min-w-0 flex-1 truncate text-[12px]"
                style={{ color: cardTheme.muted }}
              >
                예정된 수업이 없어요
              </span>
            )}
          </div>
        </div>

        <div
          data-guide="invite-code"
          className="flex h-[88px] w-[224px] shrink-0 items-center gap-2.5 rounded-[12px] bg-white px-3"
        >
          <span
            className="h-[52px] w-[4px] shrink-0 rounded-full"
            style={{ backgroundColor: cardTheme.bar }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p
              className="text-[12px] font-semibold leading-none"
              style={{ color: cardTheme.muted }}
            >
              초대 코드
            </p>
            <p
              className="mt-1.5 truncate text-[22px] font-bold leading-none tracking-[0.04em]"
              style={{ color: cardTheme.ink }}
            >
              {inviteCode}
            </p>
          </div>
          <button
            type="button"
            className="pointer-events-auto flex h-[34px] shrink-0 items-center rounded-[10px] px-2.5 text-[12px] font-bold text-white outline-none transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-black/20"
            style={{ backgroundColor: cardTheme.button }}
            onClick={() => {
              const code = teacherClass?.inviteCode;
              if (!code) return;
              void copyToClipboard(code).then((ok) => {
                if (ok) setCopyToastTick((tick) => tick + 1);
              });
            }}
          >
            복사
          </button>
        </div>

        <div
          className="flex h-[88px] w-[207px] shrink-0 items-center rounded-[12px] px-2"
          style={{ backgroundColor: cardTheme.statsBg }}
        >
          <NextCardStat
            value={studentCount}
            label="명 수강"
            valueColor={cardTheme.statsNum}
            labelColor={cardTheme.statsLabel}
          />
          <div
            className="mx-1 h-[42px] w-px shrink-0"
            style={{ backgroundColor: cardTheme.statsLine }}
            aria-hidden
          />
          <NextCardStat
            value={incompleteAssignmentCount}
            label="미완료 과제"
            valueColor={cardTheme.statsNum}
            labelColor={cardTheme.statsLabel}
          />
        </div>
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
              나눠 낸 단원은 여기서 이어서 내요
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
                <button
                  type="button"
                  aria-label={`${unit.unitTitle} 이어서 내기 삭제`}
                  title="이어서 내기 목록에서 빼요. 같은 단원을 다시 나눠 내면 다시 보여요."
                  onClick={() => {
                    if (!classId) return;
                    dismissUnitProgress(classId, unit.unitKey);
                    setProgressTick((tick) => tick + 1);
                  }}
                  className="flex h-7 shrink-0 items-center rounded-[8px] border border-[#E0E4EA] bg-white px-2.5 text-[11px] font-semibold text-[#6B6B6B] outline-none transition-colors hover:border-[#C9CCD2] hover:bg-[#F7F7F7] focus-visible:ring-2 focus-visible:ring-[#1AA7F2]"
                >
                  삭제
                </button>
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
          <InfoCell label="학년" value={gradeLabel} flex={1} />
        </div>
      </div>

      <CopyToast visible={copyToastTick > 0} />
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

function NextCardStat({
  value,
  label,
  valueColor,
  labelColor,
}: {
  value: number;
  label: string;
  valueColor: string;
  labelColor: string;
}) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center"
      aria-label={`${value} ${label}`}
    >
      <span
        className="text-[28px] font-bold leading-none tabular-nums"
        style={{ color: valueColor }}
      >
        {value}
      </span>
      <span
        className="mt-1.5 text-[12px] font-medium leading-none"
        style={{ color: labelColor }}
      >
        {label}
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

