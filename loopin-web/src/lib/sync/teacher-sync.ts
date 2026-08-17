import type { ClassStudent } from "@/lib/class-students";
import type { ClassAssignment } from "@/lib/class-assignments";
import {
  loadClassAssignments,
  saveClassAssignments,
} from "@/lib/class-assignments";
import type { SavedProblemSet } from "@/lib/problem-sets";
import { loadProblemSets, persistProblemSets } from "@/lib/problem-sets";
import type { TeacherClass } from "@/lib/teacher-classes";
import { classIdsEqual } from "@/lib/teacher-classes";
import { buildContentSnapshot } from "@/lib/sync/content-snapshot";
import { getSupabase, isSyncEnabled } from "@/lib/sync/supabase-client";
import { ensureTeacherSession } from "@/lib/sync/teacher-session";
import type {
  AttemptProgress,
  Enrollment,
  QuestionDetailStats,
  QuestionStat,
  QuestionTypeBreakdown,
  StudentProgressRow,
} from "@/lib/sync/types";

const MIGRATED_KEY = "loopin-sync-migrated-v1";

/**
 * question_id = `${baseId}:${typeKey}`
 * baseId에 `:`가 있을 수 있음 (사용자 지정 단어 id `0:1` → `0:1:choice`)
 */
export function parseAnswerQuestionId(questionId: string): {
  baseId: string;
  typeKey: string;
} {
  const raw = questionId.trim();
  // OX 교정 스텝은 접미사가 한 겹 더 있다.
  // - 학생앱: `{원본id}:ox:fix`
  // - 교사 미리보기(구형): `{원본id}:ox-fix`
  // lastIndexOf만 쓰면 baseId가 `{원본id}:ox`가 되어 원본 문항과 매칭되지 않는다.
  const OX_FIX_SUFFIXES = [":ox:fix", ":ox-fix"] as const;
  for (const suffix of OX_FIX_SUFFIXES) {
    if (raw.endsWith(suffix)) {
      return {
        baseId: raw.slice(0, -suffix.length),
        typeKey: "fix",
      };
    }
  }
  const i = raw.lastIndexOf(":");
  if (i <= 0) return { baseId: raw, typeKey: "" };
  return {
    baseId: raw.slice(0, i),
    typeKey: raw.slice(i + 1),
  };
}

export function generateInviteCode(existing: Set<string>): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 40; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)]!;
    }
    if (!existing.has(code)) return code;
  }
  return `L${Date.now().toString(36).slice(-5).toUpperCase()}`.slice(0, 6);
}

export async function upsertTeacherClassRemote(
  teacherClass: TeacherClass,
): Promise<void> {
  if (!isSyncEnabled()) return;
  const supabase = getSupabase();
  const teacherId = await ensureTeacherSession();
  if (!supabase || !teacherId || !teacherClass.inviteCode) return;

  const { error } = await supabase.from("classes").upsert(
    {
      id: teacherClass.id,
      teacher_id: teacherId,
      name: teacherClass.name,
      grade: teacherClass.grade ?? null,
      invite_code: teacherClass.inviteCode,
      payload: teacherClass,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) {
    console.warn("[sync] upsert class failed", error.message);
    return;
  }

  await supabase.from("class_invites").upsert(
    {
      class_id: teacherClass.id,
      code: teacherClass.inviteCode,
      active: true,
    },
    { onConflict: "code" },
  );
}

export async function deleteTeacherClassRemote(classId: string): Promise<void> {
  if (!isSyncEnabled()) return;
  const supabase = getSupabase();
  if (!supabase) return;
  await ensureTeacherSession();
  const { error } = await supabase.from("classes").delete().eq("id", classId);
  if (error) console.warn("[sync] delete class failed", error.message);
}

/**
 * 반에 부여한 과제 하나만 취소 — `class_assignments` 행만 제거, 문제 세트는 유지.
 * 반환값 `ok: false`면 원격 삭제가 실패한 것 — 학생 앱 DB에는 그대로 남아있다.
 */
export async function deleteClassAssignmentRemote(
  assignmentId: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!isSyncEnabled()) return { ok: true };
  const supabase = getSupabase();
  if (!supabase) return { ok: true };
  await ensureTeacherSession();
  const { error } = await supabase
    .from("class_assignments")
    .delete()
    .eq("id", assignmentId);
  if (error) {
    console.warn("[sync] delete class assignment failed", error.message);
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

/**
 * 반에 부여된 과제를 **원격에서 읽어온다** — 로컬(localStorage)에만 의존하면
 * 다른 브라우저·기기에서 낸 과제나 과거에 삭제가 실패해 남은 행이 교사 화면에
 * 보이지 않는다. 그 과제도 학생 앱에서는 성이 활성화되므로, 교사가 목록에서
 * 보고 지울 수 있어야 한다.
 *
 * 마감 날짜(`deadline_date`)는 마이그레이션 007부터 원격에도 있다.
 * 그 이전에 만들어진 행은 값이 없으므로 수업 날짜로 보정한다.
 * 문제집(`problem_sets.payload`)까지 같이 돌려준다 —
 * `getAssignedProblemsForClass`가 문제집 없는 과제를 버리기 때문이다.
 */
export async function fetchClassAssignmentsRemote(classId: string): Promise<{
  assignments: ClassAssignment[];
  problemSets: SavedProblemSet[];
}> {
  const empty = { assignments: [], problemSets: [] };
  if (!isSyncEnabled()) return empty;
  const supabase = getSupabase();
  if (!supabase) return empty;
  await ensureTeacherSession();

  const { data: rows, error } = await supabase
    .from("class_assignments")
    .select("*")
    .eq("class_id", classId)
    .order("sort_order", { ascending: true });
  if (error || !rows) {
    if (error) console.warn("[sync] fetch assignments failed", error.message);
    return empty;
  }

  const assignments: ClassAssignment[] = rows.map((row) => {
    const lessonDate = String(row.lesson_date ?? "");
    const targetStudentId = row.target_student_id;
    // 006 이전 DB에서 읽으면 undefined — 재출제 묶기·원본 링크만 빠지고 나머지는 그대로 동작한다
    const sourceAssignmentId = row.source_assignment_id;
    const reissueBatchId = row.reissue_batch_id;
    return {
      id: String(row.id),
      problemSetId: String(row.problem_set_id),
      classId: String(row.class_id),
      lessonDate,
      // 007 이전 행은 `deadline_date`가 없다 — 그때만 수업일로 대체한다
      deadlineDate:
        typeof row.deadline_date === "string" && row.deadline_date
          ? row.deadline_date
          : lessonDate,
      deadlineTime: String(row.deadline_time ?? ""),
      ...(row.deadline_until_next_lesson === true
        ? { deadlineUntilNextLesson: true }
        : {}),
      // 009 이전 행은 컬럼이 없다 — 없으면 「이미 공개」
      ...(typeof row.open_at === "string" && row.open_at
        ? { openAt: row.open_at }
        : {}),
      ...(typeof targetStudentId === "string" && targetStudentId
        ? { targetStudentId }
        : {}),
      ...(typeof sourceAssignmentId === "string" && sourceAssignmentId
        ? { sourceAssignmentId }
        : {}),
      ...(typeof reissueBatchId === "string" && reissueBatchId
        ? { reissueBatchId }
        : {}),
      assignedAt: String(row.assigned_at ?? new Date().toISOString()),
    };
  });

  const setIds = [...new Set(assignments.map((a) => a.problemSetId))];
  if (setIds.length === 0) return { assignments, problemSets: [] };

  const { data: setRows, error: setError } = await supabase
    .from("problem_sets")
    .select("id, payload")
    .in("id", setIds);
  if (setError) {
    console.warn("[sync] fetch problem sets failed", setError.message);
    return { assignments, problemSets: [] };
  }

  const problemSets: SavedProblemSet[] = [];
  for (const row of setRows ?? []) {
    const payload = row.payload as SavedProblemSet | null;
    // payload가 비어 있으면 화면에 그릴 수 없으니 건너뛴다 (추측해서 채우지 않는다).
    if (!payload || typeof payload !== "object" || !payload.id) continue;
    problemSets.push(payload);
  }
  return { assignments, problemSets };
}

/**
 * 원격에만 있는 과제를 로컬 목록에 복원한다 — 교사가 보고 지울 수 있게.
 *
 * 이미 로컬에 있는 항목은 **덮어쓰지 않는다.** 로컬 쪽에만 있는 필드
 * (`deadlineDate`, `deadlineUntilNextLesson`)가 지워지기 때문이다.
 * 문제집 payload를 못 구한 과제는 화면에 그릴 수 없으므로 복원하지 않고 경고만 남긴다
 * (보이지도 않는 항목을 로컬에 쌓아 두지 않는다).
 *
 * @returns 복원된 항목이 있으면 true
 */
export async function restoreRemoteOnlyAssignments(
  classId: string,
): Promise<boolean> {
  const remote = await fetchClassAssignmentsRemote(classId);
  if (remote.assignments.length === 0) return false;

  const localAssignments = loadClassAssignments();
  const knownAssignmentIds = new Set(localAssignments.map((a) => a.id));
  const missing = remote.assignments.filter(
    (a) => !knownAssignmentIds.has(a.id),
  );
  if (missing.length === 0) return false;

  const localSets = loadProblemSets();
  const knownSetIds = new Set(localSets.map((s) => s.id));
  const remoteSetById = new Map(remote.problemSets.map((s) => [s.id, s]));

  const restorable = missing.filter(
    (a) => knownSetIds.has(a.problemSetId) || remoteSetById.has(a.problemSetId),
  );
  const skipped = missing.length - restorable.length;
  if (skipped > 0) {
    console.warn(
      `[sync] 문제집을 찾지 못해 과제 ${skipped}개를 복원하지 못했습니다 (반 ${classId})`,
    );
  }
  if (restorable.length === 0) return false;

  const setsToAdd = [
    ...new Set(
      restorable
        .map((a) => a.problemSetId)
        .filter((id) => !knownSetIds.has(id)),
    ),
  ]
    .map((id) => remoteSetById.get(id))
    .filter((s): s is SavedProblemSet => Boolean(s));

  // 문제집을 먼저 저장해야 과제가 목록에 그려진다.
  if (setsToAdd.length > 0) {
    persistProblemSets([...localSets, ...setsToAdd]);
  }
  saveClassAssignments([...localAssignments, ...restorable]);
  return true;
}

/**
 * 사용자 지정 과제 목록에서만 숨김 — `problem_sets` 행은 유지해서
 * 이미 부여된 `class_assignments`·학생 진행이 cascade로 지워지지 않게 한다.
 */
export async function deleteProblemSetRemote(
  problemSet: SavedProblemSet,
): Promise<{ ok: boolean; message?: string }> {
  if (!isSyncEnabled()) return { ok: true };
  const supabase = getSupabase();
  if (!supabase) return { ok: true };
  const teacherId = await ensureTeacherSession();
  if (!teacherId) {
    return { ok: false, message: "교사 세션을 확인할 수 없어요." };
  }

  const hidden: SavedProblemSet = {
    ...problemSet,
    hiddenFromLibrary: true,
    favorite: false,
    updatedAt: new Date().toISOString(),
  };

  const { error } = await supabase.from("problem_sets").upsert(
    {
      id: hidden.id,
      teacher_id: teacherId,
      title: hidden.title,
      grade: hidden.grade,
      textbook: hidden.textbook,
      unit: hidden.unit,
      payload: hidden,
      updated_at: hidden.updatedAt,
    },
    { onConflict: "id" },
  );
  if (error) {
    console.warn("[sync] hide problem set failed", error.message);
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

export async function publishProblemSetAndAssignments(params: {
  problemSet: SavedProblemSet;
  assignments: ClassAssignment[];
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isSyncEnabled()) {
    return { ok: false, message: "서버 연결이 없어요. 환경변수를 확인해 주세요." };
  }
  const supabase = getSupabase();
  const teacherId = await ensureTeacherSession();
  if (!supabase || !teacherId) {
    return { ok: false, message: "교사 로그인이 필요해요." };
  }

  const { problemSet, assignments } = params;
  const snapshot = buildContentSnapshot(problemSet);

  const { error: setError } = await supabase.from("problem_sets").upsert(
    {
      id: problemSet.id,
      teacher_id: teacherId,
      title: problemSet.title,
      grade: problemSet.grade,
      textbook: problemSet.textbook,
      unit: problemSet.unit,
      payload: problemSet,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (setError) {
    console.warn("[sync] upsert problem set failed", setError.message);
    return { ok: false, message: setError.message };
  }

  /** 반마다 기존 과제 다음 번호 — 세트 내부 index(항상 0)로 덮어쓰지 않음 */
  const sortOrderById = new Map<string, number>();
  const byClass = new Map<string, ClassAssignment[]>();
  for (const a of assignments) {
    const list = byClass.get(a.classId) ?? [];
    list.push(a);
    byClass.set(a.classId, list);
  }
  for (const [classId, list] of byClass) {
    const { data: existingRows } = await supabase
      .from("class_assignments")
      .select("id, sort_order")
      .eq("class_id", classId);
    const existing = new Map(
      (existingRows ?? []).map((row) => [
        String(row.id),
        Number(row.sort_order ?? 0),
      ]),
    );
    const publishingIds = new Set(list.map((a) => a.id));
    let maxOrder = -1;
    for (const [id, order] of existing) {
      if (!publishingIds.has(id)) maxOrder = Math.max(maxOrder, order);
    }
    const sorted = [...list].sort((a, b) =>
      a.assignedAt.localeCompare(b.assignedAt),
    );
    let nextOrder = maxOrder + 1;
    for (const a of sorted) {
      const prev = existing.get(a.id);
      if (prev != null) sortOrderById.set(a.id, prev);
      else sortOrderById.set(a.id, nextOrder++);
    }
  }

  const rows = assignments.map((a) => {
    const row: Record<string, unknown> = {
      id: a.id,
      class_id: a.classId,
      problem_set_id: a.problemSetId,
      lesson_date: a.lessonDate,
      deadline_time: a.deadlineTime,
      // 007 전 DB에는 컬럼이 없다 — 값이 있을 때만 보낸다
      ...(a.deadlineDate ? { deadline_date: a.deadlineDate } : {}),
      ...(a.deadlineUntilNextLesson
        ? { deadline_until_next_lesson: true }
        : {}),
      // 009 전 DB에는 컬럼이 없다 — 값이 있을 때만 보낸다
      ...(a.openAt ? { open_at: a.openAt } : {}),
      content_snapshot: snapshot,
      sort_order: sortOrderById.get(a.id) ?? 0,
      assigned_at: a.assignedAt,
    };
    // 마이그레이션(004) 전 DB에는 컬럼이 없음 — 일반 반 과제는 필드를 보내지 않는다.
    if (a.targetStudentId) {
      row.target_student_id = a.targetStudentId;
    }
    // 같은 이유로(006 전 DB) 재출제 과제일 때만 보낸다.
    if (a.sourceAssignmentId) {
      row.source_assignment_id = a.sourceAssignmentId;
    }
    if (a.reissueBatchId) {
      row.reissue_batch_id = a.reissueBatchId;
    }
    return row;
  });

  if (rows.length > 0) {
    const { error: assignError } = await supabase
      .from("class_assignments")
      .upsert(rows, { onConflict: "id" });
    if (assignError) {
      console.warn("[sync] upsert assignments failed", assignError.message);
      return { ok: false, message: assignError.message };
    }
  }

  // 이 문제 세트의 반별 부여 중 이번 저장에서 빠진(반 선택 해제·삭제된) 항목은
  // 원격에서도 정리 — 그대로 두면 학생 앱에 남은 채로 계속 보인다.
  const currentIds = rows.map((r) => r.id);
  const baseQuery = supabase
    .from("class_assignments")
    .delete()
    .eq("problem_set_id", problemSet.id);
  const { error: staleError } =
    currentIds.length > 0
      ? await baseQuery.not("id", "in", `(${currentIds.join(",")})`)
      : await baseQuery;
  if (staleError) {
    console.warn("[sync] cleanup stale assignments failed", staleError.message);
    return { ok: false, message: staleError.message };
  }

  return { ok: true };
}

/**
 * 반의 로컬 과제들을 서버에 다시 올려 학생 맵과 맞춘다.
 * (교사 UI는 localStorage 우선이라, 예전 silent publish 실패분이 학생에게만 안 보이던 문제 보정)
 */
export async function syncLocalAssignmentsForClass(params: {
  classId: string;
  problemSets: SavedProblemSet[];
  assignments: ClassAssignment[];
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isSyncEnabled()) {
    return { ok: false, message: "서버 연결이 없어요." };
  }

  const forClass = params.assignments.filter(
    (a) => classIdsEqual(a.classId, params.classId) && !a.targetStudentId,
  );
  const bySet = new Map<string, ClassAssignment[]>();
  for (const a of forClass) {
    const list = bySet.get(a.problemSetId) ?? [];
    list.push(a);
    bySet.set(a.problemSetId, list);
  }

  for (const [setId, list] of bySet) {
    const problemSet = params.problemSets.find((s) => s.id === setId);
    if (!problemSet) continue;
    const result = await publishProblemSetAndAssignments({
      problemSet,
      assignments: list,
    });
    if (!result.ok) return result;
  }

  return { ok: true };
}

/**
 * 학생마다 다른 문제 세트·스냅샷으로 개인 과제를 부여한다.
 * (오답 복습: targetStudentId 가 있는 class_assignments)
 */
export async function publishTargetedStudentAssignments(
  items: Array<{ problemSet: SavedProblemSet; assignment: ClassAssignment }>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isSyncEnabled() || items.length === 0) {
    return { ok: false, message: "서버 연결이 없거나 항목이 없어요." };
  }
  for (const item of items) {
    const result = await publishProblemSetAndAssignments({
      problemSet: item.problemSet,
      assignments: [item.assignment],
    });
    if (!result.ok) return result;
  }
  return { ok: true };
}

export async function fetchClassEnrollments(
  classId: string,
): Promise<Enrollment[]> {
  if (!isSyncEnabled()) return [];
  const supabase = getSupabase();
  if (!supabase) return [];
  await ensureTeacherSession();

  const { data, error } = await supabase
    .from("enrollments")
    .select(
      "id, class_id, student_id, enrolled_at, profiles:student_id(display_name, grade)",
    )
    .eq("class_id", classId)
    .order("enrolled_at", { ascending: false });

  if (error || !data) {
    if (error) console.warn("[sync] fetch enrollments failed", error.message);
    return [];
  }

  return data.map((row) => {
    const profile = row.profiles as
      | { display_name?: string; grade?: string }
      | { display_name?: string; grade?: string }[]
      | null;
    const p = Array.isArray(profile) ? profile[0] : profile;
    return {
      id: row.id as string,
      classId: row.class_id as string,
      studentId: row.student_id as string,
      enrolledAt: row.enrolled_at as string,
      studentName: p?.display_name ?? "학생",
      studentGrade: p?.grade,
    };
  });
}

/**
 * 반에서 학생을 뺀다 — `enrollments` 행 삭제.
 *
 * **로컬에서만 지우면 안 된다.** 잠시 뒤 `fetchClassEnrollments` → `mergeEnrolledStudents`가
 * 서버 값을 다시 합치면서 지운 학생이 되살아난다(그래서 「삭제가 안 된다」로 보였다).
 * 원격 삭제가 성공한 뒤에만 로컬을 지워야 한다.
 *
 * 학생의 답안·시도(`attempts`/`answers`)는 **건드리지 않는다.** 반에서 뺀다고 지금까지 푼
 * 기록까지 없앨 이유는 없고, 잘못 뺐을 때 다시 초대코드로 들어오면 기록이 이어진다.
 */
export async function removeEnrollmentRemote(params: {
  classId: string
  studentId: string
}): Promise<{ ok: boolean; message?: string }> {
  if (!isSyncEnabled()) return { ok: true };
  const supabase = getSupabase();
  if (!supabase) return { ok: true };
  await ensureTeacherSession();

  const { error } = await supabase
    .from("enrollments")
    .delete()
    .eq("class_id", params.classId)
    .eq("student_id", params.studentId);
  if (error) {
    console.warn("[sync] delete enrollment failed", error.message);
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

export function mergeEnrolledStudents(
  local: ClassStudent[],
  enrollments: Enrollment[],
): ClassStudent[] {
  const byId = new Map(local.map((s) => [s.id, s]));
  for (const e of enrollments) {
    const existing = byId.get(e.studentId);
    byId.set(e.studentId, {
      id: e.studentId,
      // 교사가 로컬에서 수정한 이름 유지 · 신규 가입만 프로필 display_name 사용
      name: existing?.name?.trim() || e.studentName || "학생",
      createdAt: e.enrolledAt,
      memo: existing?.memo,
      source: "enrolled",
    });
  }
  return Array.from(byId.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

function mapAttempt(row: Record<string, unknown>): AttemptProgress {
  return {
    id: String(row.id),
    assignmentId: String(row.assignment_id),
    studentId: String(row.student_id),
    status: row.status === "completed" ? "completed" : "in_progress",
    answeredCount: Number(row.answered_count ?? 0),
    correctCount: Number(row.correct_count ?? 0),
    progressPercent: Number(row.progress_percent ?? 0),
    score: row.score == null ? null : Number(row.score),
    questionTotal: Number(row.question_total ?? 0),
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    updatedAt: String(row.updated_at ?? row.started_at),
  };
}

export async function fetchAttemptsForAssignment(
  assignmentId: string,
): Promise<AttemptProgress[]> {
  if (!isSyncEnabled()) return [];
  const supabase = getSupabase();
  if (!supabase) return [];
  await ensureTeacherSession();

  const { data, error } = await supabase
    .from("attempts")
    .select("*")
    .eq("assignment_id", assignmentId)
    .order("started_at", { ascending: true });

  if (error || !data) {
    if (error) console.warn("[sync] fetch attempts failed", error.message);
    return [];
  }
  return data.map((row) => mapAttempt(row as Record<string, unknown>));
}

export type StudentWrongAnswer = {
  questionId: string;
  baseId: string;
  typeKey: string;
};

/**
 * 학생의 해당 과제 최신 attempt에서 틀린 문항만 반환.
 * question_id 형식: `${baseId}:${typeKey}` (baseId에 `:` 포함 가능)
 */
export async function fetchWrongAnswersForStudent(params: {
  assignmentId: string;
  studentId: string;
}): Promise<StudentWrongAnswer[]> {
  if (!isSyncEnabled()) return [];
  const supabase = getSupabase();
  if (!supabase) return [];
  await ensureTeacherSession();

  const attempts = await fetchAttemptsForAssignment(params.assignmentId);
  const studentAttempts = attempts
    .filter((a) => a.studentId === params.studentId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const latest = studentAttempts[0];
  if (!latest) return [];

  const { data, error } = await supabase
    .from("answers")
    .select("question_id, is_correct")
    .eq("attempt_id", latest.id)
    .eq("is_correct", false);

  if (error || !data) {
    if (error) {
      console.warn("[sync] fetch wrong answers failed", error.message);
    }
    return [];
  }

  const out: StudentWrongAnswer[] = [];
  const seen = new Set<string>();
  for (const row of data) {
    const questionId = String(row.question_id ?? "");
    if (!questionId || seen.has(questionId)) continue;
    seen.add(questionId);
    const { baseId, typeKey } = parseAnswerQuestionId(questionId);
    if (!typeKey) continue;
    out.push({ questionId, baseId, typeKey });
  }
  return out;
}

export async function fetchAttemptsForClass(
  classId: string,
): Promise<AttemptProgress[]> {
  if (!isSyncEnabled()) return [];
  const supabase = getSupabase();
  if (!supabase) return [];
  await ensureTeacherSession();

  const { data: assignments, error: aErr } = await supabase
    .from("class_assignments")
    .select("id")
    .eq("class_id", classId);
  if (aErr || !assignments?.length) return [];

  const ids = assignments.map((a) => a.id as string);
  const { data, error } = await supabase
    .from("attempts")
    .select("*")
    .in("assignment_id", ids)
    .order("started_at", { ascending: true });

  if (error || !data) {
    if (error) console.warn("[sync] fetch class attempts failed", error.message);
    return [];
  }
  return data.map((row) => mapAttempt(row as Record<string, unknown>));
}

/** 로컬 캘린더 일 키 (YYYY-MM-DD). */
function toLocalDayKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localDayKeyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 시도 시각(시작·갱신·완료)이 있는 캘린더 일을 모아,
 * 오늘 또는 어제부터 끊기지 않은 연속 학습 일수를 계산한다.
 * 마지막 학습이 이틀 이상 전이면 0.
 */
export function computeStudyStreakDays(attempts: AttemptProgress[]): number {
  const days = new Set<string>();
  for (const a of attempts) {
    for (const ts of [a.startedAt, a.updatedAt, a.completedAt]) {
      if (!ts) continue;
      const key = toLocalDayKey(ts);
      if (key) days.add(key);
    }
  }
  if (days.size === 0) return 0;

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayKey = localDayKeyFromDate(today);
  const yesterdayKey = localDayKeyFromDate(yesterday);

  let cursor: Date;
  if (days.has(todayKey)) cursor = today;
  else if (days.has(yesterdayKey)) cursor = yesterday;
  else return 0;

  let streak = 0;
  while (days.has(localDayKeyFromDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function buildStudentProgressRows(
  students: ClassStudent[],
  attempts: AttemptProgress[],
  assignmentId?: string,
): StudentProgressRow[] {
  const filtered = assignmentId
    ? attempts.filter((a) => a.assignmentId === assignmentId)
    : attempts;

  return students.map((student) => {
    const mine = filtered
      .filter((a) => a.studentId === student.id)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const allMine = attempts.filter((a) => a.studentId === student.id);
    const latest = mine[mine.length - 1];
    const firstCompleted = mine.find((a) => a.status === "completed");
    const latestCompleted = [...mine]
      .reverse()
      .find((a) => a.status === "completed");

    let status: StudentProgressRow["status"] = "idle";
    if (latest?.status === "completed") status = "completed";
    else if (latest) status = "in_progress";

    const latestAccuracy =
      latest && latest.answeredCount > 0
        ? Math.round((latest.correctCount / latest.answeredCount) * 100)
        : latest?.score != null
          ? Math.round(Number(latest.score))
          : null;

    // 평균 정답률: 과제별 **마지막 시도** 점수만 산술평균 (중간 재도전 미반영)
    const lastAttemptByAssignment = new Map<string, (typeof mine)[number]>();
    for (const attempt of mine) {
      lastAttemptByAssignment.set(attempt.assignmentId, attempt);
    }
    const lastScores: number[] = [];
    for (const last of lastAttemptByAssignment.values()) {
      if (last.score == null) continue;
      lastScores.push(Number(last.score));
    }
    const averageAccuracy =
      lastScores.length > 0
        ? Math.round(
            lastScores.reduce((sum, score) => sum + score, 0) / lastScores.length,
          )
        : null;

    return {
      studentId: student.id,
      studentName: student.name,
      status,
      progressPercent: latest?.progressPercent ?? 0,
      latestAccuracy,
      averageAccuracy,
      firstScore: firstCompleted?.score ?? null,
      latestScore: latestCompleted?.score ?? latest?.score ?? null,
      latestCorrectCount: latestCompleted?.correctCount ?? null,
      latestAnsweredCount: latestCompleted?.answeredCount ?? null,
      submittedAt: latestCompleted?.completedAt ?? null,
      lastLearnedAt: latest?.updatedAt ?? null,
      // 연속 학습은 반 전체 시도 기준 (과제 필터와 무관)
      studyStreakDays: computeStudyStreakDays(allMine),
    };
  });
}

export async function fetchQuestionStats(
  assignmentId: string,
  snapshot: {
    words: { id: string; english: string; korean: string }[];
    sentences: { id: string; english: string }[];
    grammar: { id: string; english: string }[];
  },
): Promise<QuestionStat[]> {
  if (!isSyncEnabled()) return [];
  const supabase = getSupabase();
  if (!supabase) return [];
  await ensureTeacherSession();

  const attempts = await fetchAttemptsForAssignment(assignmentId);
  if (attempts.length === 0) {
    return [
      ...snapshot.words.map((w) => ({
        questionId: w.id,
        category: "단어" as const,
        text: `${w.english} · ${w.korean}`,
        correctRate: null,
        answeredCount: 0,
      })),
      ...snapshot.sentences.map((s) => ({
        questionId: s.id,
        category: "문장" as const,
        text: s.english,
        correctRate: null,
        answeredCount: 0,
      })),
      ...snapshot.grammar.map((g) => ({
        questionId: g.id,
        category: "문법" as const,
        text: g.english,
        correctRate: null,
        answeredCount: 0,
      })),
    ];
  }

  // 학생마다 과제 **마지막 시도**만 반영 (중간 재도전 answers 제외)
  const latestAttemptByStudent = new Map<string, AttemptProgress>();
  for (const attempt of attempts) {
    const prev = latestAttemptByStudent.get(attempt.studentId);
    if (!prev || attempt.startedAt >= prev.startedAt) {
      latestAttemptByStudent.set(attempt.studentId, attempt);
    }
  }
  const latestAttemptIds = [...latestAttemptByStudent.values()].map((a) => a.id);

  const { data: answers } = await supabase
    .from("answers")
    .select("question_id, is_correct, attempt_id")
    .in("attempt_id", latestAttemptIds);

  const byQ = new Map<string, { correct: number; total: number }>();
  for (const ans of answers ?? []) {
    const { baseId: qid } = parseAnswerQuestionId(String(ans.question_id));
    const cur = byQ.get(qid) ?? { correct: 0, total: 0 };
    cur.total += 1;
    if (ans.is_correct) cur.correct += 1;
    byQ.set(qid, cur);
  }

  const toStat = (
    id: string,
    category: QuestionStat["category"],
    text: string,
  ): QuestionStat => {
    const cur = byQ.get(id);
    return {
      questionId: id,
      category,
      text,
      answeredCount: cur?.total ?? 0,
      correctRate:
        cur && cur.total > 0
          ? Math.round((cur.correct / cur.total) * 100)
          : null,
    };
  };

  return [
    ...snapshot.words.map((w) =>
      toStat(w.id, "단어", `${w.english} · ${w.korean}`),
    ),
    ...snapshot.sentences.map((s) => toStat(s.id, "문장", s.english)),
    ...snapshot.grammar.map((g) => toStat(g.id, "문법", g.english)),
  ];
}

const TYPE_SUFFIX_LABEL: Record<string, string> = {
  match: "짝맞추기",
  listen: "음성 짝맞추기",
  choice: "3지선다",
  spell: "예문 빈칸",
  chunk: "청크배열",
  translate: "번역 배열",
  write: "영작",
  ox: "OX문제",
  fix: "OX 교정",
};

const TYPE_ORDER = [
  "match",
  "listen",
  "choice",
  "spell",
  "chunk",
  "translate",
  "write",
  "ox",
  "fix",
] as const;

function resolveTypeLabel(
  typeKey: string,
  category: "단어" | "문장" | "문법",
): string | null {
  if (typeKey === "choice") {
    return category === "문법" ? "선택형 문제" : "3지선다";
  }
  return TYPE_SUFFIX_LABEL[typeKey] ?? null;
}

/**
 * 특정 문항(단어/문장/문법 원본 id)의 유형별 정답률 + 학생별 정오.
 * 학생마다 과제의 **마지막 시도** 답안만 사용 (중간 재도전 제외).
 */
export async function fetchQuestionDetailStats(params: {
  assignmentId: string;
  questionId: string;
  category: "단어" | "문장" | "문법";
  students: { id: string; name: string }[];
}): Promise<QuestionDetailStats> {
  const empty: QuestionDetailStats = {
    questionId: params.questionId,
    types: [],
  };
  if (!isSyncEnabled()) return empty;
  const supabase = getSupabase();
  if (!supabase) return empty;
  await ensureTeacherSession();

  const attempts = await fetchAttemptsForAssignment(params.assignmentId);
  if (attempts.length === 0) return empty;

  const latestAttemptByStudent = new Map<string, AttemptProgress>();
  for (const attempt of attempts) {
    const prev = latestAttemptByStudent.get(attempt.studentId);
    if (!prev || attempt.startedAt >= prev.startedAt) {
      latestAttemptByStudent.set(attempt.studentId, attempt);
    }
  }
  const latestAttemptIds = [...latestAttemptByStudent.values()].map((a) => a.id);
  if (latestAttemptIds.length === 0) return empty;

  const attemptById = new Map(
    [...latestAttemptByStudent.values()].map((a) => [a.id, a]),
  );
  const { data: answers } = await supabase
    .from("answers")
    .select("question_id, is_correct, attempt_id, created_at")
    .in("attempt_id", latestAttemptIds);

  const nameByStudent = new Map(
    params.students.map((s) => [s.id, s.name] as const),
  );

  // typeKey -> studentId -> { isCorrect }
  const byTypeStudent = new Map<
    string,
    Map<string, { isCorrect: boolean }>
  >();

  for (const ans of answers ?? []) {
    const raw = String(ans.question_id);
    const { baseId, typeKey } = parseAnswerQuestionId(raw);
    if (baseId !== params.questionId) continue;
    const typeLabel = resolveTypeLabel(typeKey, params.category);
    if (!typeLabel || !typeKey) continue;

    const attempt = attemptById.get(String(ans.attempt_id));
    if (!attempt) continue;

    const studentMap =
      byTypeStudent.get(typeKey) ??
      new Map<string, { isCorrect: boolean }>();
    studentMap.set(attempt.studentId, {
      isCorrect: Boolean(ans.is_correct),
    });
    byTypeStudent.set(typeKey, studentMap);
  }

  const types: QuestionTypeBreakdown[] = [...byTypeStudent.entries()]
    .map(([typeKey, studentMap]) => {
      const typeLabel =
        resolveTypeLabel(typeKey, params.category) ?? typeKey;
      const correctStudents: QuestionTypeBreakdown["correctStudents"] = [];
      const wrongStudents: QuestionTypeBreakdown["wrongStudents"] = [];
      for (const [studentId, result] of studentMap) {
        const entry = {
          studentId,
          studentName: nameByStudent.get(studentId) ?? "이름 없음",
          isCorrect: result.isCorrect,
        };
        if (result.isCorrect) correctStudents.push(entry);
        else wrongStudents.push(entry);
      }
      correctStudents.sort((a, b) =>
        a.studentName.localeCompare(b.studentName, "ko"),
      );
      wrongStudents.sort((a, b) =>
        a.studentName.localeCompare(b.studentName, "ko"),
      );
      const answeredCount = correctStudents.length + wrongStudents.length;
      return {
        typeKey,
        typeLabel,
        answeredCount,
        correctRate:
          answeredCount > 0
            ? Math.round((correctStudents.length / answeredCount) * 100)
            : null,
        correctStudents,
        wrongStudents,
      };
    })
    .sort(
      (a, b) =>
        TYPE_ORDER.indexOf(a.typeKey as (typeof TYPE_ORDER)[number]) -
        TYPE_ORDER.indexOf(b.typeKey as (typeof TYPE_ORDER)[number]),
    );

  return { questionId: params.questionId, types };
}

export async function migrateLocalDataOnce(params: {
  classes: TeacherClass[];
  problemSets: SavedProblemSet[];
  assignments: ClassAssignment[];
}): Promise<void> {
  if (!isSyncEnabled()) return;
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(MIGRATED_KEY) === "1") return;
  } catch {
    return;
  }

  const teacherId = await ensureTeacherSession();
  if (!teacherId) return;

  for (const c of params.classes) {
    await upsertTeacherClassRemote(c);
  }

  const bySet = new Map<string, ClassAssignment[]>();
  for (const a of params.assignments) {
    const list = bySet.get(a.problemSetId) ?? [];
    list.push(a);
    bySet.set(a.problemSetId, list);
  }

  for (const set of params.problemSets) {
    await publishProblemSetAndAssignments({
      problemSet: set,
      assignments: bySet.get(set.id) ?? [],
    });
  }

  try {
    window.localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export type RealtimeUnsubscribe = () => void;

export function subscribeClassRealtime(
  classId: string,
  onChange: () => void,
): RealtimeUnsubscribe {
  if (!isSyncEnabled()) return () => undefined;
  const supabase = getSupabase();
  if (!supabase) return () => undefined;

  const channel = supabase
    .channel(`class-${classId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "enrollments",
        filter: `class_id=eq.${classId}`,
      },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "attempts" },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "class_assignments",
        filter: `class_id=eq.${classId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
