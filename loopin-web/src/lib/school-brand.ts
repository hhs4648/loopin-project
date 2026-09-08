import {
  CLASS_COLOR_THEMES,
  type ClassColorTheme,
  getColorTheme,
} from "@/lib/teacher-classes";
import { scheduleTeacherWorkspaceSync } from "@/lib/sync/teacher-workspace-schedule";

/** 학교(브랜드) 컬러 = 반 색상 팔레트 8종의 「반 색상」행 */
export const BRAND_COLOR_THEMES = CLASS_COLOR_THEMES;

export type SchoolMarkMode = "text" | "image";

export type SchoolBrand = {
  name: string;
  markMode: SchoolMarkMode;
  /** 최대 2자 — 비우면 색만 표시 */
  markText: string;
  /** data URL (선택) */
  markImageDataUrl?: string;
  colorThemeId: string;
};

const STORAGE_KEY = "haksup-school-brand";

export const DEFAULT_SCHOOL_BRAND: SchoolBrand = {
  name: "우리중학교",
  markMode: "text",
  markText: "",
  colorThemeId: "blue",
};

export function loadSchoolBrand(): SchoolBrand {
  if (typeof window === "undefined") return DEFAULT_SCHOOL_BRAND;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SCHOOL_BRAND;
    const parsed = JSON.parse(raw) as Partial<SchoolBrand>;
    return normalizeBrand(parsed);
  } catch {
    return DEFAULT_SCHOOL_BRAND;
  }
}

export function saveSchoolBrand(brand: SchoolBrand): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(brand));
  scheduleTeacherWorkspaceSync();
}

export function normalizeBrand(input: Partial<SchoolBrand>): SchoolBrand {
  const theme = getColorTheme(
    input.colorThemeId || DEFAULT_SCHOOL_BRAND.colorThemeId,
  );
  // 빈 문구 허용 — 기본값으로 '루'를 채우지 않음
  const markText = (input.markText ?? "").slice(0, 2);
  return {
    name: (input.name ?? DEFAULT_SCHOOL_BRAND.name).trim() || "우리중학교",
    markMode: input.markMode === "image" ? "image" : "text",
    markText,
    markImageDataUrl: input.markImageDataUrl,
    colorThemeId: theme.id,
  };
}

export function getBrandTheme(brand: SchoolBrand): ClassColorTheme {
  return getColorTheme(brand.colorThemeId);
}

export function getBrandDisplayMark(brand: SchoolBrand): string {
  return brand.markText.slice(0, 2);
}

export function brandsEqual(a: SchoolBrand, b: SchoolBrand): boolean {
  return (
    a.name === b.name &&
    a.markMode === b.markMode &&
    a.markText === b.markText &&
    (a.markImageDataUrl || "") === (b.markImageDataUrl || "") &&
    a.colorThemeId === b.colorThemeId
  );
}
