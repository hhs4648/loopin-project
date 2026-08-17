import {
  loadOneOffLessons,
  type OneOffLesson,
} from "./calendar-one-off-lessons";
import {
  parseIsoDateLocal,
  WEEKDAY_ORDER,
  type TeacherClass,
} from "./teacher-classes";

/**
 * 과제 **공개 시각** — 학생 앱에 언제부터 보일지.
 *
 * 기준은 「수업일의 **수업 종료 시각**」이다. 숙제는 수업이 끝나고 나가는 것이라,
 * 수업 전에 문제가 보이면 미리 답을 맞춰 보고 들어올 수 있다. `content_snapshot`에
 * 정답까지 들어 있어서 더 그렇다.
 *
 * 계산해서 **절대 시각으로 박아 둔다**(`class_assignments.open_at`). 읽는 쪽에서
 * 시간대를 다시 따질 필요가 없고, 나중에 반 시간표를 고쳐도 이미 낸 과제의 공개
 * 시점이 흔들리지 않는다.
 */

/** 한국 표준시 고정(+09:00) — 서버·학생 기기 시간대와 무관하게 같은 값이 나온다 */
const KST_OFFSET = "+09:00";

/** "HH:MM" → 분. 형식이 아니면 null */
function parseHhMm(value?: string | null): number | null {
  const m = value?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * 그 반의 **그 날짜** 수업 종료 시각 "HH:MM".
 *
 * 1) 그날 잡힌 일회성 수업 → 그 수업의 종료 시각 (정규 시간표보다 우선)
 * 2) 요일별 시간표(`per-day`) → 그 요일의 종료 시각
 * 3) 통합 시간표 → 공통 종료 시각
 * 4) 아무것도 없으면 null
 */
export function resolveLessonEndTime(
  teacherClass: TeacherClass,
  lessonDate: string,
  oneOffLessons?: OneOffLesson[],
): string | null {
  const oneOffs = oneOffLessons ?? loadOneOffLessons();
  const oneOff = oneOffs.find(
    (lesson) =>
      lesson.classId === teacherClass.id && lesson.date === lessonDate,
  );
  if (parseHhMm(oneOff?.end) != null) return oneOff!.end;

  const date = parseIsoDateLocal(lessonDate);
  if (!date) return null;
  // JS는 일요일이 0 — `WEEKDAY_ORDER`는 월요일부터다
  const weekday = WEEKDAY_ORDER[(date.getDay() + 6) % 7];

  if (teacherClass.scheduleMode === "per-day") {
    const perDay = weekday ? teacherClass.dayTimes?.[weekday]?.end : null;
    if (parseHhMm(perDay) != null) return perDay!;
  }
  const unified = teacherClass.unifiedTime?.end;
  if (parseHhMm(unified) != null) return unified!;
  return null;
}

/**
 * 공개 시각을 ISO 문자열로. 수업 종료 시각을 모르면 **그날 자정(KST)**.
 *
 * 시간표를 아직 안 채운 반이 있어서 null을 그냥 흘리면 「공개 시각 없음 = 즉시 공개」가
 * 되어 버린다. 그러면 날짜로 미루는 것조차 안 된다. 최소한 날짜는 지키도록 자정으로
 * 둔다 — 시간까지 맞추려면 반 시간표를 채우면 된다.
 */
export function resolveAssignmentOpenAt(
  teacherClass: TeacherClass | undefined,
  lessonDate: string,
  oneOffLessons?: OneOffLesson[],
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lessonDate)) return null;
  const end = teacherClass
    ? resolveLessonEndTime(teacherClass, lessonDate, oneOffLessons)
    : null;
  const hhmm = end ?? "00:00";
  const padded = hhmm.length === 4 ? `0${hhmm}` : hhmm;
  const parsed = new Date(`${lessonDate}T${padded}:00${KST_OFFSET}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/** 아직 공개 전인가 (교사 화면에서 「예약됨」 표시용) */
export function isScheduledForLater(
  openAt?: string | null,
  now: Date = new Date(),
): boolean {
  if (!openAt) return false;
  const at = new Date(openAt);
  if (Number.isNaN(at.getTime())) return false;
  return at.getTime() > now.getTime();
}

/** 「8월 13일 20:00 공개」 — 교사 화면 안내 문구 */
export function formatOpenAtKo(openAt?: string | null): string | null {
  if (!openAt) return null;
  const at = new Date(openAt);
  if (Number.isNaN(at.getTime())) return null;
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
  return `${parts} 공개`;
}
