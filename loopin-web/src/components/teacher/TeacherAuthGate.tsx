"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { canEnterTeacherApp } from "@/lib/sync/teacher-auth";

export function TeacherAuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const allowed = await canEnterTeacherApp();
      if (cancelled) return;
      if (!allowed) {
        router.replace("/login");
        return;
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-[15px] font-medium text-[#6B7280]">
        확인하는 중…
      </div>
    );
  }

  return children;
}
