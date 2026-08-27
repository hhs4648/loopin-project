import {
  classIdsEqual,
  loadTeacherClasses,
  parseIsoDateLocal,
} from "@/lib/teacher-classes";
import { resolveAssignmentOpenAt } from "@/lib/assignment-open-at";
import type { SavedProblemSet } from "@/lib/problem-sets";
import type { AttemptProgress } from "@/lib/sync/types";

const STORAGE_KEY = "haksup-class-assignments";

/**
 * 마감 없는 과제(오답 재출제 등)용 센티널.
 * 스키마가 deadline을 필수로 두므로 저장만 하고, 표시·미제출 판정에서는 제외한다.
 */
export const ASSIGNMENT_NO_DEADLINE_DATE = "2099-12-31";
export const ASSIGNMENT_NO_DEADLINE_TIME = "23:59";

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
  /**
   * ISO 시각 · **학생 앱에 언제부터 보일지**. 「수업일 + 그 반의 수업 종료 시각」.
   *
   * 수업 전에는 문제가 보이면 안 된다 — 스냅샷에 정답까지 들어 있어서 미리보기가
   * 곧 답안지다. 계산은 `assignment-open-at.ts`, 서버 컬럼은 `open_at`(마이그레이션 009).
   * 없으면 **이미 공개**로 본다 — 이 필드가 생기기 전 과제가 사라지면 안 된다.
   */
  openAt?: string;
  /**
   * 있으면 해당 학생만 앱에서 보는 개인 과제(오답 복습 등).
   * 없으면 반 전체 과제.
   */
  targetStudentId?: string;
  /**
   * 오답 재출제로 만들어진 과제일 때, **어느 과제의 오답인지**.
   *
   * 이게 없으면 재출제 과제가 원본과 아무 연결이 없어서 「원본 대비 점수 변화」도,
   * 「같은 과제로 이미 재출제했는지」 검사도 못 한다. 제목 문자열(`… 하헌석 오답`)에만
   * 흔적이 남아 있던 것을 필드로 올린 것이다(2026-08-09).
   *
   * 서버 컬럼 `source_assignment_id` (마이그레이션 006)와 짝이다.
   */
  sourceAssignmentId?: string;
  /**
   * 한 번의 「앱에 내기」로 만들어진 재출제 과제들이 공유하는 묶음 id.
   *
   * 재출제는 **학생 수만큼 과제를 만든다** — 20명이면 20개다. 이 값이 없으면 과제 탭
   * 드롭다운에 같은 제목이 20줄 쌓이고, 배치 성적을 보려면 20번 클릭해야 하고,
   * 잘못 냈을 때 20번 지워야 한다. 교사 화면은 이 값으로 접어서 한 줄로 다룬다.
   *
   * 서버 컬럼 `reissue_batch_id` (마이그레이션 006)와 짝이다.
   */
  reissueBatchId?: string;
  assignedAt: string;
};

export function hasAssignmentDeadline(
  assignment: Pick<ClassAssignment, "deadlineDate">,
): boolean {
  return assignment.deadlineDate !== ASSIGNMENT_NO_DEADLINE_DATE;
}

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
  window.dispatchEvent(new Event("haksup-class-assignments-changed"));
}

export function createClassAssignment(
  input: CreateClassAssignmentInput,
): ClassAssignment {
  return {
    ...input,
    id: createClassAssignmentId(),
    assignedAt: new Date().toISOString(),
    ...resolveCreatedOpenAt(input),
  };
}

/**
 * 새 과제의 공개 시각.
 *
 * 기본은 **수업이 끝난 뒤** — 수업 전에 문제가 보이면 스냅샷의 정답까지 미리 볼 수 있다.
 * 두 경우는 예외로 즉시 공개한다.
 *
 * - 호출 측이 `openAt`을 직접 준 경우 (그 값을 존중)
 * - **오답 재출제**(`sourceAssignmentId`) — 교사가 「앱에 내기」를 누른 그 자리에서
 *   헬스장에 떠야 하는 것이라, 수업 종료까지 미루면 흐름이 끊긴다.
 */
function resolveCreatedOpenAt(
  input: CreateClassAssignmentInput,
): { openAt?: string } {
  if (input.openAt) return { openAt: input.openAt };
  if (input.sourceAssignmentId) return {};
  const teacherClass = loadTeacherClasses().find(
    (item) => item.id === input.classId,
  );
  const openAt = resolveAssignmentOpenAt(teacherClass, input.lessonDate);
  return openAt ? { openAt } : {};
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

/** 재출제 묶음을 통째로 취소할 때 — 학생 수만큼 쪼개진 과제를 한 번에 지운다 */
export function removeAssignmentsByIds(
  assignments: ClassAssignment[],
  assignmentIds: readonly string[],
): ClassAssignment[] {
  const drop = new Set(assignmentIds);
  return assignments.filter((item) => !drop.has(item.id));
}

/**
 * 같은 원본·같은 학생으로 **이미 만들어 둔** 재출제 과제.
 *
 * 만들기를 두 번 누르면 제목·날짜·대상이 똑같은 과제가 그대로 두 개 생기고,
 * 학생 맵에는 같은 성이 나란히 두 개 선다(2026-08-09에 실제로 발생해 DB에서 지웠다).
 * 모달이 만들기 전에 이걸 불러 경고한다.
 */
export function findExistingWrongReissues(
  assignments: ClassAssignment[],
  sourceAssignmentId: string,
  studentIds: readonly string[],
): ClassAssignment[] {
  const targets = new Set(studentIds);
  return assignments.filter(
    (item) =>
      item.sourceAssignmentId === sourceAssignmentId &&
      item.targetStudentId != null &&
      targets.has(item.targetStudentId),
  );
}

export function getAssignmentsForClass(
  assignments: ClassAssignment[],
  classId: string,
  opts?: { includePersonal?: boolean },
): ClassAssignment[] {
  const includePersonal = opts?.includePersonal === true;
  return assignments
    .filter(
      (item) =>
        classIdsEqual(item.classId, classId) &&
        (includePersonal || !item.targetStudentId),
    )
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
  opts?: { includePersonal?: boolean },
): AssignedProblemView[] {
  const byId = new Map(problemSets.map((set) => [set.id, set]));
  return getAssignmentsForClass(assignments, classId, opts).flatMap(
    (assignment) => {
      const problemSet = byId.get(assignment.problemSetId);
      return problemSet ? [{ assignment, problemSet }] : [];
    },
  );
}

/** 로컬 캘린더 일 키 (YYYY-MM-DD). */
export function localDayKeyFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 반마다 **가장 최근에 부여한** 과제 하나.
 * 캘린더 「과제 제출」 사이드바용 — 개인 오답 재출제는 빼 둔다.
 * `classOrder`가 있으면 그 반 순서를 따른다.
 */
export function getLatestAssignedProblemPerClass(
  problemSets: SavedProblemSet[],
  assignments: ClassAssignment[],
  classOrder?: string[],
): AssignedProblemView[] {
  const byId = new Map(problemSets.map((set) => [set.id, set]));
  const latestByClass = new Map<string, ClassAssignment>();
  const sorted = [...assignments]
    .filter((item) => !item.targetStudentId)
    .sort((a, b) => {
      const assignedCmp = b.assignedAt.localeCompare(a.assignedAt);
      if (assignedCmp !== 0) return assignedCmp;
      return b.lessonDate.localeCompare(a.lessonDate);
    });
  for (const assignment of sorted) {
    if (latestByClass.has(assignment.classId)) continue;
    if (!byId.has(assignment.problemSetId)) continue;
    latestByClass.set(assignment.classId, assignment);
  }

  const orderIndex = new Map((classOrder ?? []).map((id, index) => [id, index]));
  return [...latestByClass.values()]
    .sort((a, b) => {
      const ai = orderIndex.get(a.classId);
      const bi = orderIndex.get(b.classId);
      if (ai != null && bi != null && ai !== bi) return ai - bi;
      if (ai != null && bi == null) return -1;
      if (ai == null && bi != null) return 1;
      return a.classId.localeCompare(b.classId);
    })
    .flatMap((assignment) => {
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
  if (!hasAssignmentDeadline(assignment)) {
    return start;
  }
  if (assignment.deadlineUntilNextLesson) {
    return `${start} ≫ ${formatLessonDateKo(assignment.deadlineDate)} · 다음 수업 전까지`;
  }
  if (assignment.deadlineDate !== assignment.lessonDate) {
    return `${start} ≫ ${formatLessonDateKo(assignment.deadlineDate)} ${assignment.deadlineTime}`;
  }
  return `${start} ≫ ${assignment.deadlineTime}`;
}

/** 과제 헤더 배지용 — 수업일 ≫ 마감일(또는 당일 마감 시간). 마감 없으면 수업일만. */
export function formatAssignmentPeriod(assignment: ClassAssignment): string {
  const start = formatLessonDateKo(assignment.lessonDate);
  if (!hasAssignmentDeadline(assignment)) {
    return start;
  }
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
    if (!hasAssignmentDeadline(assignment)) return false;
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
