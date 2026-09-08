import {
  loadClassAssignments,
  saveClassAssignments,
  type ClassAssignment,
} from "@/lib/class-assignments";
import {
  DEFAULT_TEACHER_PROFILE,
  loadTeacherProfile,
  saveTeacherProfile,
} from "@/lib/teacher-profile";
import {
  loadProblemSets,
  persistProblemSets,
  type SavedProblemSet,
} from "@/lib/problem-sets";
import {
  loadTeacherClasses,
  saveTeacherClasses,
  type TeacherClass,
} from "@/lib/teacher-classes";
import { isLocalDemoSession } from "@/lib/sync/teacher-auth";
import { getSupabase, isSyncEnabled } from "@/lib/sync/supabase-client";
import { ensureTeacherSession } from "@/lib/sync/teacher-session";
import {
  classAssignmentFromRemoteRow,
  fetchClassEnrollments,
  mergeEnrolledStudents,
} from "@/lib/sync/teacher-sync";
import {
  applyTeacherWorkspaceLocal,
  fetchTeacherWorkspaceRemote,
  isTeacherWorkspaceSetId,
  syncTeacherWorkspaceRemote,
} from "@/lib/sync/teacher-workspace";
import {
  loadClassStudents,
  saveClassStudents,
} from "@/lib/class-students";

const WORKSPACE_UID_KEY = "haksup-teacher-workspace-uid";

const OWNED_STORAGE_KEYS = [
  "haksup-teacher-classes",
  "haksup-problem-sets",
  "haksup-class-assignments",
  "haksup-school-brand",
  "haksup-teacher-profile",
  "haksup-calendar-academic-schedule",
  "haksup-calendar-one-off-lessons",
  "haksup-sync-migrated-v1",
  "haksup-class-id-remap",
] as const;

let hydrateInFlight: Promise<{ ok: boolean }> | null = null;
let lastHydratedUid: string | null = null;
let lastHydratedAt = 0;

function readWorkspaceUid(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(WORKSPACE_UID_KEY);
  } catch {
    return null;
  }
}

function writeWorkspaceUid(uid: string): void {
  try {
    window.localStorage.setItem(WORKSPACE_UID_KEY, uid);
  } catch {
    /* ignore */
  }
}

function clearOwnedTeacherStorage(): void {
  if (typeof window === "undefined") return;
  for (const key of OWNED_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }
  const extra: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key?.startsWith("haksup-class-students:")) extra.push(key);
  }
  for (const key of extra) window.localStorage.removeItem(key);
}

function classFromRemoteRow(
  row: Record<string, unknown>,
): TeacherClass | null {
  const payload = row.payload;
  if (!payload || typeof payload !== "object") return null;
  const item = payload as TeacherClass;
  if (typeof item.id !== "string" || typeof item.name !== "string") return null;
  const invite =
    typeof row.invite_code === "string" && row.invite_code
      ? row.invite_code
      : item.inviteCode;
  return {
    ...item,
    id: String(row.id ?? item.id),
    name: typeof row.name === "string" && row.name ? row.name : item.name,
    grade:
      typeof row.grade === "string" && row.grade ? row.grade : item.grade,
    inviteCode: invite,
  };
}

function mergeByRemoteId<T extends { id: string }>(
  local: T[],
  remote: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const item of local) byId.set(item.id, item);
  for (const item of remote) byId.set(item.id, item);
  return [...byId.values()];
}

function mergeProblemSets(
  local: SavedProblemSet[],
  remote: SavedProblemSet[],
): SavedProblemSet[] {
  const byId = new Map<string, SavedProblemSet>();
  for (const item of local) {
    if (isTeacherWorkspaceSetId(item.id)) continue;
    byId.set(item.id, item);
  }
  for (const item of remote) {
    if (isTeacherWorkspaceSetId(item.id)) continue;
    const prev = byId.get(item.id);
    if (!prev || item.updatedAt > prev.updatedAt) byId.set(item.id, item);
  }
  return [...byId.values()];
}

function isCustomTeacherName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (trimmed === DEFAULT_TEACHER_PROFILE.name) return false;
  if (trimmed === "교사") return false;
  return true;
}

/**
 * 지금 로그인한 교사 계정 데이터를 이 브라우저 localStorage에 맞춘다.
 *
 * - 다른 기기·브라우저: 서버에 있는 반·문제집·과제를 불러온다.
 * - 같은 브라우저 같은 계정: 원격에만 있는 항목을 보태고, 겹치면 원격(마지막 동기화)을 따른다.
 * - 같은 브라우저 다른 계정: 이전 계정 로컬을 지우고 새 계정만 채운다.
 */
export async function hydrateTeacherWorkspace(): Promise<{ ok: boolean }> {
  if (!isSyncEnabled()) return { ok: false };
  if (typeof window === "undefined") return { ok: false };
  if (hydrateInFlight) return hydrateInFlight;

  hydrateInFlight = (async () => {
    const teacherId = await ensureTeacherSession();
    if (!teacherId) return { ok: false };
    const supabase = getSupabase();
    if (!supabase) return { ok: false };

    const hydratedRecently =
      lastHydratedUid === teacherId && Date.now() - lastHydratedAt < 15_000;
    if (hydratedRecently) return { ok: true };

    const previousUid = readWorkspaceUid();
    const replace =
      !isLocalDemoSession() &&
      Boolean(previousUid && previousUid !== teacherId);
    if (replace) clearOwnedTeacherStorage();

    const [
      classResult,
      setResult,
      profileResult,
      workspace,
    ] = await Promise.all([
      supabase
        .from("classes")
        .select("id, name, grade, invite_code, payload")
        .eq("teacher_id", teacherId),
      supabase
        .from("problem_sets")
        .select("id, payload")
        .eq("teacher_id", teacherId),
      supabase
        .from("profiles")
        .select("display_name, praise_pass_threshold")
        .eq("id", teacherId)
        .maybeSingle(),
      fetchTeacherWorkspaceRemote(),
    ]);

    if (classResult.error) {
      console.warn("[sync] hydrate classes failed", classResult.error.message);
    }
    if (setResult.error) {
      console.warn("[sync] hydrate problem sets failed", setResult.error.message);
    }

    const remoteClasses = (classResult.data ?? [])
      .map((row) => classFromRemoteRow(row as Record<string, unknown>))
      .filter((item): item is TeacherClass => Boolean(item));

    const remoteSets: SavedProblemSet[] = [];
    for (const row of setResult.data ?? []) {
      const id = String(row.id ?? "");
      if (isTeacherWorkspaceSetId(id)) continue;
      const payload = row.payload as SavedProblemSet | null;
      if (!payload || typeof payload !== "object" || !payload.id) continue;
      if (isTeacherWorkspaceSetId(payload.id)) continue;
      remoteSets.push(payload);
    }

    const mergedClasses = replace
      ? remoteClasses
      : mergeByRemoteId(loadTeacherClasses(), remoteClasses);
    saveTeacherClasses(mergedClasses);

    const classIds = mergedClasses.map((item) => item.id);
    let remoteAssignments: ClassAssignment[] = [];
    if (classIds.length > 0) {
      const { data: assignmentRows, error: assignmentError } = await supabase
        .from("class_assignments")
        .select("*")
        .in("class_id", classIds);
      if (assignmentError) {
        console.warn(
          "[sync] hydrate assignments failed",
          assignmentError.message,
        );
      } else {
        remoteAssignments = (assignmentRows ?? []).map((row) =>
          classAssignmentFromRemoteRow(row as Record<string, unknown>),
        );
      }
    }

    const assignmentSetIds = [
      ...new Set(remoteAssignments.map((item) => item.problemSetId)),
    ];
    const missingSetIds = assignmentSetIds.filter(
      (id) => !remoteSets.some((item) => item.id === id),
    );
    if (missingSetIds.length > 0) {
      const { data: extraSets, error: extraError } = await supabase
        .from("problem_sets")
        .select("id, payload")
        .in("id", missingSetIds);
      if (extraError) {
        console.warn(
          "[sync] hydrate extra problem sets failed",
          extraError.message,
        );
      } else {
        for (const row of extraSets ?? []) {
          const payload = row.payload as SavedProblemSet | null;
          if (!payload || typeof payload !== "object" || !payload.id) continue;
          if (isTeacherWorkspaceSetId(payload.id)) continue;
          remoteSets.push(payload);
        }
      }
    }

    persistProblemSets(
      replace
        ? remoteSets
        : mergeProblemSets(loadProblemSets(), remoteSets),
    );
    saveClassAssignments(
      replace
        ? remoteAssignments
        : mergeByRemoteId(loadClassAssignments(), remoteAssignments),
    );

    let profileRow = profileResult.data as {
      display_name?: string | null;
      praise_pass_threshold?: number | null;
    } | null;
    if (profileResult.error) {
      console.warn("[sync] hydrate profile failed", profileResult.error.message);
      const fallback = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", teacherId)
        .maybeSingle();
      profileRow = fallback.data;
    }

    applyTeacherWorkspaceLocal(workspace, { replace });

    if (profileRow) {
      const localProfile = loadTeacherProfile();
      const remoteName =
        typeof profileRow.display_name === "string"
          ? profileRow.display_name.trim()
          : "";
      const remoteThreshold = profileRow.praise_pass_threshold;
      const nextName =
        isCustomTeacherName(remoteName) &&
        (replace || !isCustomTeacherName(localProfile.name))
          ? remoteName
          : localProfile.name;
      const nextThreshold =
        typeof remoteThreshold === "number" && Number.isFinite(remoteThreshold)
          ? Math.min(100, Math.max(0, Math.round(remoteThreshold)))
          : localProfile.praisePassThreshold;
      saveTeacherProfile({
        name: nextName,
        praisePassThreshold: nextThreshold,
      });
    }

    for (const teacherClass of mergedClasses) {
      const enrollments = await fetchClassEnrollments(teacherClass.id);
      const local = loadClassStudents(teacherClass.id);
      const merged = mergeEnrolledStudents(local, enrollments);
      saveClassStudents(teacherClass.id, merged);
    }

    if (!isLocalDemoSession()) writeWorkspaceUid(teacherId);
    lastHydratedUid = teacherId;
    lastHydratedAt = Date.now();
    await syncTeacherWorkspaceRemote();
    return { ok: true };
  })()
    .catch((error) => {
      console.warn("[sync] hydrate teacher workspace failed", error);
      return { ok: false };
    })
    .finally(() => {
      hydrateInFlight = null;
    });

  return hydrateInFlight;
}
