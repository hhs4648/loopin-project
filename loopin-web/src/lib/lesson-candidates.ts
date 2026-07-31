import {
  DEFAULT_ACADEMIC_SCHEDULE,
  shouldSkipRecurringClass,
  type AcademicScheduleSettings,
} from "@/lib/calendar-academic-schedule";
import {
  addDays,
  hhmmToMinutes,
  resolveClassDayTime,
  weekdayFromDate,
} from "@/lib/calendar-layout";
import {
  toLocalIsoDate,
  type OneOffLesson,
} from "@/lib/calendar-one-off-lessons";
import {
  isDateInClassPeriods,
  type TeacherClass,
} from "@/lib/teacher-classes";

export type LessonCandidate = {
  key: string;
  classId: string;
  /** YYYY-MM-DD */
  date: string;
  start: string;
  end: string;
  oneOffLessonId?: string;
  name: string;
  colors: TeacherClass["colors"];
};

const DEFAULT_LOOKAHEAD_DAYS = 60;

/**
 * 선택한 반들의 다가오는 수업 후보.
 * 정규 수업은 학사 휴일·공휴일 규칙을 따르고, 일회성 수업은 휴일에도 포함.
 */
export function listLessonCandidates(options: {
  classes: TeacherClass[];
  classIds: string[];
  oneOffLessons?: OneOffLesson[];
  academicSchedule?: AcademicScheduleSettings;
  from?: Date;
  lookaheadDays?: number;
}): LessonCandidate[] {
  const {
    classes,
    classIds,
    oneOffLessons = [],
    academicSchedule = DEFAULT_ACADEMIC_SCHEDULE,
    from = new Date(),
    lookaheadDays = DEFAULT_LOOKAHEAD_DAYS,
  } = options;

  const selected = classes.filter((teacherClass) =>
    classIds.includes(teacherClass.id),
  );
  if (selected.length === 0) return [];

  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const fromMin = from.getHours() * 60 + from.getMinutes();
  const candidates: LessonCandidate[] = [];

  for (let i = 0; i <= lookaheadDays; i++) {
    const date = addDays(base, i);
    const dateKey = toLocalIsoDate(date);
    const weekday = weekdayFromDate(date);

    for (const teacherClass of selected) {
      if (
        teacherClass.days.includes(weekday) &&
        isDateInClassPeriods(teacherClass, date) &&
        !shouldSkipRecurringClass(date, academicSchedule)
      ) {
        const time = resolveClassDayTime(teacherClass, weekday);
        if (time) {
          const startMin = hhmmToMinutes(time.start);
          const endMin = hhmmToMinutes(time.end);
          if (
            Number.isFinite(startMin) &&
            Number.isFinite(endMin) &&
            endMin > startMin &&
            !(i === 0 && startMin < fromMin)
          ) {
            candidates.push({
              key: `recurring:${teacherClass.id}:${dateKey}:${time.start}`,
              classId: teacherClass.id,
              date: dateKey,
              start: time.start,
              end: time.end,
              name: teacherClass.name,
              colors: teacherClass.colors,
            });
          }
        }
      }
    }
  }

  for (const lesson of oneOffLessons) {
    if (!classIds.includes(lesson.classId)) continue;
    const teacherClass = selected.find((item) => item.id === lesson.classId);
    if (!teacherClass) continue;
    const date = new Date(
      Number(lesson.date.slice(0, 4)),
      Number(lesson.date.slice(5, 7)) - 1,
      Number(lesson.date.slice(8, 10)),
    );
    if (Number.isNaN(date.getTime())) continue;
    const startMin = hhmmToMinutes(lesson.start);
    const endMin = hhmmToMinutes(lesson.end);
    if (
      !Number.isFinite(startMin) ||
      !Number.isFinite(endMin) ||
      endMin <= startMin
    ) {
      continue;
    }
    const dayOffset = Math.round(
      (date.getTime() - base.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (dayOffset < 0 || dayOffset > lookaheadDays) continue;
    if (dayOffset === 0 && startMin < fromMin) continue;

    candidates.push({
      key: `one-off:${lesson.id}`,
      classId: teacherClass.id,
      date: lesson.date,
      start: lesson.start,
      end: lesson.end,
      oneOffLessonId: lesson.id,
      name: lesson.title?.trim() || teacherClass.name,
      colors: teacherClass.colors,
    });
  }

  return candidates.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    const startCmp = a.start.localeCompare(b.start);
    if (startCmp !== 0) return startCmp;
    return a.name.localeCompare(b.name, "ko");
  });
}

export function groupLessonCandidatesByDate(
  candidates: LessonCandidate[],
): Array<{ date: string; lessons: LessonCandidate[] }> {
  const map = new Map<string, LessonCandidate[]>();
  for (const lesson of candidates) {
    const list = map.get(lesson.date) ?? [];
    list.push(lesson);
    map.set(lesson.date, list);
  }
  return Array.from(map.entries()).map(([date, lessons]) => ({
    date,
    lessons,
  }));
}
