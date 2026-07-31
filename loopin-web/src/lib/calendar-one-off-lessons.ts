import { parseIsoDateLocal, type TeacherClass } from "@/lib/teacher-classes";

export type OneOffLesson = {
  id: string;
  classId: string;
  /** YYYY-MM-DD */
  date: string;
  start: string;
  end: string;
  /** 비워두면 선택한 반 이름으로 표시 · 홈 「메모」와 공유 */
  title?: string;
  note?: string;
  createdAt: string;
};

const STORAGE_KEY = "loopin-calendar-one-off-lessons";

export function loadOneOffLessons(): OneOffLesson[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) || "[]",
    ) as OneOffLesson[];
    return Array.isArray(parsed)
      ? parsed.filter(
          (lesson) =>
            lesson &&
            typeof lesson.id === "string" &&
            typeof lesson.classId === "string" &&
            typeof lesson.date === "string" &&
            typeof lesson.start === "string" &&
            typeof lesson.end === "string",
        )
      : [];
  } catch {
    return [];
  }
}

export function saveOneOffLessons(lessons: OneOffLesson[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lessons));
}

export function createOneOffLessonId(): string {
  return `lesson-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function oneOffLessonsForDate(
  lessons: OneOffLesson[],
  date: Date,
): OneOffLesson[] {
  const dateKey = toLocalIsoDate(date);
  return lessons
    .filter((lesson) => lesson.date === dateKey)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function removeLessonsForClass(
  lessons: OneOffLesson[],
  classId: string,
): OneOffLesson[] {
  return lessons.filter((lesson) => lesson.classId !== classId);
}

export function getOneOffLessonClass(
  lesson: OneOffLesson,
  classes: TeacherClass[],
): TeacherClass | undefined {
  return classes.find((teacherClass) => teacherClass.id === lesson.classId);
}

export function isOneOffLessonInRange(
  lesson: OneOffLesson,
  start: Date,
  end: Date,
): boolean {
  const date = parseIsoDateLocal(lesson.date);
  if (!date) return false;
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}
