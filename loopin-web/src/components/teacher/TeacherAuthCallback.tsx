"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { finishTeacherSocialLogin } from "@/lib/sync/teacher-auth";
import { hydrateTeacherWorkspace } from "@/lib/sync/teacher-hydrate";
import { getSupabase } from "@/lib/sync/supabase-client";

/**
 * 소셜 로그인에서 돌아오는 자리(`/auth/callback`).
 *
 * Supabase 클라이언트가 URL의 `?code=`를 세션으로 바꾸는 동안 잠깐 머문다.
 * 학생 앱에서 이 화면 때문에 하루를 날린 적이 있어서, 그때 배운 걸 처음부터 넣었다:
 *
 * 1. **취소 플래그를 쓰지 않는다.** StrictMode(개발)는 마운트를 두 번 도는데,
 *    1번이 시작하자마자 정리 함수가 죽이고 2번은 중복 가드에 걸려 아무것도 안 한다.
 *    그러면 누구도 로그인을 끝내지 않고 화면이 영원히 「로그인 중」에 갇힌다.
 * 2. **모든 await에 시간 제한이 있다.** supabase-js는 `navigator.locks`로 토큰
 *    접근을 직렬화하는데, 다른 탭이 락을 쥐면 `getSession()`이 아예 안 끝난다.
 * 3. **실패 사유를 화면에 남긴다.** 안 그러면 원인을 물어볼 방법이 없다.
 */
export function TeacherAuthCallback() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [stage, setStage] = useState("세션 확인 중");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      const supabase = getSupabase();
      if (!supabase) {
        setDetail("서버 연결이 없어요 (환경변수 확인)");
        setFailed(true);
        return;
      }

      // `detectSessionInUrl`이 코드를 교환하는 데 한 틱 이상 걸린다 — 잠깐씩 다시 본다.
      const hasSession = async () => {
        try {
          const result = await Promise.race([
            supabase.auth.getSession(),
            new Promise<null>((resolve) =>
              window.setTimeout(() => resolve(null), 800),
            ),
          ]);
          return Boolean(result?.data.session?.user?.id);
        } catch {
          return false;
        }
      };

      let ok = await hasSession();
      for (let tries = 0; !ok && tries < 20; tries += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 150));
        setStage(`세션 확인 중 (${tries + 1}/20)`);
        ok = await hasSession();
      }

      if (!ok) {
        setDetail("세션을 만들지 못했어요");
        setFailed(true);
        return;
      }

      setStage("계정 확인 중");
      const result = await finishTeacherSocialLogin();
      if (!result.ok) {
        setDetail(result.message);
        setFailed(true);
        return;
      }

      setStage("수업 불러오는 중");
      await Promise.race([
        hydrateTeacherWorkspace(),
        new Promise((resolve) => window.setTimeout(resolve, 12_000)),
      ]);

      router.replace("/teacher");
    })().catch((error) => {
      console.error("[auth/callback] 로그인 처리 실패", error);
      setDetail(error instanceof Error ? error.message : String(error));
      setFailed(true);
    });
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F8F7] px-6">
      <div className="flex w-full max-w-[420px] flex-col items-center text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-[16px] text-[22px] font-bold text-white shadow-[0_4px_12px_rgba(26,167,242,0.28)]"
          style={{ backgroundColor: "#1AA7F2" }}
          aria-hidden
        >
          학
        </div>

        {failed ? (
          <>
            <p className="mt-6 text-[16px] font-bold text-[#15171A]">
              로그인을 마치지 못했어요.
            </p>
            <p className="mt-2 text-[13px] font-medium leading-relaxed text-[#6B7280]">
              {detail ?? "알 수 없는 오류"} · 단계: {stage}
            </p>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="mt-6 h-12 rounded-[12px] bg-[#1AA7F2] px-6 text-[15px] font-bold text-white transition-colors hover:bg-[#1596d9]"
            >
              로그인으로 돌아가기
            </button>
          </>
        ) : (
          <>
            <p className="mt-6 text-[16px] font-bold text-[#15171A]">
              로그인 중이에요…
            </p>
            <p className="mt-2 text-[13px] font-medium text-[#9CA3AF]">
              {stage}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
