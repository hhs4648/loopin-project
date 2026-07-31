import { getSupabase, isSyncEnabled } from "@/lib/sync/supabase-client";

const TEACHER_UID_KEY = "loopin-teacher-supabase-uid";

export async function ensureTeacherSession(): Promise<string | null> {
  if (!isSyncEnabled()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: existing } = await supabase.auth.getSession();
  if (existing.session?.user?.id) {
    await ensureTeacherProfile(existing.session.user.id);
    return existing.session.user.id;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    console.warn("[sync] teacher anonymous sign-in failed", error?.message);
    return null;
  }

  await ensureTeacherProfile(data.user.id);
  try {
    window.localStorage.setItem(TEACHER_UID_KEY, data.user.id);
  } catch {
    /* ignore */
  }
  return data.user.id;
}

/** 내 설정에서 저장할 때 이름·칭찬 캘린더 통과 기준 점수를 원격 profiles 행에 반영 (best-effort). */
export async function syncTeacherProfileRemote(updates: {
  displayName?: string;
  praisePassThreshold?: number;
}): Promise<void> {
  if (!isSyncEnabled()) return;
  const supabase = getSupabase();
  const teacherId = await ensureTeacherSession();
  if (!supabase || !teacherId) return;

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.displayName !== undefined) {
    payload.display_name = updates.displayName;
  }
  if (updates.praisePassThreshold !== undefined) {
    payload.praise_pass_threshold = updates.praisePassThreshold;
  }

  const { error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", teacherId);
  if (error) {
    console.warn("[sync] teacher profile update failed", error.message);
  }
}

async function ensureTeacherProfile(userId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (data?.id) return;

  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    role: "teacher",
    display_name: "교사",
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.warn("[sync] teacher profile upsert failed", error.message);
  }
}
