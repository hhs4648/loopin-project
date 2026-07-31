export type KoreanHoliday = {
  name: string;
};

const holidayCache = new Map<number, Map<string, KoreanHoliday>>();
const chineseLunarFormatter = (() => {
  try {
    return new Intl.DateTimeFormat("en-u-ca-chinese", {
      month: "numeric",
      day: "numeric",
    });
  } catch {
    return null;
  }
})();

const SPECIAL_HOLIDAYS: Record<number, Array<[number, number, string]>> = {
  2024: [
    [4, 10, "국회의원 선거일"],
    [10, 1, "임시공휴일"],
  ],
  2025: [
    [1, 27, "임시공휴일"],
    [6, 3, "대통령 선거일"],
  ],
  2026: [[6, 3, "전국동시지방선거일"]],
};

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function addHoliday(
  holidays: Map<string, KoreanHoliday>,
  date: Date,
  name: string,
): void {
  const key = toDateKey(date);
  const current = holidays.get(key);
  if (current?.name.includes(name)) return;
  holidays.set(key, {
    name: current ? `${current.name} · ${name}` : name,
  });
}

function findNextSubstituteDate(
  holidays: Map<string, KoreanHoliday>,
  from: Date,
): Date {
  let candidate = addDays(from, 1);
  while (
    candidate.getDay() === 0 ||
    candidate.getDay() === 6 ||
    holidays.has(toDateKey(candidate))
  ) {
    candidate = addDays(candidate, 1);
  }
  return candidate;
}

function lunarMonthDay(date: Date): { month: number; day: number } | null {
  if (!chineseLunarFormatter) return null;
  const parts = chineseLunarFormatter.formatToParts(date);
  const monthPart = parts.find((part) => part.type === "month")?.value;
  const dayPart = parts.find((part) => part.type === "day")?.value;
  if (!monthPart || !dayPart || !/^\d+$/.test(monthPart)) return null;
  return { month: Number(monthPart), day: Number(dayPart) };
}

function findLunarDate(
  year: number,
  targetMonth: number,
  targetDay: number,
): Date | null {
  const date = new Date(year, 0, 1);
  while (date.getFullYear() === year) {
    const lunar = lunarMonthDay(date);
    if (lunar?.month === targetMonth && lunar.day === targetDay) {
      return new Date(date);
    }
    date.setDate(date.getDate() + 1);
  }
  return null;
}

function buildKoreanHolidays(year: number): Map<string, KoreanHoliday> {
  const holidays = new Map<string, KoreanHoliday>();
  const fixed: Array<[number, number, string]> = [
    [1, 1, "신정"],
    [3, 1, "삼일절"],
    [5, 5, "어린이날"],
    [6, 6, "현충일"],
    [8, 15, "광복절"],
    [10, 3, "개천절"],
    [10, 9, "한글날"],
    [12, 25, "성탄절"],
  ];

  // 제헌절은 2008~2025년 제외되었다가 2026년부터 다시 공휴일로 지정됨
  if (year >= 2026) {
    fixed.push([7, 17, "제헌절"]);
  }

  for (const [month, day, name] of fixed) {
    addHoliday(holidays, new Date(year, month - 1, day), name);
  }
  for (const [month, day, name] of SPECIAL_HOLIDAYS[year] ?? []) {
    addHoliday(holidays, new Date(year, month - 1, day), name);
  }

  const seollal = findLunarDate(year, 1, 1);
  const buddhasBirthday = findLunarDate(year, 4, 8);
  const chuseok = findLunarDate(year, 8, 15);
  const seollalDays = seollal
    ? [addDays(seollal, -1), seollal, addDays(seollal, 1)]
    : [];
  const chuseokDays = chuseok
    ? [addDays(chuseok, -1), chuseok, addDays(chuseok, 1)]
    : [];

  seollalDays.forEach((date) => addHoliday(holidays, date, "설날 연휴"));
  if (buddhasBirthday) {
    addHoliday(holidays, buddhasBirthday, "부처님오신날");
  }
  chuseokDays.forEach((date) => addHoliday(holidays, date, "추석 연휴"));

  if (seollalDays.some((date) => date.getDay() === 0)) {
    addHoliday(
      holidays,
      findNextSubstituteDate(holidays, seollalDays[2]!),
      "설날 대체공휴일",
    );
  }
  if (chuseokDays.some((date) => date.getDay() === 0)) {
    addHoliday(
      holidays,
      findNextSubstituteDate(holidays, chuseokDays[2]!),
      "추석 대체공휴일",
    );
  }

  const substituteEligible = [
    new Date(year, 2, 1),
    new Date(year, 4, 5),
    buddhasBirthday,
    year >= 2026 ? new Date(year, 6, 17) : null,
    new Date(year, 7, 15),
    new Date(year, 9, 3),
    new Date(year, 9, 9),
    new Date(year, 11, 25),
  ].filter((date): date is Date => date !== null);
  const handled = new Set<string>();

  for (const date of substituteEligible) {
    const key = toDateKey(date);
    if (handled.has(key)) continue;
    handled.add(key);
    const holiday = holidays.get(key);
    const overlapsHoliday = (holiday?.name.split(" · ").length ?? 0) > 1;
    if (
      date.getDay() !== 0 &&
      date.getDay() !== 6 &&
      !overlapsHoliday
    ) {
      continue;
    }
    addHoliday(
      holidays,
      findNextSubstituteDate(holidays, date),
      `${holiday?.name ?? "공휴일"} 대체공휴일`,
    );
  }

  return holidays;
}

export function getKoreanHoliday(date: Date): KoreanHoliday | null {
  const year = date.getFullYear();
  let holidays = holidayCache.get(year);
  if (!holidays) {
    holidays = buildKoreanHolidays(year);
    holidayCache.set(year, holidays);
  }
  return holidays.get(toDateKey(date)) ?? null;
}

export function isKoreanRedDay(date: Date): boolean {
  return getKoreanHoliday(date) !== null;
}
