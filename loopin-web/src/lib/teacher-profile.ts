export type TeacherProfile = {
  /** 사이드바 「{이름} 선생님」·내 설정에 표시 */
  name: string;
  /** 칭찬 캘린더 통과(😊) / 아쉬움(😐) 판정 기준 점수 (0~100) */
  praisePassThreshold: number;
};

const STORAGE_KEY = "loopin-teacher-profile";

export const DEFAULT_PRAISE_PASS_THRESHOLD = 70;

export const DEFAULT_TEACHER_PROFILE: TeacherProfile = {
  name: "김선생",
  praisePassThreshold: DEFAULT_PRAISE_PASS_THRESHOLD,
};

export function loadTeacherProfile(): TeacherProfile {
  if (typeof window === "undefined") return DEFAULT_TEACHER_PROFILE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TEACHER_PROFILE;
    const parsed = JSON.parse(raw) as Partial<TeacherProfile>;
    return normalizeTeacherProfile(parsed);
  } catch {
    return DEFAULT_TEACHER_PROFILE;
  }
}

export function saveTeacherProfile(profile: TeacherProfile): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(normalizeTeacherProfile(profile)),
  );
}

export function normalizePraisePassThreshold(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return DEFAULT_PRAISE_PASS_THRESHOLD;
  return Math.min(100, Math.max(0, Math.round(num)));
}

export function normalizeTeacherProfile(
  input: Partial<TeacherProfile>,
): TeacherProfile {
  const name = (input.name ?? DEFAULT_TEACHER_PROFILE.name).trim();
  return {
    name: name || DEFAULT_TEACHER_PROFILE.name,
    praisePassThreshold: normalizePraisePassThreshold(
      input.praisePassThreshold ?? DEFAULT_PRAISE_PASS_THRESHOLD,
    ),
  };
}
