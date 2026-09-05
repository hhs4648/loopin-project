"use client";

import {
  loadCustomProblemBank,
  passageSentenceIdPrefix,
} from "@/lib/custom-problem-bank";
import { problemSetUnitKey } from "@/lib/problem-sets";

/**
 * 문제 제출 「본문 / 본문 뜻」을 학년·교과서·단원별로 기억한다.
 * 같은 범위를 다시 고르면 칸을 채워 둔다.
 */
const STORAGE_KEY = "haksup-unit-passages";

export type UnitPassageScope = {
  grade: string;
  textbook: string;
  unit: string;
};

export type UnitPassage = {
  english: string;
  korean: string;
};

type StoredUnitPassage = UnitPassage & { updatedAt: string };

function unitKey(scope: UnitPassageScope): string {
  return problemSetUnitKey(scope);
}

function isScope(scope: UnitPassageScope): boolean {
  return Boolean(
    scope.grade.trim() &&
      scope.textbook.trim() &&
      scope.unit.trim() &&
      scope.unit !== "단원 선택",
  );
}

function readAll(): Record<string, StoredUnitPassage> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) || "null",
    ) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, StoredUnitPassage> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      const row = value as Partial<StoredUnitPassage>;
      if (typeof row.english !== "string" || typeof row.korean !== "string") {
        continue;
      }
      out[key] = {
        english: row.english,
        korean: row.korean,
        updatedAt:
          typeof row.updatedAt === "string"
            ? row.updatedAt
            : new Date(0).toISOString(),
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(rows: Record<string, StoredUnitPassage>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

/** 예전에 「문장으로 나누기」로 만든 문장으로 본문 칸을 되돌린다. */
export function passageFromSplitSentences(
  scope: UnitPassageScope,
): UnitPassage | null {
  const prefix = passageSentenceIdPrefix(scope);
  const sentences = loadCustomProblemBank()
    .sentences.filter((item) => item.id.startsWith(prefix))
    .sort((a, b) => {
      const aN = Number(a.id.slice(prefix.length));
      const bN = Number(b.id.slice(prefix.length));
      if (Number.isFinite(aN) && Number.isFinite(bN) && aN !== bN) {
        return aN - bN;
      }
      return a.id.localeCompare(b.id);
    });
  if (sentences.length === 0) return null;
  return {
    english: sentences.map((item) => item.english).join("\n"),
    korean: sentences.map((item) => item.korean).join("\n"),
  };
}

export function loadUnitPassage(scope: UnitPassageScope): UnitPassage {
  if (!isScope(scope)) return { english: "", korean: "" };
  const stored = readAll()[unitKey(scope)];
  if (stored) {
    return { english: stored.english, korean: stored.korean };
  }
  return passageFromSplitSentences(scope) ?? { english: "", korean: "" };
}

export function saveUnitPassage(
  scope: UnitPassageScope,
  english: string,
  korean: string,
): void {
  if (!isScope(scope)) return;
  const key = unitKey(scope);
  const next = readAll();
  const trimmedEn = english.trim();
  const trimmedKo = korean.trim();
  if (!trimmedEn && !trimmedKo) {
    if (!(key in next)) return;
    delete next[key];
    writeAll(next);
    return;
  }
  next[key] = {
    english,
    korean,
    updatedAt: new Date().toISOString(),
  };
  writeAll(next);
}
