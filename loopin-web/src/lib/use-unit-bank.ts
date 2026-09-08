"use client";

import { useEffect, useState } from "react";
import {
  ensureUnitLoaded,
  isUnitLoaded,
  subscribeProblemBank,
  type ProblemBankQuery,
} from "@/lib/problem-bank";

type ScopeInput = Pick<ProblemBankQuery, "grade" | "textbook"> | null | undefined;

/**
 * 화면이 보고 있는 **교과서 조각을 받아 두고**, 다 받아지면 다시 그리게 한다.
 *
 * 문제은행은 교과서 단위로 쪼개져 있다(`@/lib/problem-bank`). `getUnitContent`는 예전처럼
 * 동기라서, 조각이 오기 전에 그린 화면은 「단어 0개」로 보인다. 돌아온 값(`ready`)을
 * `useMemo` 의존성에 넣어 두면 조각이 도착한 순간 다시 계산된다.
 */
export function useUnitBank(scope: ScopeInput): boolean {
  const grade = scope?.grade ?? "";
  const textbook = scope?.textbook ?? "";
  const [, bump] = useState(0);

  useEffect(() => {
    return subscribeProblemBank(() => bump((n) => n + 1));
  }, []);

  useEffect(() => {
    if (!grade || !textbook) return;
    void ensureUnitLoaded({ grade, textbook });
  }, [grade, textbook]);

  if (!grade || !textbook) return true;
  return isUnitLoaded({ grade, textbook });
}
