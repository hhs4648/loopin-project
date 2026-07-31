import type { ClassStudent } from "@/lib/class-students";
import type { ClassAssignment } from "@/lib/class-assignments";
import type { SavedProblemSet } from "@/lib/problem-sets";
import type { TeacherClass } from "@/lib/teacher-classes";
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
}): Promise<void> {
  if (!isSyncEnabled()) return;
  const supabase = getSupabase();
  const teacherId = await ensureTeacherSession();
  if (!supabase || !teacherId) return;

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
    return;
  }

  const rows = assignments.map((a, index) => ({
    id: a.id,
    class_id: a.classId,
    problem_set_id: a.problemSetId,
    lesson_date: a.lessonDate,
    deadline_time: a.deadlineTime,
    content_snapshot: snapshot,
    sort_order: index,
    assigned_at: a.assignedAt,
  }));

  if (rows.length > 0) {
    const { error: assignError } = await supabase
      .from("class_assignments")
      .upsert(rows, { onConflict: "id" });
    if (assignError) {
      console.warn("[sync] upsert assignments failed", assignError.message);
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
  }
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

    return {
      studentId: student.id,
      studentName: student.name,
      status,
      progressPercent: latest?.progressPercent ?? 0,
      latestAccuracy,
      firstScore: firstCompleted?.score ?? null,
      latestScore: latestCompleted?.score ?? latest?.score ?? null,
      submittedAt: latestCompleted?.completedAt ?? null,
      lastLearnedAt: latest?.updatedAt ?? null,
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

  const attemptIds = attempts.map((a) => a.id);
  const { data: answers } = await supabase
    .from("answers")
    .select("question_id, is_correct, attempt_id")
    .in("attempt_id", attemptIds);

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
 * 학생마다 가장 최근 attempt 답안을 사용.
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

  const attemptById = new Map(attempts.map((a) => [a.id, a]));
  const attemptIds = attempts.map((a) => a.id);
  const { data: answers } = await supabase
    .from("answers")
    .select("question_id, is_correct, attempt_id, created_at")
    .in("attempt_id", attemptIds);

  const nameByStudent = new Map(
    params.students.map((s) => [s.id, s.name] as const),
  );

  // typeKey -> studentId -> { isCorrect, attemptStartedAt }
  const byTypeStudent = new Map<
    string,
    Map<string, { isCorrect: boolean; startedAt: string }>
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
      new Map<string, { isCorrect: boolean; startedAt: string }>();
    const prev = studentMap.get(attempt.studentId);
    if (!prev || attempt.startedAt >= prev.startedAt) {
      studentMap.set(attempt.studentId, {
        isCorrect: Boolean(ans.is_correct),
        startedAt: attempt.startedAt,
      });
    }
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
