"use client";

/**
 * 반 홈 「이어서 내기」를 교사가 **직접 지운** 기록.
 *
 * 진도 자체(부여한 과제)는 지우지 않는다. 카드만 숨긴다.
 * 같은 단원을 **다시 나눠 내면** `latestAssignedAt`이 더 커져 카드가 다시 나온다.
 */

const STORAGE_KEY = "haksup-unit-progress-dismissed";

export type DismissedUnitProgress = {
  classId: string;
  unitKey: string;
  dismissedAt: string;
};

function readAll(): DismissedUnitProgress[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is DismissedUnitProgress =>
        Boolean(row) &&
        typeof row === "object" &&
        typeof (row as DismissedUnitProgress).classId === "string" &&
        typeof (row as DismissedUnitProgress).unitKey === "string" &&
        typeof (row as DismissedUnitProgress).dismissedAt === "string",
    );
  } catch {
    return [];
  }
}

function writeAll(rows: DismissedUnitProgress[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

/** 이 단원 카드를 숨긴 뒤인가. 그 뒤에 같은 단원을 다시 냈으면 false. */
export function isUnitProgressDismissed(
  classId: string,
  unitKey: string,
  latestAssignedAt: string,
): boolean {
  const row = readAll().find(
    (item) => item.classId === classId && item.unitKey === unitKey,
  );
  if (!row) return false;
  return row.dismissedAt >= latestAssignedAt;
}

export function dismissUnitProgress(classId: string, unitKey: string): void {
  const dismissedAt = new Date().toISOString();
  const next = readAll().filter(
    (item) => !(item.classId === classId && item.unitKey === unitKey),
  );
  next.push({ classId, unitKey, dismissedAt });
  writeAll(next);
}
