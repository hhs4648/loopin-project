import {
  getNextClassOccurrence,
  hhmmToMinutes,
} from "@/lib/calendar-layout";
import {
  loadOneOffLessons,
  toLocalIsoDate,
} from "@/lib/calendar-one-off-lessons";
import { loadAcademicSchedule } from "@/lib/calendar-academic-schedule";
import type { TeacherClass } from "@/lib/teacher-classes";

/**
 * **빠른 제출** — 날짜를 고르는 화면을 거치지 않고 지금 바로 내는 계획.
 *
 * 「오늘 배운 걸 지금 내주고, 다음 수업 전까지 풀어 와」가 가장 흔한 출제다.
 * 그 한 가지만 자동으로 채운다.
 *
 * - **수업일 = 오늘**, **공개 = 지금**. 보통은 수업이 끝난 뒤에 공개하지만
 *   (`assignment-open-at.ts`), 빠른 제출은 「지금 내주는 것」이라 바로 연다.
 * - **마감 = 다음 수업 시작 1분 전.** 다음 수업을 **내일부터** 찾는다 —
 *   오늘 수업을 기준으로 낸 과제의 마감이 몇 시간 뒤가 되면 안 된다
 *   (과제 부여 화면의 「다음 수업 전까지」와 같은 규칙).
 * - 다음 수업을 못 찾으면 **계획을 세우지 않는다.** 마감을 지어내는 것보다
 *   날짜를 직접 고르게 하는 편이 낫다.
 */
export type QuickAssignPlan = {
  classId: string;
  className: string;
  /** YYYY-MM-DD · 오늘 */
  lessonDate: string;
  deadlineDate: string;
  /** HH:MM */
  deadlineTime: string;
  /** 마감 기준이 된 다음 수업 시작 */
  nextClassDate: string;
  nextClassStart: string;
};

function formatHhmm(minutes: number): string {
  const m = Math.max(0, minutes);
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** 수업 시작 1분 전. 시작 시각을 모르면 그 전날 23:59 */
function oneMinuteBefore(
  classDate: Date,
  startHhmm: string,
): { date: Date; time: string } {
  const startMin = hhmmToMinutes(startHhmm);
  if (!Number.isFinite(startMin) || startMin <= 0) {
    const prev = new Date(classDate);
    prev.setDate(prev.getDate() - 1);
    return { date: prev, time: "23:59" };
  }
  return { date: classDate, time: formatHhmm(startMin - 1) };
}

export function planQuickAssign(
  teacherClass: TeacherClass,
  now: Date,
): QuickAssignPlan | null {
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  const next = getNextClassOccurrence(
    teacherClass,
    tomorrow,
    loadOneOffLessons(),
    loadAcademicSchedule(),
  );
  if (!next) return null;

  const { date, time } = oneMinuteBefore(next.date, next.start);
  return {
    classId: teacherClass.id,
    className: teacherClass.name,
    lessonDate: toLocalIsoDate(now),
    deadlineDate: toLocalIsoDate(date),
    deadlineTime: time,
    nextClassDate: toLocalIsoDate(next.date),
    nextClassStart: next.start,
  };
}

/** 「9월 7일 (월) 08:59」 */
export function formatDeadlineKo(plan: QuickAssignPlan): string {
  const [y, m, d] = plan.deadlineDate.split("-").map(Number);
  if (!y || !m || !d) return `${plan.deadlineDate} ${plan.deadlineTime}`;
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][
    new Date(y, m - 1, d).getDay()
  ];
  return `${m}월 ${d}일 (${weekday}) ${plan.deadlineTime}`;
}
