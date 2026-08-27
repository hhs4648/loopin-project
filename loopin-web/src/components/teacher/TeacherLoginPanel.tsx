"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  canEnterTeacherApp,
  isDemoLoginAllowed,
  signInTeacherDemo,
  startTeacherSocialLogin,
  type TeacherSocialProvider,
} from "@/lib/sync/teacher-auth";
import { isSyncEnabled } from "@/lib/sync/supabase-client";

/**
 * 소셜 로그인 버튼.
 *
 * 색·로고는 각 제공사 브랜드 규정을 따라야 해서 토큰을 쓰지 않고 그대로 박는다
 * (이 파일의 다른 색들도 같은 이유로 하드코딩돼 있다).
 */
const SOCIAL_BUTTONS: {
  provider: TeacherSocialProvider;
  label: string;
  className: string;
  icon: ReactNode;
}[] = [
  {
    provider: "kakao",
    label: "카카오로 시작하기",
    className: "bg-[#FEE500] text-[#191600] hover:bg-[#f0d800]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 3C6.99 3 3 6.2 3 10.14c0 2.5 1.65 4.7 4.14 5.96l-.9 3.32c-.09.32.26.58.54.4l3.98-2.63c.4.04.82.06 1.24.06 5.01 0 9-3.2 9-7.11S17.01 3 12 3z" />
      </svg>
    ),
  },
  {
    provider: "google",
    label: "구글로 시작하기",
    className:
      "border border-[#E1E2E4] bg-white text-[#3D4148] hover:bg-[#F5F4F0]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
        <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
      </svg>
    ),
  },
  {
    provider: "apple",
    label: "Apple로 시작하기",
    className: "bg-[#15171A] text-white hover:bg-[#2b2f36]",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M16.36 12.72c.02 2.6 2.28 3.47 2.3 3.48-.02.06-.36 1.25-1.2 2.47-.72 1.06-1.47 2.11-2.66 2.13-1.16.02-1.54-.69-2.87-.69-1.33 0-1.75.67-2.85.71-1.14.05-2.01-1.14-2.74-2.2-1.5-2.17-2.64-6.12-1.1-8.8.76-1.32 2.12-2.16 3.6-2.18 1.12-.02 2.18.75 2.87.75.69 0 1.98-.93 3.34-.79.57.02 2.17.23 3.2 1.74-.08.05-1.91 1.12-1.89 3.38zM14.2 4.6c.61-.74 1.02-1.77.91-2.8-.88.04-1.94.59-2.57 1.32-.56.65-1.05 1.7-.92 2.7.98.08 1.98-.5 2.58-1.22z" />
      </svg>
    ),
  },
];

/**
 * 교사 로그인 화면.
 *
 * **소셜 로그인만 받는다.** 이메일·비밀번호 폼은 2026-08-27에 걷어냈다 —
 * 소셜은 가입과 로그인이 나뉘지 않아 회원가입 탭이 통째로 중복이었고,
 * 비밀번호를 우리가 보관할 이유도 없다.
 */
export function TeacherLoginPanel() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [socialPending, setSocialPending] =
    useState<TeacherSocialProvider | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const allowed = await canEnterTeacherApp();
      if (cancelled) return;
      if (allowed) {
        router.replace("/teacher");
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSocialLogin(provider: TeacherSocialProvider) {
    if (socialPending || busy) return;
    setError(null);
    setSocialPending(provider);
    // 성공하면 브라우저가 provider로 떠나므로 이 아래는 실행되지 않는다.
    const result = await startTeacherSocialLogin(provider);
    if (!result.ok) {
      setError(result.message);
      setSocialPending(null);
    }
  }

  async function onDemoLogin() {
    setError(null);
    setBusy(true);
    try {
      const result = await signInTeacherDemo();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.replace("/teacher");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F8F7] text-[15px] font-medium text-[#6B7280]">
        확인하는 중…
      </div>
    );
  }

  const syncOff = !isSyncEnabled();
  const showDemo = isDemoLoginAllowed();
  const disabled = busy || socialPending !== null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F8F7] px-6 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-[16px] text-[22px] font-bold text-white shadow-[0_4px_12px_rgba(26,167,242,0.28)]"
            style={{ backgroundColor: "#1AA7F2" }}
            aria-hidden
          >
            학
          </div>
          <h1 className="mt-5 text-[28px] font-bold tracking-tight text-[#15171A]">
            학습 선생님
          </h1>
          <p className="mt-2 text-[14px] font-medium text-[#6B7280]">
            사용하시는 계정으로 시작하세요. 따로 가입할 필요 없어요.
          </p>
        </div>

        <div className="rounded-[24px] border border-[#ECEAE4] bg-white px-7 py-8 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-2.5">
            {SOCIAL_BUTTONS.map((social) => (
              <button
                key={social.provider}
                type="button"
                aria-label={social.label}
                disabled={disabled}
                onClick={() => void onSocialLogin(social.provider)}
                className={`flex h-12 w-full items-center justify-center gap-2 rounded-[12px] text-[15px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#1AA7F2] disabled:opacity-60 ${social.className}`}
              >
                {social.icon}
                <span>
                  {socialPending === social.provider
                    ? "로그인 창으로 이동 중이에요…"
                    : social.label}
                </span>
              </button>
            ))}
          </div>

          {error ? (
            <p
              className="mt-5 flex items-start gap-2 rounded-[12px] bg-[#FEE7E7] px-3 py-2.5 text-[13px] font-semibold text-[#C52B2B]"
              role="alert"
            >
              <span aria-hidden>!</span>
              <span>{error}</span>
            </p>
          ) : null}

          {syncOff ? (
            <p
              className="mt-5 flex items-start gap-2 rounded-[12px] bg-[#FEF9E7] px-3 py-2.5 text-[13px] font-semibold text-[#A99A12]"
              role="status"
            >
              <span aria-hidden>!</span>
              <span>
                서버 연결이 없어요. 환경변수를 확인해 주세요.
              </span>
            </p>
          ) : null}

          {showDemo ? (
            <>
              <p className="my-5 text-center text-[12px] font-semibold text-[#9CA3AF]">
                또는
              </p>
              <button
                type="button"
                disabled={disabled}
                onClick={() => void onDemoLogin()}
                className="flex h-12 w-full items-center justify-center rounded-[12px] border border-dashed border-[#E1E2E4] bg-white text-[14px] font-bold text-[#6B7280] outline-none transition-colors hover:bg-[#F5F4F0] focus-visible:ring-2 focus-visible:ring-[#1AA7F2] disabled:bg-[#F3F4F6]"
              >
                {busy ? "잠시만요…" : "데모 로그인 (개발용)"}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
