import { getKoreanHoliday } from "@/lib/korean-holidays";
import { parseIsoDateLocal } from "@/lib/teacher-classes";

export type AcademicHoliday = {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD · 하루면 startDate와 동일 */
  endDate: string;
};

export type AcademicScheduleSettings = {
  holidays: AcademicHoliday[];
  /**
   * true면 대한민국 공휴일에도 정규 시간표 수업을 자동 생성.
   * 기본 false — 공휴일에는 정규 수업 제외.
   */
  includePublicHolidays: boolean;
};

const STORAGE_KEY = "loopin-calendar-academic-schedule";

export const DEFAULT_ACADEMIC_SCHEDULE: AcademicScheduleSettings = {
  holidays: [],
  includePublicHolidays: false,
};

export function createAcademicHolidayId(): string {
  return `holiday-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function isValidIsoDate(value: string): boolean {
  return Boolean(parseIsoDateLocal(value));
}

function normalizeHoliday(raw: unknown): AcademicHoliday | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<AcademicHoliday>;
  if (
    typeof item.id !== "string" ||
    typeof item.name !== "string" ||
    typeof item.startDate !== "string" ||
    !isValidIsoDate(item.startDate)
  ) {
    return null;
  }
  const endDate =
    typeof item.endDate === "string" && isValidIsoDate(item.endDate)
      ? item.endDate
      : item.startDate;
  const startDate = item.startDate;
  return {
    id: item.id,
    name: item.name.trim() || "휴일",
    startDate,
    endDate: endDate < startDate ? startDate : endDate,
  };
}

export function loadAcademicSchedule(): AcademicScheduleSettings {
  if (typeof window === "undefined") return DEFAULT_ACADEMIC_SCHEDULE;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) || "null",
    ) as Partial<AcademicScheduleSettings> | null;
    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_ACADEMIC_SCHEDULE;
    }
    const holidays = Array.isArray(parsed.holidays)
      ? parsed.holidays
          .map(normalizeHoliday)
          .filter((h): h is AcademicHoliday => h !== null)
          .sort((a, b) => a.startDate.localeCompare(b.startDate))
      : [];
    return {
      holidays,
      includePublicHolidays: Boolean(parsed.includePublicHolidays),
    };
  } catch {
    return DEFAULT_ACADEMIC_SCHEDULE;
  }
}

export function saveAcademicSchedule(settings: AcademicScheduleSettings): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      holidays: settings.holidays
        .map(normalizeHoliday)
        .filter((h): h is AcademicHoliday => h !== null)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
      includePublicHolidays: Boolean(settings.includePublicHolidays),
    }),
  );
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function findSchoolHoliday(
  date: Date,
  holidays: AcademicHoliday[],
): AcademicHoliday | null {
  const key = toDateKey(date);
  for (const holiday of holidays) {
    if (key >= holiday.startDate && key <= holiday.endDate) {
      return holiday;
    }
  }
  return null;
}

export function getSchoolHolidayName(
  date: Date,
  holidays: AcademicHoliday[],
): string | null {
  return findSchoolHoliday(date, holidays)?.name ?? null;
}

/** 캘린더 빨간날 — 학교 휴일 또는 대한민국 공휴일 (수업 포함 설정과 무관) */
export function isCalendarRedDay(
  date: Date,
  holidays: AcademicHoliday[],
): boolean {
  return (
    findSchoolHoliday(date, holidays) !== null ||
    getKoreanHoliday(date) !== null
  );
}

/**
 * 날짜 라벨용 휴일명.
 * 학교 휴일이 있으면 우선, 없으면 공휴일명.
 */
export function getCalendarHolidayLabel(
  date: Date,
  holidays: AcademicHoliday[],
): string | null {
  const school = getSchoolHolidayName(date, holidays);
  if (school) return school;
  return getKoreanHoliday(date)?.name ?? null;
}

/**
 * 정규(자동 생성) 수업을 이 날짜에 만들지 않을지.
 * - 학교 휴일: 항상 제외
 * - 공휴일: includePublicHolidays 가 false 일 때만 제외
 * - 일회성 추가 수업은 이 함수와 무관하게 유지
 */
export function shouldSkipRecurringClass(
  date: Date,
  settings: AcademicScheduleSettings,
): boolean {
  if (findSchoolHoliday(date, settings.holidays)) return true;
  if (!settings.includePublicHolidays && getKoreanHoliday(date)) return true;
  return false;
}

export function formatHolidayRange(holiday: AcademicHoliday): string {
  if (holiday.startDate === holiday.endDate) {
    return formatIsoDateKo(holiday.startDate);
  }
  return `${formatIsoDateKo(holiday.startDate)} – ${formatIsoDateKo(holiday.endDate)}`;
}

function formatIsoDateKo(iso: string): string {
  const date = parseIsoDateLocal(iso);
  if (!date) return iso;
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}
