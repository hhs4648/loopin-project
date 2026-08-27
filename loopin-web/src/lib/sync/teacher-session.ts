import { getSupabase, isSyncEnabled } from "@/lib/sync/supabase-client";

const TEACHER_UID_KEY = "haksup-teacher-supabase-uid";

/**
 * 진행 중인 세션 확보. 이메일 로그인·데모(익명) 세션 모두 인정한다.
 */
let sessionInFlight: Promise<string | null> | null = null;

export async function ensureTeacherSession(): Promise<string | null> {
  if (!isSyncEnabled()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  if (sessionInFlight) return sessionInFlight;

  sessionInFlight = (async () => {
    const { data: existing } = await supabase.auth.getSession();
    const user = existing.session?.user;
    if (!user?.id) return null;

    await ensureTeacherProfile(user.id);
    try {
      window.localStorage.setItem(TEACHER_UID_KEY, user.id);
    } catch {
      /* ignore */
    }
    return user.id;
  })();

  try {
    return await sessionInFlight;
  } finally {
    // 성공했다면 이후 호출은 getSession()이 즉시 돌려주므로 캐시를 비워도 안전하고,
    // 실패했다면 다음 호출에서 다시 시도해야 하므로 반드시 비워야 한다.
    sessionInFlight = null;
  }
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

export async function ensureTeacherProfile(userId: string): Promise<void> {
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
