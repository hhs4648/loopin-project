import { getSupabase, isSyncEnabled } from "@/lib/sync/supabase-client";

const TEACHER_UID_KEY = "loopin-teacher-supabase-uid";

/**
 * 진행 중인 세션 확보 작업. **동시에 여러 번 호출돼도 익명 로그인은 한 번만** 하도록 잡아둔다.
 *
 * 이 가드가 없으면 화면 진입 시 여러 곳에서 동시에 부른 호출이 전부 「세션 없음」을 보고
 * 각자 `signInAnonymously()`를 실행한다. 익명 교사 계정이 여러 개 생기고 마지막 것이
 * localStorage를 덮어써서, **반을 만든 계정과 과제를 부여하는 계정이 달라질 수 있다.**
 * 그러면 `classes.teacher_id`가 안 맞아 RLS가 과제 저장을 막고, 학생 앱에는 과제가 오지 않는다.
 * (2026-08-06 배포본 `/teacher` 콜드 로드에서 signup이 2번 발생하는 것을 확인)
 */
let sessionInFlight: Promise<string | null> | null = null;

export async function ensureTeacherSession(): Promise<string | null> {
  if (!isSyncEnabled()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  // 이미 진행 중이면 그 결과를 같이 기다린다 — 두 번째 signInAnonymously를 막는다.
  if (sessionInFlight) return sessionInFlight;

  sessionInFlight = (async () => {
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
