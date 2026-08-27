import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabaseEnv(): {
  url: string;
  anonKey: string;
} | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSyncEnabled(): boolean {
  return getSupabaseEnv() != null;
}

export function getSupabase(): SupabaseClient | null {
  const env = getSupabaseEnv();
  if (!env) return null;
  if (!client) {
    client = createClient(env.url, env.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        /*
          소셜 로그인에서 돌아올 때 URL에 붙어 오는 `?code=`를 세션으로 바꿔야 한다.
          예전엔 이메일·익명 로그인만 써서 꺼 두었는데, 켜지 않으면 `/auth/callback`이
          영원히 세션을 못 찾는다 (2026-08-27 소셜 로그인 도입).
        */
        detectSessionInUrl: true,
        flowType: "pkce",
        /*
          **학생 앱과 다른 키를 써야 한다.** 같은 브라우저에서 선생님이 학생 화면을
          열어 보는 일이 흔한데, 키가 같으면 나중에 로그인한 쪽이 앞의 세션을 덮어쓴다.
        */
        storageKey: "haksup-teacher-supabase-auth",
      },
    });
  }
  return client;
}
