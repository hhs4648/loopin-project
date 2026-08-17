"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CLASS_TIME } from "@/components/teacher/ClassScheduleFields";
import {
  CAL_GRID,
  CAL_WEEKDAYS,
  addDays,
  applyCalendarMove,
  buildCalendarEvents,
  calendarContentHeight,
  calendarEventLabelsFromOneOff,
  calendarViewportHeight,
  currentTimeContentY,
  eventRect,
  hhmmToMinutes,
  isDateInWeek,
  isSameDay,
  pointToDayAndStart,
  type CalendarClassEvent,
} from "@/lib/calendar-layout";
import {
  DEFAULT_ACADEMIC_SCHEDULE,
  type AcademicScheduleSettings,
} from "@/lib/calendar-academic-schedule";
import {
  getOneOffLessonClass,
  isOneOffLessonInRange,
  toLocalIsoDate,
  type OneOffLesson,
} from "@/lib/calendar-one-off-lessons";
import {
  parseIsoDateLocal,
  type TeacherClass,
  type Weekday,
} from "@/lib/teacher-classes";

export type CalendarSlotPreset = {
  date: string;
  day: Weekday;
  start: string;
  end: string;
};

/** 캘린더에 이미 있는 수업 클릭 시 — 빈 칸과 동일 팝업에 채울 값 */
export type CalendarLessonTarget = {
  classId: string;
  date: string;
  day: Weekday;
  start: string;
  end: string;
  oneOffLessonId?: string;
};

type CalendarEventsOverlayProps = {
  classes: TeacherClass[];
  oneOffLessons: OneOffLesson[];
  academicSchedule?: AcademicScheduleSettings;
  weekMonday: Date;
  onMoveClass: (next: TeacherClass) => void;
  onMoveOneOff: (
    lessonId: string,
    next: Pick<OneOffLesson, "date" | "start" | "end">,
  ) => void;
  onEditLesson: (target: CalendarLessonTarget) => void;
  onEmptySlot: (slot: CalendarSlotPreset) => void;
};

type DragState = {
  key: string;
  classId: string;
  oneOffLessonId?: string;
  fromDay: Weekday;
  dayIndex: number;
  start: string;
  end: string;
  durationMin: number;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  left: number;
  top: number;
  width: number;
  height: number;
  className: string;
  lessonTitle?: string;
  colors: TeacherClass["colors"];
  startLabel: string;
  originX: number;
  originY: number;
  activated: boolean;
  moved: boolean;
};

const DRAG_THRESHOLD = 6;
const LONG_PRESS_MS = 100;
const FRAME_W = 1557;
const FRAME_H = 973;
/** 시간 라벨이 overflow로 잘리지 않게 */
const CONTENT_PAD_TOP = 10;
const CONTENT_PAD_BOTTOM = 10;
const NOW_TICK_MS = 30_000;

function useNow(tickMs = NOW_TICK_MS) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);
  return now;
}

/**
 * SVG 데모 일정을 가리고, 담당 반 수업 일정을 표시.
 * 06:00–22:00 그리드 · 뷰포트 세로 스크롤(스크롤바 숨김) · 드래그/클릭.
 */
export function CalendarEventsOverlay({
  classes,
  oneOffLessons,
  academicSchedule = DEFAULT_ACADEMIC_SCHEDULE,
  weekMonday,
  onMoveClass,
  onMoveOneOff,
  onEditLesson,
  onEmptySlot,
}: CalendarEventsOverlayProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  /*
    드래그 핸들러가 **항상 최신 값**을 보게 하려고 ref에 담아 둔다.
    핸들러를 의존성에 넣으면 값이 바뀔 때마다 포인터 구독을 다시 걸어야 해서
    드래그 도중에 끊긴다.

    갱신은 **렌더가 아니라 커밋 뒤**에 한다. 렌더 중에 ref를 쓰면, 버려지는 렌더가
    남긴 값이 그대로 남을 수 있다(React가 렌더를 중단·재시도할 수 있다).
    이 ref들은 포인터 이벤트에서만 읽으므로 커밋 뒤 갱신으로 충분하다.
  */
  const classesRef = useRef(classes);
  const weekMondayRef = useRef(weekMonday);
  const onMoveClassRef = useRef(onMoveClass);
  const onMoveOneOffRef = useRef(onMoveOneOff);
  const onEditLessonRef = useRef(onEditLesson);
  const onEmptySlotRef = useRef(onEmptySlot);
  useEffect(() => {
    classesRef.current = classes;
    weekMondayRef.current = weekMonday;
    onMoveClassRef.current = onMoveClass;
    onMoveOneOffRef.current = onMoveOneOff;
    onEditLessonRef.current = onEditLesson;
    onEmptySlotRef.current = onEmptySlot;
  });
  const longPressTimerRef = useRef<number | null>(null);

  const [drag, setDrag] = useState<DragState | null>(null);
  /*
    드래그 상태를 ref에도 비춰 둔다. 포인터 핸들러는 재구독 없이 최신 값을 봐야 한다.
    핸들러는 필요할 때 `dragRef.current`를 직접 쓰고(아래 261·298행), 여기서는
    **커밋 뒤에** 상태와 다시 맞춘다 — 렌더 중에 쓰면 버려진 렌더의 값이 남는다.
  */
  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);
  const now = useNow();

  const events = useMemo(() => {
    const recurring = buildCalendarEvents(
      classes,
      weekMonday,
      academicSchedule,
    );
    const weekEnd = addDays(weekMonday, 6);
    const added: CalendarClassEvent[] = [];
    for (const lesson of oneOffLessons) {
      if (!isOneOffLessonInRange(lesson, weekMonday, weekEnd)) continue;
      const date = parseIsoDateLocal(lesson.date);
      const teacherClass = getOneOffLessonClass(lesson, classes);
      if (!date || !teacherClass) continue;
      const dayIndex = Math.round(
        (date.getTime() - weekMonday.getTime()) / (24 * 60 * 60 * 1000),
      );
      const day = CAL_WEEKDAYS[dayIndex];
      const startMin = hhmmToMinutes(lesson.start);
      const endMin = hhmmToMinutes(lesson.end);
      if (
        !day ||
        !Number.isFinite(startMin) ||
        !Number.isFinite(endMin) ||
        endMin <= startMin
      ) {
        continue;
      }
      added.push({
        key: `one-off:${lesson.id}`,
        classId: teacherClass.id,
        oneOffLessonId: lesson.id,
        ...calendarEventLabelsFromOneOff(lesson, teacherClass),
        day,
        dayIndex,
        start: lesson.start,
        end: lesson.end,
        startMin,
        endMin,
        colors: teacherClass.colors,
      });
    }
    return [...recurring, ...added];
  }, [classes, oneOffLessons, weekMonday, academicSchedule]);
  const viewportH = calendarViewportHeight();
  const contentH = calendarContentHeight();
  const gutterW = CAL_GRID.left - CAL_GRID.gutterLeft;
  const gridW = CAL_GRID.right - CAL_GRID.left;
  const panelW = CAL_GRID.right - CAL_GRID.gutterLeft;
  const hourSpan = CAL_GRID.visibleEndHour - CAL_GRID.visibleStartHour;
  const hourLines = hourSpan + 1;
  const nowContentY = useMemo(() => {
    if (!isDateInWeek(now, weekMonday)) return null;
    return currentTimeContentY(now);
  }, [now, weekMonday]);
  /** 오늘이 이번 주에 있으면 그 요일 칸에 연한 회색 음영을 깐다 */
  const todayDayIndex = useMemo(() => {
    if (!isDateInWeek(now, weekMonday)) return -1;
    return CAL_WEEKDAYS.findIndex((_, i) => isSameDay(addDays(weekMonday, i), now));
  }, [now, weekMonday]);

  const clientToContent = useCallback((clientX: number, clientY: number) => {
    const el = frameRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const sx = r.width / FRAME_W;
    const sy = r.height / FRAME_H;
    const frameX = (clientX - r.left) / sx;
    const frameY = (clientY - r.top) / sy;
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    return {
      x: frameX,
      y: frameY - CAL_GRID.top + scrollTop - CONTENT_PAD_TOP,
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hourOffset =
      CAL_GRID.initialScrollHour - CAL_GRID.visibleStartHour;
    el.scrollTop = Math.max(
      0,
      CONTENT_PAD_TOP + hourOffset * CAL_GRID.rowHeight,
    );
  }, []);

  useEffect(
    () => () => {
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
      }
    },
    [],
  );

  const clearLongPressTimer = () => {
    if (!longPressTimerRef.current) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const updateDrag = (next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const onCardPointerDown = (
    e: React.PointerEvent,
    ev: CalendarClassEvent,
    rect: { left: number; top: number; width: number; height: number },
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const local = clientToContent(e.clientX, e.clientY);
    const pending: DragState = {
      key: ev.key,
      classId: ev.classId,
      oneOffLessonId: ev.oneOffLessonId,
      fromDay: ev.day,
      dayIndex: ev.dayIndex,
      start: ev.start,
      end: ev.end,
      durationMin: Math.max(5, ev.endMin - ev.startMin),
      pointerId: e.pointerId,
      offsetX: local.x - rect.left,
      offsetY: local.y - rect.top,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      className: ev.className,
      lessonTitle: ev.lessonTitle,
      colors: ev.colors,
      startLabel: ev.start,
      originX: local.x,
      originY: local.y,
      activated: false,
      moved: false,
    };
    dragRef.current = pending;
    setDrag(pending);
    e.currentTarget.setPointerCapture(e.pointerId);
    longPressTimerRef.current = window.setTimeout(() => {
      const current = dragRef.current;
      if (current?.key === ev.key && current.pointerId === e.pointerId) {
        updateDrag({ ...current, activated: true });
      }
      longPressTimerRef.current = null;
    }, LONG_PRESS_MS);
  };

  const onCardPointerMove = (e: React.PointerEvent) => {
    const current = dragRef.current;
    if (!current || e.pointerId !== current.pointerId) return;
    const local = clientToContent(e.clientX, e.clientY);
    const dist = Math.hypot(
      local.x - current.originX,
      local.y - current.originY,
    );
    if (!current.activated) {
      if (dist >= DRAG_THRESHOLD) {
        clearLongPressTimer();
        updateDrag(null);
      }
      return;
    }
    updateDrag({
      ...current,
      moved: current.moved || dist >= DRAG_THRESHOLD,
      left: local.x - current.offsetX,
      top: local.y - current.offsetY,
    });
  };

  const onCardPointerUp = (e: React.PointerEvent) => {
    const current = dragRef.current;
    if (!current || e.pointerId !== current.pointerId) return;
    clearLongPressTimer();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    if (!current.activated) {
      onEditLessonRef.current({
        classId: current.classId,
        date: toLocalIsoDate(
          addDays(weekMondayRef.current, current.dayIndex),
        ),
        day: current.fromDay,
        start: current.start,
        end: current.end,
        oneOffLessonId: current.oneOffLessonId,
      });
      updateDrag(null);
      return;
    }
    if (!current.moved) {
      updateDrag(null);
      return;
    }

    const local = clientToContent(e.clientX, e.clientY);
    const placed = pointToDayAndStart(
      local.x - current.offsetX + current.width / 2,
      local.y - current.offsetY,
      current.durationMin,
    );
    if (current.oneOffLessonId) {
      onMoveOneOffRef.current(current.oneOffLessonId, {
        date: toLocalIsoDate(addDays(weekMonday, placed.dayIndex)),
        start: placed.start,
        end: placed.end,
      });
    } else {
      const target = classesRef.current.find(
        (teacherClass) => teacherClass.id === current.classId,
      );
      if (target) {
        onMoveClassRef.current(
          applyCalendarMove(target, current.fromDay, placed.day, {
            start: placed.start,
            end: placed.end,
          }),
        );
      }
    }
    updateDrag(null);
  };

  const onCardPointerCancel = (e: React.PointerEvent) => {
    const current = dragRef.current;
    if (!current || e.pointerId !== current.pointerId) return;
    clearLongPressTimer();
    updateDrag(null);
  };

  const onGridPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) return;
    if (e.target !== e.currentTarget) return;
    const local = clientToContent(e.clientX, e.clientY);
    const duration =
      hhmmToMinutes(DEFAULT_CLASS_TIME.end) -
      hhmmToMinutes(DEFAULT_CLASS_TIME.start);
    const placed = pointToDayAndStart(
      local.x,
      local.y,
      Number.isFinite(duration) && duration > 0 ? duration : 50,
    );
    onEmptySlotRef.current({
      date: toLocalIsoDate(addDays(weekMonday, placed.dayIndex)),
      day: placed.day,
      start: placed.start,
      end: placed.end,
    });
  };

  return (
    <div
      ref={frameRef}
      className="pointer-events-none absolute inset-0 z-20"
      aria-label="주간 캘린더 일정"
    >
      {/* SVG 시간축·그리드·헤더 아래 잔여 선 가림 */}
      <div
        className="pointer-events-none absolute bg-white"
        style={{
          left: CAL_GRID.gutterLeft,
          top: CAL_GRID.headerTop + CAL_GRID.headerHeight,
          width: panelW,
          height:
            CAL_GRID.top -
            (CAL_GRID.headerTop + CAL_GRID.headerHeight) +
            viewportH,
        }}
        aria-hidden
      />

      <div
        ref={scrollRef}
        className="no-scrollbar pointer-events-auto absolute overflow-x-hidden overflow-y-auto overscroll-contain"
        style={{
          left: CAL_GRID.gutterLeft,
          top: CAL_GRID.top,
          width: panelW,
          height: viewportH,
        }}
        aria-label="주간 시간표 · 스크롤하여 06시–22시"
      >
        <div
          className="relative"
          style={{
            width: panelW,
            height: contentH + CONTENT_PAD_TOP + CONTENT_PAD_BOTTOM,
          }}
        >
          {/* 시간 라벨 */}
          {Array.from({ length: hourLines }).map((_, i) => {
            const hour = CAL_GRID.visibleStartHour + i;
            return (
              <div
                key={`label-${hour}`}
                className="pointer-events-none absolute flex items-start justify-end pr-2"
                style={{
                  left: 0,
                  top: CONTENT_PAD_TOP + i * CAL_GRID.rowHeight - 7,
                  width: gutterW,
                  height: 16,
                }}
                aria-hidden
              >
                <span className="text-[12px] font-semibold tabular-nums text-[#9CA3AF]">
                  {hour}
                </span>
              </div>
            );
          })}

          <div
            className="absolute cursor-pointer"
            style={{
              left: gutterW,
              top: CONTENT_PAD_TOP,
              width: gridW,
              height: contentH,
            }}
            onPointerUp={onGridPointerUp}
            aria-label="빈 칸을 눌러 수업 추가"
          >
            {todayDayIndex >= 0 && (
              <div
                className="pointer-events-none absolute top-0 bottom-0"
                style={{
                  left: CAL_GRID.dayStarts[todayDayIndex]! - CAL_GRID.left,
                  width: CAL_GRID.colWidth,
                  borderRadius: 15.01,
                  backgroundColor: "rgba(17, 23, 26, 0.035)",
                }}
                aria-hidden
              />
            )}
            {Array.from({ length: hourLines }).map((_, i) => (
              <div
                key={`hour-${i}`}
                className="pointer-events-none absolute left-0 right-0"
                style={{
                  top: i * CAL_GRID.rowHeight,
                  height: 1,
                  backgroundColor: "rgba(209, 207, 204, 0.12)",
                }}
                aria-hidden
              />
            ))}
            {CAL_WEEKDAYS.map((_, i) =>
              i === 0 ? null : (
                <div
                  key={`day-${i}`}
                  className="pointer-events-none absolute top-0 bottom-0"
                  style={{
                    left: CAL_GRID.dayStarts[i]! - CAL_GRID.left,
                    width: 1,
                    backgroundColor: "rgba(209, 207, 204, 0.09)",
                  }}
                  aria-hidden
                />
              ),
            )}

            {events.map((ev) => {
              const rect = eventRect(ev);
              if (!rect) return null;
              const isDragging = drag?.key === ev.key && drag.moved;
              return (
                <EventCard
                  key={ev.key}
                  className={ev.className}
                  lessonTitle={ev.lessonTitle}
                  start={ev.start}
                  colors={ev.colors}
                  left={
                    isDragging ? drag.left - CAL_GRID.left : rect.left - CAL_GRID.left
                  }
                  top={isDragging ? drag.top : rect.top}
                  width={rect.width}
                  height={rect.height}
                  pressing={
                    drag?.key === ev.key && drag.activated && !drag.moved
                  }
                  dragging={isDragging}
                  isToday={ev.dayIndex === todayDayIndex}
                  onPointerDown={(e) => onCardPointerDown(e, ev, rect)}
                  onPointerMove={onCardPointerMove}
                  onPointerUp={onCardPointerUp}
                  onPointerCancel={onCardPointerCancel}
                />
              );
            })}
          </div>

          {nowContentY != null ? (
            <CalendarNowIndicator
              top={CONTENT_PAD_TOP + nowContentY}
              hourLabel={now.getHours()}
              gutterW={gutterW}
              gridW={gridW}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CalendarNowIndicator({
  top,
  hourLabel,
  gutterW,
  gridW,
}: {
  top: number;
  hourLabel: number;
  gutterW: number;
  gridW: number;
}) {
  const badgeLeft = Math.max(0, gutterW - 42);
  /** CAL_GRID 소수 좌표 합의 float 노이즈(예: 1008.1600000000001) 제거 */
  const lineTop = Math.round(top);
  const lineWidth = Math.round(gutterW + gridW);

  return (
    <div
      className="pointer-events-none absolute left-0 z-[25]"
      style={{ top: lineTop, width: lineWidth, height: 0 }}
      aria-hidden
    >
      <span
        className="absolute flex items-center justify-center rounded-full bg-[#FF6666] text-[11px] font-bold tabular-nums leading-none text-white"
        style={{
          left: badgeLeft,
          top: 0,
          width: 39,
          height: 15,
          transform: "translateY(-50%)",
        }}
      >
        {hourLabel}
      </span>
      <span
        className="absolute rounded-full bg-[#FF6666]"
        style={{
          left: gutterW - 5,
          top: 0,
          width: 10,
          height: 10,
          transform: "translate(-50%, -50%)",
        }}
      />
      <span
        className="absolute bg-[#FF6666]"
        style={{
          left: gutterW,
          top: 0,
          width: gridW,
          height: 2,
          transform: "translateY(-50%)",
        }}
      />
    </div>
  );
}

function EventCard({
  className,
  lessonTitle,
  start,
  colors,
  left,
  top,
  width,
  height,
  dragging,
  pressing,
  isToday,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  className: string;
  lessonTitle?: string;
  start: string;
  colors: TeacherClass["colors"];
  left: number;
  top: number;
  width: number;
  height: number;
  dragging?: boolean;
  pressing?: boolean;
  isToday?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerCancel?: (e: React.PointerEvent) => void;
}) {
  const ariaParts = [className, lessonTitle, start].filter(Boolean);

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(event) => event.preventDefault()}
      className={`absolute flex select-none overflow-hidden outline-none transition-[transform,box-shadow,opacity] duration-150 ${
        dragging
          ? "pointer-events-auto z-30 cursor-grabbing opacity-95 shadow-md"
          : pressing
            ? "pointer-events-auto z-20 cursor-grab scale-[1.02] shadow-md"
            : "pointer-events-auto cursor-pointer"
      }`}
      style={{
        left,
        top,
        width,
        height,
        borderRadius: CAL_GRID.radius,
        backgroundColor: colors.calendar,
        touchAction: "none",
        boxShadow:
          isToday && !dragging && !pressing
            ? "0 0 20px rgba(176, 176, 176, 0.3)"
            : undefined,
      }}
      aria-label={`${ariaParts.join(" ")} · 짧게 눌러 수정, 길게 눌러 이동`}
    >
      <span
        className="shrink-0 self-stretch"
        style={{
          width: CAL_GRID.barWidth,
          backgroundColor: colors.bar,
        }}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden px-2.5 py-1.5">
        <span
          className="inline-flex w-fit items-center rounded-[6px] bg-white px-1.5 text-[11px] font-bold"
          style={{ color: colors.text, lineHeight: "18px" }}
        >
          {formatTimeChip(start)}
        </span>
        <span
          className="truncate text-[13px] font-bold leading-[16px]"
          style={{ color: colors.text }}
        >
          {className}
        </span>
        {lessonTitle ? (
          <span
            className="truncate text-[11px] font-semibold leading-[14px]"
            style={{ color: colors.text, opacity: 0.92 }}
          >
            {lessonTitle}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function formatTimeChip(hhmm: string): string {
  const min = hhmmToMinutes(hhmm);
  if (!Number.isFinite(min)) return hhmm;
  const h = Math.floor(min / 60);
  const m = min % 60;
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${am ? "오전" : "오후"} ${h12}:${String(m).padStart(2, "0")}`;
}
