import {
  loadAcademicSchedule,
  saveAcademicSchedule,
  type AcademicScheduleSettings,
} from "@/lib/calendar-academic-schedule";
import {
  loadOneOffLessons,
  saveOneOffLessons,
  type OneOffLesson,
} from "@/lib/calendar-one-off-lessons";
import {
  loadAllClassStudents,
  saveClassStudents,
  type ClassStudent,
} from "@/lib/class-students";
import {
  brandsEqual,
  DEFAULT_SCHOOL_BRAND,
  loadSchoolBrand,
  normalizeBrand,
  saveSchoolBrand,
  type SchoolBrand,
} from "@/lib/school-brand";
import { getSupabase, isSyncEnabled } from "@/lib/sync/supabase-client";
import { ensureTeacherSession } from "@/lib/sync/teacher-session";

/** 기존 스키마만으로도 기기 간 설정을 옮기기 위한 예약 문제집 id */
export const TEACHER_WORKSPACE_SET_PREFIX = "haksup-workspace:";

export function teacherWorkspaceSetId(teacherId: string): string {
  return `${TEACHER_WORKSPACE_SET_PREFIX}${teacherId}`;
}

export function isTeacherWorkspaceSetId(id: string): boolean {
  return id.startsWith(TEACHER_WORKSPACE_SET_PREFIX);
}

export type TeacherWorkspacePayload = {
  version: 1;
  updatedAt: string;
  schoolBrand?: SchoolBrand;
  academicSchedule?: AcademicScheduleSettings;
  oneOffLessons?: OneOffLesson[];
  classStudents?: Record<string, ClassStudent[]>;
};

function isWorkspacePayload(value: unknown): value is TeacherWorkspacePayload {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TeacherWorkspacePayload>;
  return item.version === 1 && typeof item.updatedAt === "string";
}

function readLocalWorkspace(): TeacherWorkspacePayload {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    schoolBrand: loadSchoolBrand(),
    academicSchedule: loadAcademicSchedule(),
    oneOffLessons: loadOneOffLessons(),
    classStudents: loadAllClassStudents(),
  };
}

async function fetchWorkspaceFromProfiles(
  teacherId: string,
): Promise<TeacherWorkspacePayload | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("workspace")
    .eq("id", teacherId)
    .maybeSingle();
  if (error) {
    // 컬럼이 아직 없는 배포본 — 문제집 예약 행으로 대체한다.
    return null;
  }
  return isWorkspacePayload(data?.workspace) ? data.workspace : null;
}

async function fetchWorkspaceFromProblemSet(
  teacherId: string,
): Promise<TeacherWorkspacePayload | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("problem_sets")
    .select("payload")
    .eq("id", teacherWorkspaceSetId(teacherId))
    .maybeSingle();
  if (error) {
    console.warn("[sync] fetch teacher workspace failed", error.message);
    return null;
  }
  return isWorkspacePayload(data?.payload) ? data.payload : null;
}

export async function fetchTeacherWorkspaceRemote(): Promise<TeacherWorkspacePayload | null> {
  if (!isSyncEnabled()) return null;
  const teacherId = await ensureTeacherSession();
  if (!teacherId) return null;
  const fromProfile = await fetchWorkspaceFromProfiles(teacherId);
  if (fromProfile) return fromProfile;
  return fetchWorkspaceFromProblemSet(teacherId);
}

export async function syncTeacherWorkspaceRemote(): Promise<void> {
  if (!isSyncEnabled()) return;
  if (typeof window === "undefined") return;
  const supabase = getSupabase();
  const teacherId = await ensureTeacherSession();
  if (!supabase || !teacherId) return;

  const payload = readLocalWorkspace();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      workspace: payload,
      updated_at: payload.updatedAt,
    })
    .eq("id", teacherId);

  if (!profileError) return;

  const { error } = await supabase.from("problem_sets").upsert(
    {
      id: teacherWorkspaceSetId(teacherId),
      teacher_id: teacherId,
      title: "__haksup_workspace__",
      grade: "",
      textbook: "",
      unit: "",
      payload,
      updated_at: payload.updatedAt,
    },
    { onConflict: "id" },
  );
  if (error) {
    console.warn("[sync] upsert teacher workspace failed", error.message);
  }
}

export function applyTeacherWorkspaceLocal(
  remote: TeacherWorkspacePayload | null,
  options: { replace: boolean },
): void {
  if (!remote) return;

  if (options.replace) {
    if (remote.schoolBrand) saveSchoolBrand(normalizeBrand(remote.schoolBrand));
    if (remote.academicSchedule) saveAcademicSchedule(remote.academicSchedule);
    saveOneOffLessons(
      Array.isArray(remote.oneOffLessons) ? remote.oneOffLessons : [],
    );
    applyClassStudents(remote.classStudents ?? {}, true);
    return;
  }

  const localBrand = loadSchoolBrand();
  if (
    remote.schoolBrand &&
    brandsEqual(localBrand, DEFAULT_SCHOOL_BRAND) &&
    !brandsEqual(normalizeBrand(remote.schoolBrand), DEFAULT_SCHOOL_BRAND)
  ) {
    saveSchoolBrand(normalizeBrand(remote.schoolBrand));
  }

  const localSchedule = loadAcademicSchedule();
  if (
    remote.academicSchedule &&
    localSchedule.holidays.length === 0 &&
    remote.academicSchedule.holidays.length > 0
  ) {
    saveAcademicSchedule(remote.academicSchedule);
  } else if (
    remote.academicSchedule &&
    localSchedule.holidays.length === 0 &&
    remote.academicSchedule.includePublicHolidays !==
      localSchedule.includePublicHolidays
  ) {
    saveAcademicSchedule({
      ...localSchedule,
      includePublicHolidays: remote.academicSchedule.includePublicHolidays,
    });
  }

  const localLessons = loadOneOffLessons();
  const remoteLessons = Array.isArray(remote.oneOffLessons)
    ? remote.oneOffLessons
    : [];
  if (remoteLessons.length > 0) {
    const byId = new Map(localLessons.map((item) => [item.id, item]));
    for (const lesson of remoteLessons) {
      if (lesson?.id && !byId.has(lesson.id)) byId.set(lesson.id, lesson);
    }
    saveOneOffLessons([...byId.values()]);
  }

  applyClassStudents(remote.classStudents ?? {}, false);
}

function applyClassStudents(
  remote: Record<string, ClassStudent[]>,
  replace: boolean,
): void {
  for (const [classId, students] of Object.entries(remote)) {
    if (!classId || !Array.isArray(students)) continue;
    if (replace) {
      saveClassStudentsWithoutSync(classId, students);
      continue;
    }
    const local = loadAllClassStudents()[classId] ?? [];
    const byId = new Map(local.map((item) => [item.id, item]));
    for (const student of students) {
      if (!student?.id) continue;
      const existing = byId.get(student.id);
      if (!existing) {
        byId.set(student.id, student);
        continue;
      }
      byId.set(student.id, {
        ...student,
        ...existing,
        memo: existing.memo ?? student.memo,
      });
    }
    saveClassStudentsWithoutSync(classId, [...byId.values()]);
  }
}

/** hydrate 중에는 다시 원격으로 올리지 않는다 */
function saveClassStudentsWithoutSync(
  classId: string,
  students: ClassStudent[],
): void {
  window.localStorage.setItem(
    `haksup-class-students:${classId}`,
    JSON.stringify(students),
  );
}
