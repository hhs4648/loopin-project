"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FigmaHotspot } from "@/components/figma/types";
import { AssignedClassesPanel } from "@/components/teacher/AssignedClassesPanel";
import { AssignAssignmentPanel } from "@/components/teacher/AssignAssignmentPanel";
import { CalendarAcademicButton } from "@/components/teacher/CalendarAcademicButton";
import { CalendarAcademicScheduleModal } from "@/components/teacher/CalendarAcademicScheduleModal";
import { CalendarClassLegend } from "@/components/teacher/CalendarClassLegend";
import {
  CalendarEventsOverlay,
  type CalendarLessonTarget,
  type CalendarSlotPreset,
} from "@/components/teacher/CalendarEventsOverlay";
import { CalendarMonthlyPanel } from "@/components/teacher/CalendarMonthlyPanel";
import { CalendarPageHeader } from "@/components/teacher/CalendarPageHeader";
import { CalendarTodaySidebarHeader } from "@/components/teacher/CalendarTodaySidebarHeader";
import {
  CalendarViewToggle,
  type CalendarViewMode,
} from "@/components/teacher/CalendarViewToggle";
import { CalendarWeekChrome } from "@/components/teacher/CalendarWeekChrome";
import { ClassAssignmentsPanel } from "@/components/teacher/ClassAssignmentsPanel";
import { ClassHomeOverlay } from "@/components/teacher/ClassHomeOverlay";
import { ClassPageHeader } from "@/components/teacher/ClassPageHeader";
import { ClassSettingsPanel } from "@/components/teacher/ClassSettingsPanel";
import { ClassStudentsPanel } from "@/components/teacher/ClassStudentsPanel";
import { ClassTabsBar } from "@/components/teacher/ClassTabsBar";
import { ClassPeriodModal } from "@/components/teacher/ClassPeriodModal";
import {
  CreateClassModal,
  type ClassModalPreset,
} from "@/components/teacher/CreateClassModal";
import { MySettingsPanel } from "@/components/teacher/MySettingsPanel";
import {
  OneOffLessonModal,
  type RecurringLessonEdit,
} from "@/components/teacher/OneOffLessonModal";
import { ProblemsManagementOverlay } from "@/components/teacher/ProblemsManagementOverlay";
import { SchoolSettingsActions } from "@/components/teacher/SchoolSettingsActions";
import { SchoolSettingsPanel } from "@/components/teacher/SchoolSettingsPanel";
import { SidebarBrandHeader } from "@/components/teacher/SidebarBrandHeader";
import { TeacherSidebarChrome } from "@/components/teacher/TeacherSidebarChrome";
import { TeacherSidebarFooter } from "@/components/teacher/TeacherSidebarFooter";
import { VocabBuilderPanel } from "@/components/teacher/VocabBuilderPanel";
import { CLASS_LAYOUT } from "@/lib/class-layout";
import { type ClassTabId, classTabHref } from "@/lib/class-tabs";
import {
  DEFAULT_ACADEMIC_SCHEDULE,
  loadAcademicSchedule,
  saveAcademicSchedule,
  type AcademicScheduleSettings,
} from "@/lib/calendar-academic-schedule";
import {
  addDays,
  applyCalendarMove,
  getNextClassOccurrence,
  startOfWeekMonday,
  weekdayFromDate,
} from "@/lib/calendar-layout";
import { addMonths, startOfMonth } from "@/lib/calendar-monthly";
import {
  loadOneOffLessons,
  removeLessonsForClass,
  saveOneOffLessons,
  type OneOffLesson,
} from "@/lib/calendar-one-off-lessons";
import {
  getAssignedProblemsForClass,
  loadClassAssignments,
  type AssignedProblemView,
} from "@/lib/class-assignments";
import {
  type ClassStudent,
  clearClassStudents,
  loadClassStudents,
  saveClassStudents,
} from "@/lib/class-students";
import {
  type SchoolBrand,
  brandsEqual,
  loadSchoolBrand,
  saveSchoolBrand,
} from "@/lib/school-brand";
import {
  DEFAULT_TEACHER_PROFILE,
  loadTeacherProfile,
  normalizePraisePassThreshold,
  saveTeacherProfile,
} from "@/lib/teacher-profile";
import type { ProblemsView } from "@/lib/problem-routes";
import {
  type SavedProblemSet,
  loadProblemSets,
} from "@/lib/problem-sets";
import {
  type TeacherClass,
  createPeriodId,
  findTeacherClass,
  getRemappedClassId,
  loadTeacherClasses,
  parseIsoDateLocal,
  resolveClassId,
  saveTeacherClasses,
} from "@/lib/teacher-classes";
import {
  buildStudentProgressRows,
  deleteTeacherClassRemote,
  fetchAttemptsForClass,
  fetchClassEnrollments,
  mergeEnrolledStudents,
  migrateLocalDataOnce,
  restoreRemoteOnlyAssignments,
  subscribeClassRealtime,
  syncLocalAssignmentsForClass,
  upsertTeacherClassRemote,
  removeEnrollmentRemote,
} from "@/lib/sync/teacher-sync";
import {
  ensureTeacherSession,
  syncTeacherProfileRemote,
} from "@/lib/sync/teacher-session";
import { isSyncEnabled } from "@/lib/sync/supabase-client";
import type { AttemptProgress, StudentProgressRow } from "@/lib/sync/types";

type TeacherFigmaFrameProps = {
  svg: string;
  alt: string;
  width: number;
  height: number;
  hotspots?: FigmaHotspot[];
  activeClassId?: string;
  classTab?: ClassTabId;
  schoolSettings?: boolean;
  problemsView?: ProblemsView;
  /** assets/1920w light.svg (새 문제 세트 패널) */
  newProblemSetSvg?: string;
  /** 사이드바 「설정」→ 내 설정 */
  mySettings?: boolean;
  /** 사이드바 「단어장 만들기」 */
  vocab?: boolean;
  /** 과제 부여 전용 페이지 `/teacher/problems/assign` */
  assignAssignment?: boolean;
  /** assets/praise-calendar-example.svg (내 설정 칭찬 캘린더 예시) */
  praiseCalendarExampleSvg?: string;
};

export function TeacherFigmaFrame({
  svg,
  alt,
  width,
  height,
  hotspots = [],
  activeClassId,
  classTab,
  schoolSettings = false,
  problemsView,
  newProblemSetSvg = "",
  mySettings = false,
  vocab = false,
  assignAssignment = false,
  praiseCalendarExampleSvg = "",
}: TeacherFigmaFrameProps) {
  const params = useParams();
  const router = useRouter();

  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [oneOffLessons, setOneOffLessons] = useState<OneOffLesson[]>([]);
  const [academicSchedule, setAcademicSchedule] =
    useState<AcademicScheduleSettings>(DEFAULT_ACADEMIC_SCHEDULE);
  const [academicModalOpen, setAcademicModalOpen] = useState(false);
  const [savedBrand, setSavedBrand] = useState<SchoolBrand | null>(null);
  const [draftBrand, setDraftBrand] = useState<SchoolBrand | null>(null);
  const [savedTeacherName, setSavedTeacherName] = useState(
    DEFAULT_TEACHER_PROFILE.name,
  );
  const [draftTeacherName, setDraftTeacherName] = useState(
    DEFAULT_TEACHER_PROFILE.name,
  );
  const [savedPraisePassThreshold, setSavedPraisePassThreshold] = useState(
    DEFAULT_TEACHER_PROFILE.praisePassThreshold,
  );
  const [draftPraisePassThreshold, setDraftPraisePassThreshold] = useState(
    DEFAULT_TEACHER_PROFILE.praisePassThreshold,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<TeacherClass | null>(null);
  const [classPreset, setClassPreset] = useState<ClassModalPreset | null>(
    null,
  );
  const [lessonPreset, setLessonPreset] =
    useState<CalendarSlotPreset | null>(null);
  const [editingLesson, setEditingLesson] =
    useState<OneOffLesson | null>(null);
  const [recurringEdit, setRecurringEdit] =
    useState<RecurringLessonEdit | null>(null);
  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [classAttempts, setClassAttempts] = useState<AttemptProgress[]>([]);
  const [progressByAssignment, setProgressByAssignment] = useState<
    Record<string, StudentProgressRow[]>
  >({});
  const [progressRefreshKey, setProgressRefreshKey] = useState(0);
  const [calendarView, setCalendarView] = useState<CalendarViewMode>("week");
  const [weekMonday, setWeekMonday] = useState(() =>
    startOfWeekMonday(new Date()),
  );
  const [monthStart, setMonthStart] = useState(() =>
    startOfMonth(new Date()),
  );
  const [periodClassId, setPeriodClassId] = useState<string | null>(null);
  const [problemSets, setProblemSets] = useState<SavedProblemSet[]>([]);
  const [classAssignmentRecords, setClassAssignmentRecords] = useState<
    ReturnType<typeof loadClassAssignments>
  >([]);

  const resolvedClassId = useMemo(() => {
    const fromProps = resolveClassId(activeClassId);
    if (fromProps) return getRemappedClassId(fromProps);
    const fromRoute = params?.classId;
    if (typeof fromRoute === "string") {
      return getRemappedClassId(fromRoute);
    }
    return undefined;
  }, [activeClassId, params, classes]);

  useEffect(() => {
    setClasses(loadTeacherClasses());
    setOneOffLessons(loadOneOffLessons());
    setAcademicSchedule(loadAcademicSchedule());
    setProblemSets(loadProblemSets());
    setClassAssignmentRecords(loadClassAssignments());
    const loaded = loadSchoolBrand();
    setSavedBrand(loaded);
    setDraftBrand(loaded);
    const profile = loadTeacherProfile();
    setSavedTeacherName(profile.name);
    setDraftTeacherName(profile.name);
    setSavedPraisePassThreshold(profile.praisePassThreshold);
    setDraftPraisePassThreshold(profile.praisePassThreshold);
  }, [activeClassId]);

  // 옛 한글 id URL → 마이그레이션된 ASCII id 로 교정
  useEffect(() => {
    if (!activeClassId || !classTab) return;
    const raw = resolveClassId(activeClassId);
    const remapped = getRemappedClassId(activeClassId);
    if (raw && remapped && remapped !== raw) {
      router.replace(classTabHref(remapped, classTab));
    }
  }, [activeClassId, classTab, router, classes]);

  useEffect(() => {
    if (!resolvedClassId || !classTab) {
      setStudents([]);
      return;
    }
    setStudents(loadClassStudents(resolvedClassId));
  }, [resolvedClassId, classTab]);

  useEffect(() => {
    if (!isSyncEnabled()) return;
    let cancelled = false;
    void (async () => {
      await ensureTeacherSession();
      if (cancelled) return;
      const localClasses = loadTeacherClasses();
      setClasses(localClasses);
      await migrateLocalDataOnce({
        classes: localClasses,
        problemSets: loadProblemSets(),
        assignments: loadClassAssignments(),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!resolvedClassId || !isSyncEnabled()) return;
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshRemote = async () => {
      const enrollments = await fetchClassEnrollments(resolvedClassId);
      if (cancelled) return;
      const local = loadClassStudents(resolvedClassId);
      const merged = mergeEnrolledStudents(local, enrollments);
      saveClassStudents(resolvedClassId, merged);
      setStudents(merged);

      // 로컬에만 있던 부여분(silent publish 실패 등)을 서버에 맞춰 올림 → 학생 맵 성 활성화
      await syncLocalAssignmentsForClass({
        classId: resolvedClassId,
        problemSets: loadProblemSets(),
        assignments: loadClassAssignments(),
      });
      if (cancelled) return;

      // 반대 방향 — 원격에만 있는 과제를 로컬 목록에 복원한다.
      // 다른 브라우저·기기에서 냈거나 과거 삭제 실패로 남은 행은 교사 화면에
      // 보이지 않는데 학생 앱에서는 성이 활성화된다. 목록에 띄워야 지울 수 있다.
      // (올리기를 먼저 끝낸 뒤 읽으므로, 방금 지운 과제가 되살아나지 않는다.)
      await restoreRemoteOnlyAssignments(resolvedClassId);
      if (cancelled) return;

      const attempts = await fetchAttemptsForClass(resolvedClassId);
      if (cancelled) return;
      let attemptsChanged = true;
      setClassAttempts((prev) => {
        if (
          prev.length === attempts.length &&
          prev.every(
            (row, i) =>
              row.id === attempts[i]?.id &&
              row.updatedAt === attempts[i]?.updatedAt &&
              row.progressPercent === attempts[i]?.progressPercent &&
              row.status === attempts[i]?.status &&
              row.answeredCount === attempts[i]?.answeredCount &&
              row.correctCount === attempts[i]?.correctCount,
          )
        ) {
          attemptsChanged = false;
          return prev;
        }
        return attempts;
      });
      if (attemptsChanged) {
        setProgressRefreshKey((k) => k + 1);
      }
    };

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void refreshRemote();
      }, 400);
    };

    void refreshRemote();
    const unsubscribe = subscribeClassRealtime(resolvedClassId, () => {
      scheduleRefresh();
    });

    const onFocus = () => void refreshRemote();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [resolvedClassId, classTab]);

  const activeClass = useMemo(
    () => findTeacherClass(classes, resolvedClassId),
    [classes, resolvedClassId],
  );
  useEffect(() => {
    const refreshAssignments = () =>
      setClassAssignmentRecords(loadClassAssignments());
    const refreshProblemSets = () => setProblemSets(loadProblemSets());
    window.addEventListener("loopin-class-assignments-changed", refreshAssignments);
    window.addEventListener("loopin-problem-sets-changed", refreshProblemSets);
    window.addEventListener("storage", refreshAssignments);
    window.addEventListener("storage", refreshProblemSets);
    return () => {
      window.removeEventListener(
        "loopin-class-assignments-changed",
        refreshAssignments,
      );
      window.removeEventListener(
        "loopin-problem-sets-changed",
        refreshProblemSets,
      );
      window.removeEventListener("storage", refreshAssignments);
      window.removeEventListener("storage", refreshProblemSets);
    };
  }, []);

  /** 홈·진도용 — 반 전체 과제만 (개인 오답 복습 제외) */
  const classAssignments = useMemo(
    (): AssignedProblemView[] =>
      resolvedClassId
        ? getAssignedProblemsForClass(
            problemSets,
            classAssignmentRecords,
            resolvedClassId,
          )
        : [],
    [problemSets, classAssignmentRecords, resolvedClassId],
  );

  /** 과제 탭 — 오답만 다시 출제(개인) 포함 */
  const classAssignmentsForTab = useMemo(
    (): AssignedProblemView[] =>
      resolvedClassId
        ? getAssignedProblemsForClass(
            problemSets,
            classAssignmentRecords,
            resolvedClassId,
            { includePersonal: true },
          )
        : [],
    [problemSets, classAssignmentRecords, resolvedClassId],
  );

  useEffect(() => {
    if (!resolvedClassId) {
      setProgressByAssignment({});
      return;
    }
    const next: Record<string, StudentProgressRow[]> = {};
    for (const view of classAssignmentsForTab) {
      const cohort = view.assignment.targetStudentId
        ? students.filter(
            (student) => student.id === view.assignment.targetStudentId,
          )
        : students;
      next[view.assignment.id] = buildStudentProgressRows(
        cohort,
        classAttempts,
        view.assignment.id,
      );
    }
    setProgressByAssignment(next);
  }, [
    classAssignmentsForTab,
    students,
    classAttempts,
    progressRefreshKey,
    resolvedClassId,
  ]);

  const studentProgressRows = useMemo(
    () => buildStudentProgressRows(students, classAttempts),
    [students, classAttempts],
  );

  const handleCreate = useCallback((item: TeacherClass) => {
    setClasses((prev) => {
      const next = [...prev, item];
      saveTeacherClasses(next);
      return next;
    });
    void upsertTeacherClassRemote(item);
    setModalOpen(false);
    setClassPreset(null);
    setEditingClass(null);
    setPeriodClassId(item.id);
  }, []);

  const closePeriodModal = useCallback(() => {
    setPeriodClassId(null);
  }, []);

  const handlePeriodConfirm = useCallback(
    (next: { periodName: string; startDate: string; endDate: string }) => {
      if (!periodClassId) return;
      setClasses((prev) => {
        const list = prev.map((c) =>
          c.id === periodClassId
            ? {
                ...c,
                periods: [
                  ...(c.periods ?? []),
                  {
                    id: createPeriodId(),
                    name: next.periodName,
                    startDate: next.startDate,
                    endDate: next.endDate || undefined,
                  },
                ],
              }
            : c,
        );
        saveTeacherClasses(list);
        return list;
      });
      setPeriodClassId(null);
    },
    [periodClassId],
  );

  const openCreateClass = useCallback((preset?: ClassModalPreset | null) => {
    setEditingClass(null);
    setClassPreset(preset ?? null);
    setModalOpen(true);
  }, []);

  const openEditClass = useCallback(
    (classId: string) => {
      const target = findTeacherClass(classes, classId);
      if (!target) return;
      setClassPreset(null);
      setEditingClass(target);
      setModalOpen(true);
    },
    [classes],
  );

  const closeClassModal = useCallback(() => {
    setModalOpen(false);
    setEditingClass(null);
    setClassPreset(null);
  }, []);

  const openOneOffLesson = useCallback((preset: CalendarSlotPreset) => {
    setEditingLesson(null);
    setRecurringEdit(null);
    setLessonPreset(preset);
  }, []);

  const openLessonFromCalendar = useCallback(
    (target: CalendarLessonTarget) => {
      if (target.oneOffLessonId) {
        const lesson = oneOffLessons.find(
          (item) => item.id === target.oneOffLessonId,
        );
        if (!lesson) return;
        setRecurringEdit(null);
        setEditingLesson(lesson);
        setLessonPreset({
          date: lesson.date,
          day: weekdayFromDate(parseIsoDateLocal(lesson.date) ?? new Date()),
          start: lesson.start,
          end: lesson.end,
        });
        return;
      }

      setEditingLesson(null);
      setRecurringEdit({
        classId: target.classId,
        fromDay: target.day,
        date: target.date,
        start: target.start,
        end: target.end,
      });
      setLessonPreset({
        date: target.date,
        day: target.day,
        start: target.start,
        end: target.end,
      });
    },
    [oneOffLessons],
  );

  const closeOneOffLesson = useCallback(() => {
    setLessonPreset(null);
    setEditingLesson(null);
    setRecurringEdit(null);
  }, []);

  const saveAcademicScheduleSettings = useCallback(
    (next: AcademicScheduleSettings) => {
      saveAcademicSchedule(next);
      setAcademicSchedule(next);
      setAcademicModalOpen(false);
    },
    [],
  );

  const saveOneOffLesson = useCallback(
    (lesson: OneOffLesson) => {
      setOneOffLessons((previous) => {
        const exists = previous.some((item) => item.id === lesson.id);
        const next = exists
          ? previous.map((item) => (item.id === lesson.id ? lesson : item))
          : [...previous, lesson];
        saveOneOffLessons(next);
        return next;
      });
      closeOneOffLesson();
    },
    [closeOneOffLesson],
  );

  const deleteOneOffLesson = useCallback(
    (lessonId: string) => {
      setOneOffLessons((previous) => {
        const next = previous.filter((item) => item.id !== lessonId);
        saveOneOffLessons(next);
        return next;
      });
      closeOneOffLesson();
    },
    [closeOneOffLesson],
  );

  const moveOneOffLesson = useCallback(
    (
      lessonId: string,
      nextPosition: Pick<OneOffLesson, "date" | "start" | "end">,
    ) => {
      setOneOffLessons((previous) => {
        const next = previous.map((lesson) =>
          lesson.id === lessonId ? { ...lesson, ...nextPosition } : lesson,
        );
        saveOneOffLessons(next);
        return next;
      });
    },
    [],
  );

  const handleUpdateClass = useCallback((next: TeacherClass) => {
    setClasses((prev) => {
      const list = prev.map((c) => (c.id === next.id ? next : c));
      saveTeacherClasses(list);
      return list;
    });
    void upsertTeacherClassRemote(next);
  }, []);

  const saveRecurringLesson = useCallback(
    (next: {
      classId: string;
      fromDay: import("@/lib/teacher-classes").Weekday;
      toDay: import("@/lib/teacher-classes").Weekday;
      start: string;
      end: string;
      title?: string;
    }) => {
      const target = findTeacherClass(classes, next.classId);
      if (!target) return;
      let updated = applyCalendarMove(target, next.fromDay, next.toDay, {
        start: next.start,
        end: next.end,
      });
      const dayLessonMeta = { ...(updated.dayLessonMeta ?? {}) };
      if (next.title?.trim()) {
        dayLessonMeta[next.toDay] = {
          title: next.title.trim(),
        };
      } else {
        delete dayLessonMeta[next.toDay];
      }
      updated = {
        ...updated,
        dayLessonMeta:
          Object.keys(dayLessonMeta).length > 0 ? dayLessonMeta : undefined,
      };
      handleUpdateClass(updated);
      closeOneOffLesson();
    },
    [classes, handleUpdateClass, closeOneOffLesson],
  );

  const updateNextLessonTitle = useCallback(
    (title: string) => {
      if (!activeClass) return;
      const next = getNextClassOccurrence(
        activeClass,
        new Date(),
        oneOffLessons,
        academicSchedule,
      );
      if (!next) return;
      const trimmed = title.trim();

      if (next.source === "oneOff" && next.oneOffLessonId) {
        setOneOffLessons((previous) => {
          const list = previous.map((lesson) =>
            lesson.id === next.oneOffLessonId
              ? { ...lesson, title: trimmed || undefined }
              : lesson,
          );
          saveOneOffLessons(list);
          return list;
        });
        return;
      }

      const dayLessonMeta = { ...(activeClass.dayLessonMeta ?? {}) };
      if (trimmed) {
        dayLessonMeta[next.weekday] = {
          ...dayLessonMeta[next.weekday],
          title: trimmed,
        };
      } else if (dayLessonMeta[next.weekday]) {
        const { title: _removed, ...rest } = dayLessonMeta[next.weekday]!;
        if (Object.keys(rest).length > 0) {
          dayLessonMeta[next.weekday] = rest;
        } else {
          delete dayLessonMeta[next.weekday];
        }
      }
      handleUpdateClass({
        ...activeClass,
        dayLessonMeta:
          Object.keys(dayLessonMeta).length > 0 ? dayLessonMeta : undefined,
      });
    },
    [activeClass, oneOffLessons, academicSchedule, handleUpdateClass],
  );

  const deleteRecurringLessonDay = useCallback(
    (
      classId: string,
      day: import("@/lib/teacher-classes").Weekday,
    ) => {
      const target = findTeacherClass(classes, classId);
      if (!target) return;
      const nextDays = target.days.filter((d) => d !== day);
      const nextDayTimes = { ...(target.dayTimes ?? {}) };
      delete nextDayTimes[day];
      const nextDayLessonMeta = { ...(target.dayLessonMeta ?? {}) };
      delete nextDayLessonMeta[day];
      handleUpdateClass({
        ...target,
        days: nextDays,
        dayTimes:
          Object.keys(nextDayTimes).length > 0 ? nextDayTimes : undefined,
        dayLessonMeta:
          Object.keys(nextDayLessonMeta).length > 0
            ? nextDayLessonMeta
            : undefined,
        scheduleMode:
          nextDays.length <= 1 ? "unified" : target.scheduleMode,
      });
      closeOneOffLesson();
    },
    [classes, handleUpdateClass, closeOneOffLesson],
  );

  const handleSaveClassFromModal = useCallback(
    (next: TeacherClass) => {
      handleUpdateClass(next);
      closeClassModal();
    },
    [handleUpdateClass, closeClassModal],
  );

  const handleDeleteClass = useCallback(() => {
    if (!resolvedClassId) return;
    const deletingId = resolvedClassId;
    setClasses((prev) => {
      const list = prev.filter((c) => c.id !== deletingId);
      saveTeacherClasses(list);
      return list;
    });
    setOneOffLessons((previous) => {
      const next = removeLessonsForClass(previous, deletingId);
      saveOneOffLessons(next);
      return next;
    });
    clearClassStudents(deletingId);
    void deleteTeacherClassRemote(deletingId);
    router.push("/teacher");
  }, [resolvedClassId, router]);

  const handleRemoveStudent = useCallback(
    (id: string) => {
      if (!resolvedClassId) return;
      const classId = resolvedClassId;
      /*
        **원격을 먼저 지운다.** 로컬만 지우면 잠시 뒤 `refreshRemote`가
        `mergeEnrolledStudents`로 서버 값을 다시 합치면서 지운 학생이 되살아난다
        — 「삭제가 안 된다」의 원인이었다(2026-08-11).

        초대코드로 들어온 학생(`source: 'enrolled'`)만 서버에 행이 있고,
        교사가 손으로 추가한 학생은 로컬뿐이라 원격 삭제가 no-op으로 지나간다.
      */
      void (async () => {
        const result = await removeEnrollmentRemote({ classId, studentId: id });
        if (!result.ok) {
          window.alert(
            "학생을 반에서 빼지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.",
          );
          return;
        }
        setStudents((prev) => {
          const next = prev.filter((s) => s.id !== id);
          saveClassStudents(classId, next);
          return next;
        });
      })();
    },
    [resolvedClassId],
  );

  const handleUpdateStudentMemo = useCallback(
    (id: string, memo: string) => {
      if (!resolvedClassId) return;
      setStudents((prev) => {
        const next = prev.map((student) =>
          student.id === id ? { ...student, memo } : student,
        );
        saveClassStudents(resolvedClassId, next);
        return next;
      });
    },
    [resolvedClassId],
  );

  const handleUpdateStudentName = useCallback(
    (id: string, name: string) => {
      if (!resolvedClassId) return;
      const nextName = name.trim();
      if (!nextName) return;
      setStudents((prev) => {
        const next = prev.map((student) =>
          student.id === id ? { ...student, name: nextName } : student,
        );
        saveClassStudents(resolvedClassId, next);
        return next;
      });
    },
    [resolvedClassId],
  );

  const dirty =
    savedBrand !== null &&
    draftBrand !== null &&
    !brandsEqual(savedBrand, draftBrand);

  const mySettingsDirty =
    draftTeacherName.trim() !== savedTeacherName.trim() ||
    draftPraisePassThreshold !== savedPraisePassThreshold;

  const handleRevert = useCallback(() => {
    if (!savedBrand) return;
    setDraftBrand(savedBrand);
  }, [savedBrand]);

  const handleSave = useCallback(() => {
    if (!draftBrand) return;
    saveSchoolBrand(draftBrand);
    setSavedBrand(draftBrand);
  }, [draftBrand]);

  const handleTeacherNameRevert = useCallback(() => {
    setDraftTeacherName(savedTeacherName);
    setDraftPraisePassThreshold(savedPraisePassThreshold);
  }, [savedTeacherName, savedPraisePassThreshold]);

  const handleTeacherNameSave = useCallback(() => {
    const nextName =
      draftTeacherName.trim() || DEFAULT_TEACHER_PROFILE.name;
    const nextThreshold = normalizePraisePassThreshold(
      draftPraisePassThreshold,
    );
    saveTeacherProfile({
      name: nextName,
      praisePassThreshold: nextThreshold,
    });
    setSavedTeacherName(nextName);
    setDraftTeacherName(nextName);
    setSavedPraisePassThreshold(nextThreshold);
    setDraftPraisePassThreshold(nextThreshold);
    void syncTeacherProfileRemote({
      displayName: nextName,
      praisePassThreshold: nextThreshold,
    });
  }, [draftTeacherName, draftPraisePassThreshold]);

  const ready = savedBrand !== null && draftBrand !== null;
  const classScreen = Boolean(resolvedClassId && classTab);
  const problemsActive = problemsView != null;
  const calendarActive =
    !classScreen &&
    !schoolSettings &&
    !problemsActive &&
    !mySettings &&
    !vocab &&
    !assignAssignment;

  return (
    <main className="no-scrollbar flex min-h-screen items-center justify-center overflow-auto bg-white">
      <div
        className="relative shrink-0"
        style={{ width, minWidth: width, height, minHeight: height }}
      >
        <div
          role="img"
          aria-label={alt}
          className="[&>svg]:block [&>svg]:max-w-none"
          style={{ width, height }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        {hotspots.map((hotspot) => (
          <Link
            key={hotspot.id}
            href={hotspot.href}
            aria-label={hotspot.label}
            className="absolute z-20 cursor-pointer opacity-0 outline-none focus:outline-none focus-visible:outline-none"
            style={{
              left: hotspot.x,
              top: hotspot.y,
              width: hotspot.width,
              height: hotspot.height,
              WebkitTapHighlightColor: "transparent",
            }}
          />
        ))}

        {/* 브랜드 로드 전에도 선생님 크롬 고정 — 화면마다 다르게 보이지 않게 */}
        <TeacherSidebarChrome
          height={height}
          calendarActive={calendarActive}
          coverWideBleed={classScreen}
          whiteGutterEnd={
            classTab === "home"
              ? CLASS_LAYOUT.homeBleedLeft
              : CLASS_LAYOUT.contentLeft
          }
        />

        <TeacherSidebarFooter
          mySettingsActive={mySettings}
          vocabActive={vocab}
        />

        {ready ? (
          <SidebarBrandHeader brand={savedBrand} teacherName={savedTeacherName} />
        ) : null}

        {ready ? (
          <AssignedClassesPanel
            classes={classes}
            activeClassId={resolvedClassId}
            problemsView={problemsView ?? null}
            onAddClass={() => openCreateClass(null)}
          />
        ) : null}

        {problemsView ? (
          <ProblemsManagementOverlay
            view={problemsView}
            newProblemSetSvg={newProblemSetSvg}
          />
        ) : null}

        {vocab ? <VocabBuilderPanel /> : null}
        {assignAssignment ? <AssignAssignmentPanel /> : null}

        {mySettings ? (
          <MySettingsPanel
            draftName={draftTeacherName}
            onDraftNameChange={setDraftTeacherName}
            draftPraisePassThreshold={draftPraisePassThreshold}
            onDraftPraisePassThresholdChange={setDraftPraisePassThreshold}
            dirty={mySettingsDirty}
            onRevert={handleTeacherNameRevert}
            onSave={handleTeacherNameSave}
            praiseCalendarExampleSvg={praiseCalendarExampleSvg}
          />
        ) : null}

        {calendarActive ? (
          <>
            <CalendarAcademicButton onClick={() => setAcademicModalOpen(true)} />
            <CalendarViewToggle
              mode={calendarView}
              onChange={setCalendarView}
            />
            <CalendarPageHeader />
            <CalendarTodaySidebarHeader
              classes={classes}
              oneOffLessons={oneOffLessons}
              academicSchedule={academicSchedule}
              assignments={classAssignmentRecords}
              problemSets={problemSets}
            />
            {calendarView === "week" ? (
              <>
                <CalendarWeekChrome
                  weekMonday={weekMonday}
                  academicHolidays={academicSchedule.holidays}
                  onPrevWeek={() =>
                    setWeekMonday((d) => addDays(d, -7))
                  }
                  onNextWeek={() =>
                    setWeekMonday((d) => addDays(d, 7))
                  }
                />
                <CalendarClassLegend classes={classes} />
                <CalendarEventsOverlay
                  classes={classes}
                  oneOffLessons={oneOffLessons}
                  academicSchedule={academicSchedule}
                  weekMonday={weekMonday}
                  onMoveClass={handleUpdateClass}
                  onMoveOneOff={moveOneOffLesson}
                  onEditLesson={openLessonFromCalendar}
                  onEmptySlot={openOneOffLesson}
                />
              </>
            ) : (
              <CalendarMonthlyPanel
                classes={classes}
                oneOffLessons={oneOffLessons}
                academicSchedule={academicSchedule}
                monthStart={monthStart}
                onPrevMonth={() =>
                  setMonthStart((d) => addMonths(d, -1))
                }
                onNextMonth={() =>
                  setMonthStart((d) => addMonths(d, 1))
                }
                onEditLesson={openLessonFromCalendar}
                onEmptySlot={openOneOffLesson}
              />
            )}
          </>
        ) : null}

        {classScreen && classTab && resolvedClassId ? (
          <>
            <ClassPageHeader
              teacherClass={activeClass}
              studentCount={students.length}
            />
            <ClassTabsBar classId={resolvedClassId} activeTab={classTab} />
          </>
        ) : null}

        {classScreen && classTab === "home" ? (
          <ClassHomeOverlay
            studentCount={students.length}
            students={students}
            classId={resolvedClassId}
            teacherClass={activeClass}
            assignments={classAssignments}
            problemSets={problemSets}
            attempts={classAttempts}
            incompleteAssignmentCount={classAssignments.length}
            oneOffLessons={oneOffLessons}
            academicSchedule={academicSchedule}
            onUpdateNextLessonTitle={updateNextLessonTitle}
          />
        ) : null}

        {classScreen && classTab === "assignments" ? (
          <ClassAssignmentsPanel
            assignments={classAssignmentsForTab}
            students={students}
            progressByAssignment={progressByAssignment}
            progressRefreshKey={progressRefreshKey}
            classLabel={activeClass?.name}
            teacherName={savedTeacherName}
            teacherClass={activeClass ?? null}
          />
        ) : null}

        {classScreen && classTab === "students" && resolvedClassId ? (
          <ClassStudentsPanel
            students={students}
            progressRows={studentProgressRows}
            onRemove={handleRemoveStudent}
            onUpdateMemo={handleUpdateStudentMemo}
            onUpdateName={handleUpdateStudentName}
          />
        ) : null}

        {classScreen && classTab === "settings" && activeClass ? (
          <ClassSettingsPanel
            teacherClass={activeClass}
            onSave={handleUpdateClass}
            onDelete={handleDeleteClass}
          />
        ) : null}

        {classScreen && classTab === "settings" && !activeClass ? (
          <div
            className="pointer-events-none absolute z-20 bg-white"
            style={{
              left: 324.375,
              top: 140,
              width: 929.875,
              height: height - 160,
            }}
            aria-hidden
          />
        ) : null}

        {ready && schoolSettings ? (
          <>
            <SchoolSettingsPanel
              draft={draftBrand}
              onChange={setDraftBrand}
            />
            <SchoolSettingsActions
              dirty={dirty}
              onRevert={handleRevert}
              onSave={handleSave}
            />
          </>
        ) : null}

        <CreateClassModal
          open={modalOpen}
          onClose={closeClassModal}
          onCreate={handleCreate}
          editing={editingClass}
          onUpdate={handleSaveClassFromModal}
          preset={classPreset}
        />

        <OneOffLessonModal
          open={lessonPreset !== null}
          classes={classes}
          preset={lessonPreset}
          editing={editingLesson}
          recurring={recurringEdit}
          onClose={closeOneOffLesson}
          onSave={saveOneOffLesson}
          onSaveRecurring={saveRecurringLesson}
          onDelete={deleteOneOffLesson}
          onDeleteRecurring={deleteRecurringLessonDay}
        />

        <CalendarAcademicScheduleModal
          open={academicModalOpen}
          settings={academicSchedule}
          onClose={() => setAcademicModalOpen(false)}
          onSave={saveAcademicScheduleSettings}
        />

        <ClassPeriodModal
          open={periodClassId !== null}
          onClose={closePeriodModal}
          periodName=""
          startDate=""
          endDate=""
          overlay="frame"
          dismissible={false}
          onConfirm={handlePeriodConfirm}
        />
      </div>
    </main>
  );
}
