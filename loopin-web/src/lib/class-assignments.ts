import {
  classIdsEqual,
  parseIsoDateLocal,
} from "@/lib/teacher-classes";
import type { SavedProblemSet } from "@/lib/problem-sets";
import type { AttemptProgress } from "@/lib/sync/types";

const STORAGE_KEY = "loopin-class-assignments";

export type ClassAssignment = {
  id: string;
  problemSetId: string;
  classId: string;
  /** YYYY-MM-DD · 선택한 수업 날짜 */
  lessonDate: string;
  /** YYYY-MM-DD · 마감 날짜(수업 날짜 이후로 자유롭게 지정 가능) */
  deadlineDate: string;
  /** HH:MM · 마감 날짜의 마감 시간 */
  deadlineTime: string;
  /** true면 "다음 수업 전까지"로 지정된 마감 — deadlineDate/deadlineTime은 다음 수업 시작 시각으로 계산된 값 */
  deadlineUntilNextLesson?: boolean;
  assignedAt: string;
};

export type AssignedProblemView = {
  assignment: ClassAssignment;
  problemSet: SavedProblemSet;
};

export type CreateClassAssignmentInput = Omit<
  ClassAssignment,
  "id" | "assignedAt"
>;

export function createClassAssignmentId(): string {
  return `assignment-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

/** 구버전 저장 데이터(deadlineDate 없음)를 lessonDate 기준으로 보정 */
function normalizeAssignment(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const item = value as Record<string, unknown>;
  if (typeof item.deadlineDate === "string") return item;
  return { ...item, deadlineDate: item.lessonDate };
}

export function loadClassAssignments(): ClassAssignment[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) || "[]",
    ) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeAssignment).filter(isClassAssignment);
  } catch {
    return [];
  }
}

export function saveClassAssignments(assignments: ClassAssignment[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
  window.dispatchEvent(new Event("loopin-class-assignments-changed"));
}

export function createClassAssignment(
  input: CreateClassAssignmentInput,
): ClassAssignment {
  return {
    ...input,
    id: createClassAssignmentId(),
    assignedAt: new Date().toISOString(),
  };
}

/**
 * 같은 문제 세트의 기존 부여를 선택 반 기준으로 교체한 뒤 저장.
 * 선택하지 않은 반의 기존 부여는 유지한다.
 */
export function upsertAssignmentsForProblemSet(
  problemSetId: string,
  nextForSelectedClasses: CreateClassAssignmentInput[],
): ClassAssignment[] {
  const previous = loadClassAssignments();
  const selectedClassIds = new Set(
    nextForSelectedClasses.map((item) => item.classId),
  );
  const kept = previous.filter(
    (item) =>
      item.problemSetId !== problemSetId ||
      !selectedClassIds.has(item.classId),
  );
  const created = nextForSelectedClasses.map(createClassAssignment);
  const next = [...kept, ...created].sort((a, b) =>
    b.assignedAt.localeCompare(a.assignedAt),
  );
  saveClassAssignments(next);
  return next;
}

export function removeAssignmentsForProblemSet(
  assignments: ClassAssignment[],
  problemSetId: string,
): ClassAssignment[] {
  return assignments.filter((item) => item.problemSetId !== problemSetId);
}

/** 반에 부여한 과제 하나만 취소(해당 반의 부여 기록만 제거 · 문제 세트 자체는 유지). */
export function removeAssignmentById(
  assignments: ClassAssignment[],
  assignmentId: string,
): ClassAssignment[] {
  return assignments.filter((item) => item.id !== assignmentId);
}

export function getAssignmentsForClass(
  assignments: ClassAssignment[],
  classId: string,
): ClassAssignment[] {
  return assignments
    .filter((item) => classIdsEqual(item.classId, classId))
    .sort((a, b) => {
      /* 최근 부여한 과제가 위로 */
      const assignedCmp = b.assignedAt.localeCompare(a.assignedAt);
      if (assignedCmp !== 0) return assignedCmp;
      return b.lessonDate.localeCompare(a.lessonDate);
    });
}

export function getAssignedProblemsForClass(
  problemSets: SavedProblemSet[],
  assignments: ClassAssignment[],
  classId: string,
): AssignedProblemView[] {
  const byId = new Map(problemSets.map((set) => [set.id, set]));
  return getAssignmentsForClass(assignments, classId).flatMap((assignment) => {
    const problemSet = byId.get(assignment.problemSetId);
    return problemSet ? [{ assignment, problemSet }] : [];
  });
}

export function formatLessonDateKo(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  return `${Number(match[2])}월 ${Number(match[3])}일`;
}

export function formatAssignmentSchedule(assignment: ClassAssignment): string {
  const start = formatLessonDateKo(assignment.lessonDate);
  if (assignment.deadlineUntilNextLesson) {
    return `${start} ≫ ${formatLessonDateKo(assignment.deadlineDate)} · 다음 수업 전까지`;
  }
  if (assignment.deadlineDate !== assignment.lessonDate) {
    return `${start} ≫ ${formatLessonDateKo(assignment.deadlineDate)} ${assignment.deadlineTime}`;
  }
  return `${start} ≫ ${assignment.deadlineTime}`;
}

/** 과제 헤더 배지용 — 수업일 ≫ 마감일(또는 당일 마감 시간) */
export function formatAssignmentPeriod(assignment: ClassAssignment): string {
  const start = formatLessonDateKo(assignment.lessonDate);
  if (
    assignment.deadlineUntilNextLesson ||
    assignment.deadlineDate !== assignment.lessonDate
  ) {
    return `${start} ≫ ${formatLessonDateKo(assignment.deadlineDate)}`;
  }
  return `${start} ≫ ${assignment.deadlineTime}`;
}

function isClassAssignment(value: unknown): value is ClassAssignment {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ClassAssignment>;
  return (
    typeof item.id === "string" &&
    typeof item.problemSetId === "string" &&
    typeof item.classId === "string" &&
    typeof item.lessonDate === "string" &&
    typeof item.deadlineDate === "string" &&
    typeof item.deadlineTime === "string" &&
    typeof item.assignedAt === "string"
  );
}

/** 홈 「학생 현황」 배지 */
export type ClassHomeStudentStatus =
  | "completed"
  | "in_progress"
  | "missing"
  | "none";

/** 마감 시각(로컬). 파싱 실패 시 null */
export function assignmentDeadlineAt(
  assignment: Pick<ClassAssignment, "deadlineDate" | "deadlineTime">,
): Date | null {
  const day = parseIsoDateLocal(assignment.deadlineDate);
  if (!day) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(assignment.deadlineTime.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    hours,
    minutes,
    0,
    0,
  );
}

export function isAssignmentCompletedByStudent(
  assignmentId: string,
  studentId: string,
  attempts: AttemptProgress[],
): boolean {
  return attempts.some(
    (attempt) =>
      attempt.assignmentId === assignmentId &&
      attempt.studentId === studentId &&
      attempt.status === "completed",
  );
}

/**
 * 홈 학생 현황 상태:
 * - 완료: 부여된 과제를 모두 완료
 * - 진행중: 미완료 과제가 있고, 그 마감이 아직 안 지남
 * - 미학습: 미완료 과제 중 마감이 지난 것이 있음
 * - none: 부여된 과제 없음
 */
export function resolveClassHomeStudentStatus(
  studentId: string,
  assignments: Array<ClassAssignment | AssignedProblemView>,
  attempts: AttemptProgress[],
  now: Date = new Date(),
): ClassHomeStudentStatus {
  const list = assignments.map((item) =>
    "assignment" in item ? item.assignment : item,
  );
  if (list.length === 0) return "none";

  const incomplete = list.filter(
    (assignment) =>
      !isAssignmentCompletedByStudent(assignment.id, studentId, attempts),
  );
  if (incomplete.length === 0) return "completed";

  const nowMs = now.getTime();
  const hasOverdue = incomplete.some((assignment) => {
    const deadline = assignmentDeadlineAt(assignment);
    return deadline != null && deadline.getTime() < nowMs;
  });
  return hasOverdue ? "missing" : "in_progress";
}

export function classHomeStudentStatusLabel(
  status: ClassHomeStudentStatus,
): string {
  switch (status) {
    case "completed":
      return "완료";
    case "in_progress":
      return "진행중";
    case "missing":
      return "미학습";
    case "none":
      return "과제없음";
  }
}
