import type { User } from "@supabase/supabase-js";
import { getSupabase, isSyncEnabled } from "@/lib/sync/supabase-client";
import { ensureTeacherProfile } from "@/lib/sync/teacher-session";

export function isTeacherAccount(user: User | null | undefined): boolean {
  if (!user?.id) return false;
  return true;
}

const DEMO_SESSION_KEY = "haksup-teacher-demo-session";

export function isLocalDemoSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DEMO_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function setLocalDemoSession(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(DEMO_SESSION_KEY, "1");
    else window.localStorage.removeItem(DEMO_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export async function getTeacherAuthUser(): Promise<User | null> {
  if (!isSyncEnabled()) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

export async function canEnterTeacherApp(): Promise<boolean> {
  if (isLocalDemoSession()) return true;
  const user = await getTeacherAuthUser();
  return Boolean(user?.id);
}

function koreanAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않아요.";
  }
  if (lower.includes("email not confirmed")) {
    return "이메일 인증이 아직 끝나지 않았어요. 받은편지함을 확인해 주세요.";
  }
  if (lower.includes("user already registered")) {
    return "이미 가입된 이메일이에요. 로그인할까요?";
  }
  if (lower.includes("password")) {
    return "비밀번호는 6자 이상이어야 해요.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "시도가 너무 많아요. 잠시 후 다시 해 주세요.";
  }
  return message || "로그인에 실패했어요.";
}

export async function signInTeacher(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, message: "서버 연결이 없어요. 환경변수를 확인해 주세요." };
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error || !data.user) {
    return { ok: false, message: koreanAuthError(error?.message ?? "") };
  }
  if (!isTeacherAccount(data.user)) {
    await supabase.auth.signOut();
    return { ok: false, message: "선생님 계정으로 로그인해 주세요." };
  }
  await ensureTeacherProfile(data.user.id);
  setLocalDemoSession(false);
  return { ok: true };
}

export async function signUpTeacher(
  email: string,
  password: string,
  displayName: string,
): Promise<
  | { ok: true; needsEmailConfirm: boolean }
  | { ok: false; message: string }
> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, message: "서버 연결이 없어요. 환경변수를 확인해 주세요." };
  }
  const name = displayName.trim() || "교사";
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { role: "teacher", display_name: name },
    },
  });
  if (error) {
    return { ok: false, message: koreanAuthError(error.message) };
  }
  if (data.user) {
    await ensureTeacherProfile(data.user.id);
    if (name !== "교사") {
      await supabase
        .from("profiles")
        .update({
          display_name: name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.user.id);
    }
  }
  return { ok: true, needsEmailConfirm: !data.session };
}

/** 회원가입 없이 데모로 들어간다. 서버가 있으면 익명 세션, 없으면 이 브라우저만. */
export async function signInTeacherDemo(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const supabase = getSupabase();
  if (!supabase) {
    setLocalDemoSession(true);
    return { ok: true };
  }

  const { data: existing } = await supabase.auth.getSession();
  if (existing.session?.user?.id) {
    await ensureTeacherProfile(existing.session.user.id);
    setLocalDemoSession(true);
    return { ok: true };
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    setLocalDemoSession(true);
    if (error) {
      console.warn("[auth] demo anonymous sign-in failed", error.message);
    }
    return { ok: true };
  }
  await ensureTeacherProfile(data.user.id);
  setLocalDemoSession(true);
  return { ok: true };
}

export async function signOutTeacher(): Promise<void> {
  setLocalDemoSession(false);
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
}
