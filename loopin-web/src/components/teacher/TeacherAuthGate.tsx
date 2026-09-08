"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ensureUnitsLoaded } from "@/lib/problem-bank";
import { loadProblemSets } from "@/lib/problem-sets";
import { canEnterTeacherApp } from "@/lib/sync/teacher-auth";
import { hydrateTeacherWorkspace } from "@/lib/sync/teacher-hydrate";
import { isSyncEnabled } from "@/lib/sync/supabase-client";

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
      if (isSyncEnabled()) {
        await Promise.race([
          hydrateTeacherWorkspace(),
          new Promise((resolve) => window.setTimeout(resolve, 12_000)),
        ]);
      }
      if (cancelled) return;
      /*
        저장된 과제는 **지금 보고 있는 단원이 아니어도** 문제은행을 읽는다
        (학생 앱 동기화 스냅샷·오답 학습지·반 과제 목록). 문제은행이 교과서 단위로
        쪼개진 뒤로는 그 조각이 없으면 조용히 빈 스냅샷이 나가므로, 저장된 과제가
        쓰는 교과서를 여기서 미리 받아 둔다. 화면을 막지는 않는다.
      */
      void ensureUnitsLoaded(loadProblemSets());
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-[15px] font-medium text-[#6B7280]">
        불러오는 중…
      </div>
    );
  }

  return children;
}
