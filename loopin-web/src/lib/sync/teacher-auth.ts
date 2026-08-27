import type { User } from "@supabase/supabase-js";
import {
  getSupabase,
  getSupabaseEnv,
  isSyncEnabled,
} from "@/lib/sync/supabase-client";
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

export type TeacherSocialProvider = "google" | "kakao" | "apple";

const SOCIAL_LABEL: Record<TeacherSocialProvider, string> = {
  google: "구글",
  kakao: "카카오",
  apple: "Apple",
};

/** 소셜 로그인을 마치고 돌아올 자리 */
export function teacherSocialRedirectUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

/**
 * **켜져 있는 provider만 시도한다.**
 *
 * `signInWithOAuth()`는 provider가 대시보드에 꺼져 있어도 에러를 돌려주지 않고
 * 브라우저를 Supabase authorize URL로 보내 버린다. 그러면 선생님은 거기서
 * `{"code":400,...,"msg":"Unsupported provider..."}` 라는 날것의 JSON을 보게 되고
 * 돌아올 버튼도 없다 (학생 앱에서 실제로 겪었다).
 *
 * 확인 자체가 실패하면 `null`을 주고 그냥 진행한다 — 점검 실패로 로그인을 막는 게 더 나쁘다.
 */
let enabledProviders: Set<string> | null = null;

async function isSocialProviderEnabled(
  provider: TeacherSocialProvider,
): Promise<boolean | null> {
  if (enabledProviders) return enabledProviders.has(provider);
  const env = getSupabaseEnv();
  if (!env) return null;
  try {
    const res = await fetch(`${env.url}/auth/v1/settings`, {
      headers: { apikey: env.anonKey },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { external?: Record<string, boolean> };
    if (!json.external) return null;
    enabledProviders = new Set(
      Object.entries(json.external)
        .filter(([, on]) => on === true)
        .map(([name]) => name),
    );
    return enabledProviders.has(provider);
  } catch {
    return null;
  }
}

/** OAuth 시작. 성공하면 브라우저가 provider로 떠나므로 이 뒤는 실행되지 않는다. */
export async function startTeacherSocialLogin(
  provider: TeacherSocialProvider,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, message: "서버 연결이 없어요. 환경변수를 확인해 주세요." };
  }
  if ((await isSocialProviderEnabled(provider)) === false) {
    return {
      ok: false,
      message: `${SOCIAL_LABEL[provider]} 로그인이 아직 준비되지 않았어요.`,
    };
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: teacherSocialRedirectUrl() },
  });
  if (error) {
    console.warn("[auth] teacher oauth start failed", error.message);
    return {
      ok: false,
      message: "로그인을 시작하지 못했어요. 잠시 후 다시 해 주세요.",
    };
  }
  return { ok: true };
}

/**
 * 소셜 로그인에서 돌아온 뒤 마무리.
 *
 * **역할을 반드시 확인한다.** 두 앱이 같은 Supabase 프로젝트를 쓰고 `profiles.role`은
 * 하나뿐이다. 학생 앱에서 만든 계정으로 교사 웹에 들어오면 그 사람이 반을 만들고
 * 과제를 낼 수 있게 되어 데이터가 뒤엉킨다. 세션 저장소는 앱마다 다르지만
 * **계정은 하나**라서 여기서 막아야 한다.
 */
export async function finishTeacherSocialLogin(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, message: "서버 연결이 없어요." };

  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user?.id) return { ok: false, message: "세션을 만들지 못했어요." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "student") {
    await supabase.auth.signOut();
    return {
      ok: false,
      message: "학생용 계정이에요. 선생님 계정으로 로그인해 주세요.",
    };
  }

  await ensureTeacherProfile(user.id);
  setLocalDemoSession(false);
  return { ok: true };
}

/*
  **이메일 로그인·회원가입은 2026-08-27에 걷어냈다.**

  소셜 로그인은 가입과 로그인이 나뉘지 않아서 이메일 폼이 그대로 중복이었고,
  비밀번호를 우리가 들고 있을 이유도 없어졌다. `signInTeacher` /
  `signUpTeacher` / `koreanAuthError`가 여기 있었다 — 되살릴 일이 있으면
  git 로그에서 꺼내 쓸 것.
*/
/**
 * 데모 로그인을 띄울지.
 *
 * **프로덕션에 열어두면 안 된다.** 누구나 클릭 한 번으로 교사 웹에 들어와 반을
 * 만들고 과제를 낼 수 있다 (2026-08-27 확인: 실제로 열려 있었다).
 * 개발 서버에서는 항상, 배포본에서는 `NEXT_PUBLIC_ALLOW_DEMO_LOGIN=true`일 때만.
 */
export function isDemoLoginAllowed(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_ALLOW_DEMO_LOGIN === "true"
  );
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
