"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import {
  canEnterTeacherApp,
  signInTeacher,
  signInTeacherDemo,
  signUpTeacher,
} from "@/lib/sync/teacher-auth";
import { isSyncEnabled } from "@/lib/sync/supabase-client";

const FIELD_CLASS =
  "h-12 w-full rounded-[12px] border border-[#E1E2E4] bg-white px-3.5 text-[15px] font-medium text-[#15171A] outline-none transition-colors placeholder:font-normal placeholder:text-[#A8ADB5] focus:border-[#1AA7F2] focus:ring-2 focus:ring-[#1AA7F2]/20";

type Mode = "login" | "signup";

export function TeacherLoginPanel() {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();
  const nameId = useId();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("이메일 주소를 입력해 주세요.");
      return;
    }
    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 해요.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "login") {
        const result = await signInTeacher(trimmedEmail, password);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        router.replace("/teacher");
        return;
      }

      const result = await signUpTeacher(trimmedEmail, password, name);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (result.needsEmailConfirm) {
        setNotice(
          "가입 메일을 보냈어요. 받은편지함에서 확인한 뒤 로그인해 주세요.",
        );
        setMode("login");
        return;
      }
      router.replace("/teacher");
    } finally {
      setBusy(false);
    }
  }

  async function onDemoLogin() {
    setError(null);
    setNotice(null);
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
            데모 로그인으로 바로 들어가거나, 이메일로 로그인하세요.
          </p>
        </div>

        <form
          onSubmit={(event) => void onSubmit(event)}
          className="rounded-[24px] border border-[#ECEAE4] bg-white px-7 py-8 shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
        >
          <button
            type="button"
            disabled={busy}
            className="flex h-12 w-full items-center justify-center rounded-[12px] bg-[#1AA7F2] text-[15px] font-bold text-white outline-none transition-colors hover:bg-[#1596d9] focus-visible:ring-2 focus-visible:ring-[#1AA7F2] disabled:bg-[#D1D5DB] disabled:text-[#6B7280]"
            onClick={() => void onDemoLogin()}
          >
            {busy ? "잠시만요…" : "데모 로그인"}
          </button>

          <p className="my-5 text-center text-[12px] font-semibold text-[#9CA3AF]">
            또는 이메일
          </p>

          <div className="mb-6 grid grid-cols-2 rounded-[12px] bg-[#F5F4F0] p-1">
            <button
              type="button"
              className={`h-10 rounded-[10px] text-[14px] font-bold transition-colors ${
                mode === "login"
                  ? "bg-white text-[#15171A] shadow-[0_1px_3px_rgba(15,23,42,0.08)]"
                  : "text-[#6B7280]"
              }`}
              onClick={() => {
                setMode("login");
                setError(null);
                setNotice(null);
              }}
            >
              로그인
            </button>
            <button
              type="button"
              className={`h-10 rounded-[10px] text-[14px] font-bold transition-colors ${
                mode === "signup"
                  ? "bg-white text-[#15171A] shadow-[0_1px_3px_rgba(15,23,42,0.08)]"
                  : "text-[#6B7280]"
              }`}
              onClick={() => {
                setMode("signup");
                setError(null);
                setNotice(null);
              }}
            >
              회원가입
            </button>
          </div>

          {mode === "signup" ? (
            <label className="mb-4 block" htmlFor={nameId}>
              <span className="mb-1.5 block text-[13px] font-semibold text-[#4A4843]">
                이름
              </span>
              <input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={FIELD_CLASS}
                autoComplete="name"
                placeholder="홍길동"
              />
            </label>
          ) : null}

          <label className="mb-4 block" htmlFor={emailId}>
            <span className="mb-1.5 block text-[13px] font-semibold text-[#4A4843]">
              이메일
            </span>
            <input
              id={emailId}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={FIELD_CLASS}
              autoComplete="email"
              placeholder="teacher@school.kr"
              required
            />
          </label>

          <label className="mb-5 block" htmlFor={passwordId}>
            <span className="mb-1.5 block text-[13px] font-semibold text-[#4A4843]">
              비밀번호
            </span>
            <input
              id={passwordId}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={FIELD_CLASS}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              placeholder="6자 이상"
              required
            />
          </label>

          {error ? (
            <p
              className="mb-4 flex items-start gap-2 rounded-[12px] bg-[#FEE7E7] px-3 py-2.5 text-[13px] font-semibold text-[#C52B2B]"
              role="alert"
            >
              <span aria-hidden>!</span>
              <span>{error}</span>
            </p>
          ) : null}

          {notice ? (
            <p
              className="mb-4 flex items-start gap-2 rounded-[12px] bg-[#E7F5FE] px-3 py-2.5 text-[13px] font-semibold text-[#1274A9]"
              role="status"
            >
              <span aria-hidden>i</span>
              <span>{notice}</span>
            </p>
          ) : null}

          {syncOff ? (
            <p
              className="mb-4 flex items-start gap-2 rounded-[12px] bg-[#FEF9E7] px-3 py-2.5 text-[13px] font-semibold text-[#A99A12]"
              role="status"
            >
              <span aria-hidden>!</span>
              <span>
                서버 연결이 없어도 데모 로그인으로 이 브라우저에서 볼 수 있어요.
              </span>
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy || syncOff}
            className="flex h-12 w-full items-center justify-center rounded-[12px] border border-[#E1E2E4] bg-white text-[15px] font-bold text-[#3D4148] outline-none transition-colors hover:bg-[#F5F4F0] focus-visible:ring-2 focus-visible:ring-[#1AA7F2] disabled:bg-[#F3F4F6] disabled:text-[#6B7280]"
          >
            {busy
              ? "잠시만요…"
              : mode === "login"
                ? "로그인"
                : "계정 만들기"}
          </button>
        </form>
      </div>
    </div>
  );
}
