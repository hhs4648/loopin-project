"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { CLASS_LAYOUT } from "@/lib/class-layout";
import type { ClassStudent } from "@/lib/class-students";
import { AlertBadgeIcon } from "@/components/teacher/AlertBadgeIcon";
import { AssignAssignmentModal } from "@/components/teacher/AssignAssignmentModal";
import {
  formatAssignmentPeriod,
  formatAssignmentSchedule,
  formatLessonDateKo,
  loadClassAssignments,
  removeAssignmentById,
  saveClassAssignments,
  upsertAssignmentsForProblemSet,
  type AssignedProblemView,
  type ClassAssignment,
  type CreateClassAssignmentInput,
} from "@/lib/class-assignments";
import { stripBrackets } from "@/lib/problem-bank";
import {
  appendProblemSet,
  loadProblemSets,
  persistProblemSets,
  problemSetItemCount,
  problemSetItemSummary,
  updateProblemSet,
  type SavedProblemSet,
} from "@/lib/problem-sets";
import {
  buildReissueProblemSetInput,
  reissueProblemSetTitle,
} from "@/lib/reissue-wrong-problems";
import { buildContentSnapshot } from "@/lib/sync/content-snapshot";
import {
  deleteClassAssignmentRemote,
  fetchQuestionDetailStats,
  fetchQuestionStats,
  fetchWrongAnswersForStudent,
  publishProblemSetAndAssignments,
} from "@/lib/sync/teacher-sync";
import type {
  QuestionDetailStats,
  QuestionStat,
  StudentProgressRow,
} from "@/lib/sync/types";
import { loadTeacherClasses, type TeacherClass } from "@/lib/teacher-classes";
import { loadTeacherProfile } from "@/lib/teacher-profile";
import { WrongAnswerPrintModal } from "@/components/teacher/WrongAnswerPrintModal";
import {
  buildWrongAnswerWorksheet,
  type WrongAnswerWorksheet,
} from "@/lib/wrong-answer-worksheet";

type ProblemCategory = "단어" | "문장" | "문법";
type CategoryFilter = "전체" | ProblemCategory;

const PROBLEM_CATEGORIES: ProblemCategory[] = ["단어", "문장", "문법"];

type AssignmentProblemRow = {
  id: string;
  category: ProblemCategory;
  text: string;
  correctRate: number | null;
  answeredCount: number;
};

const CATEGORY_BADGE: Record<ProblemCategory, string> = {
  단어: "bg-[#F1E7FE] text-[#6D28D9]",
  문장: "bg-[#E7F5FE] text-[#1274A9]",
  문법: "bg-[#F2FEE7] text-[#6AA912]",
};

const CATEGORY_TAB: Record<
  CategoryFilter,
  { idle: string; active: string; accent: string }
> = {
  전체: {
    idle: "border-[#EDEFF2] bg-white text-[#6B7280]",
    active: "border-[#1AA7F2] bg-[#EAF6FE] text-[#1274A9]",
    accent: "text-[#1274A9]",
  },
  단어: {
    idle: "border-[#EDEFF2] bg-white text-[#6B7280]",
    active: "border-[#934CD2] bg-[#F8F1FE] text-[#6D28D9]",
    accent: "text-[#6D28D9]",
  },
  문장: {
    idle: "border-[#EDEFF2] bg-white text-[#6B7280]",
    active: "border-[#1AA7F2] bg-[#EAF6FE] text-[#1274A9]",
    accent: "text-[#1274A9]",
  },
  문법: {
    idle: "border-[#EDEFF2] bg-white text-[#6B7280]",
    active: "border-[#A4D24C] bg-[#F4FBEA] text-[#6AA912]",
    accent: "text-[#6AA912]",
  },
};

function avgRateForRows(rows: AssignmentProblemRow[]): number | null {
  const answered = rows.filter((row) => row.correctRate != null);
  if (answered.length === 0) return null;
  return Math.round(
    answered.reduce((sum, row) => sum + (row.correctRate ?? 0), 0) /
      answered.length,
  );
}

function buildProblemSnapshot(assignment: SavedProblemSet) {
  const snapshot = buildContentSnapshot(assignment);
  return {
    words: snapshot.words.map((item) => ({
      id: item.id,
      english: item.english,
      korean: item.korean,
    })),
    sentences: snapshot.sentences.map((item) => ({
      id: item.id,
      english: stripBrackets(item.english),
    })),
    grammar: snapshot.grammar.map((item) => ({
      id: item.id,
      english: stripBrackets(item.english),
    })),
  };
}

function statsToRows(stats: QuestionStat[]): AssignmentProblemRow[] {
  return stats.map((stat) => ({
    id: stat.questionId,
    category: stat.category,
    text: stat.text,
    correctRate: stat.correctRate,
    answeredCount: stat.answeredCount,
  }));
}

function buildProblemRowsFallback(
  assignment: SavedProblemSet,
): AssignmentProblemRow[] {
  const snapshot = buildProblemSnapshot(assignment);
  return [
    ...snapshot.words.map((item) => ({
      id: item.id,
      category: "단어" as const,
      text: `${item.english} · ${item.korean}`,
      correctRate: null,
      answeredCount: 0,
    })),
    ...snapshot.sentences.map((item) => ({
      id: item.id,
      category: "문장" as const,
      text: item.english,
      correctRate: null,
      answeredCount: 0,
    })),
    ...snapshot.grammar.map((item) => ({
      id: item.id,
      category: "문법" as const,
      text: item.english,
      correctRate: null,
      answeredCount: 0,
    })),
  ];
}

type ClassAssignmentsPanelProps = {
  assignments: AssignedProblemView[];
  students: ClassStudent[];
  progressByAssignment?: Record<string, StudentProgressRow[]>;
  /** attempts 갱신 시 문제별 정답률을 다시 불러오기 위한 키 */
  progressRefreshKey?: number;
  classLabel?: string;
  teacherName?: string;
};

type StudentProgressFilter = "all" | "idle" | "in_progress" | "completed";

function statusBadge(status: StudentProgressRow["status"]) {
  if (status === "completed") {
    return {
      label: "완료",
      className: "bg-[#E8F8EF] text-[#047857]",
      dot: "#10B981",
    };
  }
  if (status === "in_progress") {
    return {
      label: "진행중",
      className: "bg-[#FEF9E7] text-[#B45309]",
      dot: "#F59E0B",
    };
  }
  return {
    label: "미학습",
    className: "bg-[#FEE7E7] text-[#C52B2B]",
    dot: "#EF4444",
  };
}

function assignmentPickerLabel(problemSet: SavedProblemSet): string {
  return `${problemSet.title} · ${problemSetItemCount(problemSet)}문제`;
}

/** 반 학생이 1명 이상이고 모두 완료일 때만 true */
function isAssignmentFullyCompleted(
  rows: StudentProgressRow[] | undefined,
  studentCount: number,
): boolean {
  if (studentCount <= 0 || !rows || rows.length === 0) return false;
  if (rows.length < studentCount) return false;
  return rows.every((row) => row.status === "completed");
}

function formatSubmittedAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

export function ClassAssignmentsPanel({
  assignments,
  students,
  progressByAssignment = {},
  progressRefreshKey = 0,
  classLabel = "우리 반",
  teacherName,
}: ClassAssignmentsPanelProps) {
  const left = CLASS_LAYOUT.contentLeft;
  const width = CLASS_LAYOUT.contentRight - left;
  const resolvedTeacherName =
    teacherName?.trim() || loadTeacherProfile().name || "김선생";
  const resolvedClassLabel = classLabel.trim() || "우리 반";
  const [selectedId, setSelectedId] = useState<string | null>(
    assignments[0]?.assignment.id ?? null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentFilter, setStudentFilter] =
    useState<StudentProgressFilter>("all");
  const [deletingAssignment, setDeletingAssignment] =
    useState<AssignedProblemView | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [printOpen, setPrintOpen] = useState(false);
  const [printTitle, setPrintTitle] = useState("오답 시험지 출력");
  const [printSheets, setPrintSheets] = useState<WrongAnswerWorksheet[] | null>(
    null,
  );
  const [printLoading, setPrintLoading] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  useEffect(() => {
    if (
      assignments.some((item) => item.assignment.id === selectedId)
    )
      return;
    setSelectedId(assignments[0]?.assignment.id ?? null);
  }, [assignments, selectedId]);

  useEffect(() => {
    setStudentQuery("");
    setStudentFilter("all");
  }, [selectedId]);

  async function confirmDeleteAssignment() {
    if (!deletingAssignment) return;
    const assignmentId = deletingAssignment.assignment.id;
    setDeletingBusy(true);
    setDeleteError(null);
    // 원격 삭제가 실제로 성공한 뒤에만 로컬 목록에서 지운다 —
    // 실패했는데 화면에서만 사라지면 학생 앱 DB에는 그대로 남아 헷갈린다.
    const result = await deleteClassAssignmentRemote(assignmentId);
    if (!result.ok) {
      setDeletingBusy(false);
      setDeleteError(
        "삭제에 실패했어요. 네트워크를 확인하고 다시 시도해 주세요.",
      );
      return;
    }
    saveClassAssignments(
      removeAssignmentById(loadClassAssignments(), assignmentId),
    );
    setDeletingBusy(false);
    setDeletingAssignment(null);
  }

  function confirmRenameTitle() {
    if (!selectedAssignment) return;
    const title = renameDraft.trim();
    if (!title) return;
    const next = updateProblemSet(loadProblemSets(), selectedAssignment.id, {
      title,
    });
    persistProblemSets(next);
    setRenameOpen(false);
  }

  const selected =
    assignments.find((item) => item.assignment.id === selectedId) ??
    assignments[0] ??
    null;
  const selectedAssignment = selected?.problemSet ?? null;
  const selectedSchedule = selected?.assignment ?? null;

  const selectedProgress = useMemo(() => {
    if (!selected?.assignment.id) return [];
    return (
      progressByAssignment[selected.assignment.id] ??
      students.map((student) => ({
        studentId: student.id,
        studentName: student.name,
        status: "idle" as const,
        progressPercent: 0,
        latestAccuracy: null,
        firstScore: null,
        latestScore: null,
        submittedAt: null,
        lastLearnedAt: null,
      }))
    );
  }, [progressByAssignment, selected?.assignment.id, students]);

  const metrics = useMemo(() => {
    const started = selectedProgress.filter((r) => r.status !== "idle");
    const completed = selectedProgress.filter((r) => r.status === "completed");
    const inProgress = selectedProgress.filter(
      (r) => r.status === "in_progress",
    );
    const idle = selectedProgress.filter((r) => r.status === "idle");
    const scores = completed
      .map((r) => r.latestScore)
      .filter((s): s is number => s != null);
    const avg =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;
    return {
      started: started.length,
      completed: completed.length,
      inProgress: inProgress.length,
      idle: idle.length,
      avg,
    };
  }, [selectedProgress]);

  const visibleStudentProgress = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    return selectedProgress.filter((row) => {
      if (studentFilter !== "all" && row.status !== studentFilter) {
        return false;
      }
      if (query && !row.studentName.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [selectedProgress, studentFilter, studentQuery]);

  const printableStudents = useMemo(
    () => selectedProgress.filter((row) => row.status !== "idle"),
    [selectedProgress],
  );

  async function openWrongAnswerPrint(opts: {
    title: string;
    rows: StudentProgressRow[];
  }) {
    if (!selectedAssignment || !selectedSchedule) return;
    setPrintTitle(opts.title);
    setPrintOpen(true);
    setPrintLoading(true);
    setPrintError(null);
    setPrintSheets(null);

    const lessonDateLabel = formatLessonDateKo(selectedSchedule.lessonDate);
    try {
      const sheets = await Promise.all(
        opts.rows.map(async (row) => {
          const wrongAnswers = await fetchWrongAnswersForStudent({
            assignmentId: selectedSchedule.id,
            studentId: row.studentId,
          });
          return buildWrongAnswerWorksheet({
            problemSet: selectedAssignment,
            wrongAnswers,
            studentId: row.studentId,
            studentName: row.studentName,
            className: resolvedClassLabel,
            teacherName: resolvedTeacherName,
            lessonDateLabel,
          });
        }),
      );
      setPrintSheets(sheets);
    } catch (err) {
      setPrintError(
        err instanceof Error
          ? err.message
          : "오답 시험지를 불러오지 못했어요.",
      );
    } finally {
      setPrintLoading(false);
    }
  }

  function startReissueWrongProblems(selectedIds: string[]) {
    if (!selectedAssignment || !selectedSchedule) return;
    setReissueError(null);
    const input = buildReissueProblemSetInput(selectedAssignment, selectedIds);
    if (!input) {
      setReissueError("다시 출제할 문제를 선택해 주세요.");
      return;
    }

    const created = appendProblemSet({
      ...input,
      assignedClassIds: [selectedSchedule.classId],
    });
    const titled = updateProblemSet(loadProblemSets(), created.id, {
      title: reissueProblemSetTitle(selectedAssignment),
    });
    persistProblemSets(titled);
    const saved =
      titled.find((item) => item.id === created.id) ?? created;
    setReissueProblemSet(saved);
    setReissueOpen(true);
  }

  const studentFilterChips: {
    id: StudentProgressFilter;
    label: string;
    count: number;
    activeClass: string;
    inactiveClass: string;
  }[] = [
    {
      id: "all",
      label: "전체",
      count: selectedProgress.length,
      activeClass: "bg-[#1F2A37] text-white",
      inactiveClass: "bg-[#F3F4F6] text-[#6B7280]",
    },
    {
      id: "idle",
      label: "미학습",
      count: metrics.idle,
      activeClass: "bg-[#FEE7E7] text-[#C52B2B]",
      inactiveClass: "bg-[#FEE7E7] text-[#C52B2B]",
    },
    {
      id: "in_progress",
      label: "진행중",
      count: metrics.inProgress,
      activeClass: "bg-[#FEF9E7] text-[#B45309]",
      inactiveClass: "bg-[#FEF9E7] text-[#B45309]",
    },
    {
      id: "completed",
      label: "완료",
      count: metrics.completed,
      activeClass: "bg-[#E8F8EF] text-[#047857]",
      inactiveClass: "bg-[#E8F8EF] text-[#047857]",
    },
  ];

  const [problemRows, setProblemRows] = useState<AssignmentProblemRow[]>([]);
  const [hidePerfect, setHidePerfect] = useState(false);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryFilter>("전체");
  const [checkedProblemIds, setCheckedProblemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [detailOpen, setDetailOpen] = useState<{
    row: AssignmentProblemRow;
  } | null>(null);
  const [detailStats, setDetailStats] = useState<QuestionDetailStats | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [reissueOpen, setReissueOpen] = useState(false);
  const [reissueBusy, setReissueBusy] = useState(false);
  const [reissueError, setReissueError] = useState<string | null>(null);
  const [reissueProblemSet, setReissueProblemSet] =
    useState<SavedProblemSet | null>(null);

  useEffect(() => {
    setClasses(loadTeacherClasses());
  }, []);

  const openProblemDetail = (row: AssignmentProblemRow) => {
    setDetailOpen({ row });
    setDetailStats(null);
    setDetailLoading(true);
    const assignmentId = selected?.assignment.id;
    if (!assignmentId) {
      setDetailLoading(false);
      setDetailStats({ questionId: row.id, types: [] });
      return;
    }
    void (async () => {
      try {
        const stats = await fetchQuestionDetailStats({
          assignmentId,
          questionId: row.id,
          category: row.category,
          students: students.map((s) => ({ id: s.id, name: s.name })),
        });
        setDetailStats(stats);
      } catch (error) {
        console.warn("[assignments] question detail failed", error);
        setDetailStats({ questionId: row.id, types: [] });
      } finally {
        setDetailLoading(false);
      }
    })();
  };

  const closeProblemDetail = () => {
    setDetailOpen(null);
    setDetailStats(null);
    setDetailLoading(false);
  };

  useEffect(() => {
    if (!detailOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeProblemDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailOpen]);

  useEffect(() => {
    if (!selectedAssignment || !selected?.assignment.id) {
      setProblemRows([]);
      return;
    }

    const assignmentId = selected.assignment.id;
    const fallback = buildProblemRowsFallback(selectedAssignment);
    setProblemRows(fallback);

    let cancelled = false;
    void (async () => {
      const stats = await fetchQuestionStats(
        assignmentId,
        buildProblemSnapshot(selectedAssignment),
      );
      if (cancelled) return;
      setProblemRows(stats.length > 0 ? statsToRows(stats) : fallback);
    })();

    return () => {
      cancelled = true;
    };
  }, [selected?.assignment.id, selectedAssignment, progressRefreshKey]);

  const resultMetrics = useMemo(() => {
    const answered = problemRows.filter((row) => row.correctRate != null);
    const avgAccuracy = avgRateForRows(problemRows);
    const weakCount = answered.filter(
      (row) => (row.correctRate ?? 100) < 70,
    ).length;
    return { avgAccuracy, weakCount, answeredCount: answered.length };
  }, [problemRows]);

  const categoryTabs = useMemo(() => {
    const categoryOnly = PROBLEM_CATEGORIES.map((category) => {
      const rows = problemRows.filter((row) => row.category === category);
      return {
        category: category as CategoryFilter,
        count: rows.length,
        avgAccuracy: avgRateForRows(rows),
      };
    }).filter((tab) => tab.count > 0);

    if (problemRows.length === 0) return categoryOnly;

    return [
      {
        category: "전체" as CategoryFilter,
        count: problemRows.length,
        avgAccuracy: avgRateForRows(problemRows),
      },
      ...categoryOnly,
    ];
  }, [problemRows]);

  const visibleProblemRows = useMemo(() => {
    const inCategory =
      selectedCategory === "전체"
        ? problemRows
        : problemRows.filter((row) => row.category === selectedCategory);
    const filtered = hidePerfect
      ? inCategory.filter((row) => row.correctRate !== 100)
      : inCategory;
    return [...filtered].sort((a, b) => {
      const aRate = a.correctRate;
      const bRate = b.correctRate;
      if (aRate == null && bRate == null) return 0;
      if (aRate == null) return 1;
      if (bRate == null) return -1;
      return sortOrder === "asc" ? aRate - bRate : bRate - aRate;
    });
  }, [problemRows, hidePerfect, selectedCategory, sortOrder]);

  const weakProblemIds = useMemo(
    () =>
      problemRows
        .filter((row) => row.correctRate != null && row.correctRate < 100)
        .map((row) => row.id),
    [problemRows],
  );

  const canReissueSelected = checkedProblemIds.size > 0 && !reissueBusy;
  const canReissueWeak = weakProblemIds.length > 0 && !reissueBusy;

  useEffect(() => {
    setCheckedProblemIds(new Set());
    setHidePerfect(false);
    setSelectedCategory("전체");
    setDetailOpen(null);
    setDetailStats(null);
  }, [selected?.assignment.id]);

  useEffect(() => {
    if (categoryTabs.length === 0) return;
    if (!categoryTabs.some((tab) => tab.category === selectedCategory)) {
      setSelectedCategory(categoryTabs[0]!.category);
    }
  }, [categoryTabs, selectedCategory]);

  const toggleProblem = (id: string) =>
    setCheckedProblemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section
      className="absolute z-[22] flex overflow-hidden bg-white"
      style={{
        left,
        top: 133,
        width,
        height: 973 - 149,
      }}
      aria-label="반 과제"
    >
      <div className="no-scrollbar min-w-0 flex-1 overflow-y-auto px-5 pb-8">
        {selectedAssignment && selectedSchedule ? (
          <>
            <header className="border-b border-[#E8EAED] py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {assignments.length > 0 ? (
                      <AssignmentPicker
                        assignments={assignments}
                        selectedId={selected?.assignment.id ?? null}
                        open={pickerOpen}
                        progressByAssignment={progressByAssignment}
                        studentCount={students.length}
                        onToggle={() => setPickerOpen((prev) => !prev)}
                        onSelect={(id) => {
                          setSelectedId(id);
                          setPickerOpen(false);
                        }}
                        onDelete={(view) => {
                          setDeleteError(null);
                          setDeletingAssignment(view);
                          setPickerOpen(false);
                        }}
                      />
                    ) : (
                      <h2 className="truncate text-[20px] font-bold text-[#15171A]">
                        {selectedAssignment.title}
                      </h2>
                    )}
                    <span className="shrink-0 rounded-full bg-[#EAF6FE] px-2.5 py-1 text-[11px] font-bold text-[#1274A9]">
                      {formatAssignmentPeriod(selectedSchedule)}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-[#9CA3AF]">
                    {problemSetItemSummary(selectedAssignment)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedAssignment) return;
                      setRenameDraft(selectedAssignment.title);
                      setRenameOpen(true);
                      setPickerOpen(false);
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[#E1E2E4] bg-white px-3.5 text-[13px] font-bold text-[#3D4148] transition-colors hover:border-[#1AA7F2] hover:bg-[#F0F9FE] hover:text-[#1274A9]"
                  >
                    이름 수정하기
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selected) return;
                      setDeleteError(null);
                      setDeletingAssignment(selected);
                      setPickerOpen(false);
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-[10px] border border-[#FECACA] bg-white px-3.5 text-[13px] font-bold text-[#EF4444] transition-colors hover:bg-[#FEF2F2]"
                  >
                    삭제하기
                  </button>
                </div>
              </div>
            </header>

            <div className="py-5">
              <div className="grid grid-cols-4 gap-3">
                <MetricCard
                  label="배정 학생"
                  value={`${students.length}명`}
                  detail={`응시 ${metrics.started}명`}
                />
                <MetricCard
                  label="완료"
                  value={`${metrics.completed}명`}
                  detail={`미학습 ${metrics.idle}명`}
                  highlight
                  detailStyle={{ color: "#EF4444" }}
                />
                <MetricCard
                  label="평균 점수"
                  value={metrics.avg != null ? `${metrics.avg}점` : "—"}
                  valueStyle={
                    metrics.avg != null ? undefined : { color: "#9CA3AF" }
                  }
                  detail="최근 완료 시도 기준"
                />
                <MetricCard
                  label="문항 수"
                  value={`${problemSetItemCount(selectedAssignment)}문항`}
                  detail={problemSetItemSummary(selectedAssignment).replace(
                    ` · 총 ${problemSetItemCount(selectedAssignment)}문제`,
                    "",
                  )}
                />
              </div>
            </div>

            <div className="mb-3">
              <p className="text-[14px] font-bold text-[#4B5563]">
                학생별 학습 현황
              </p>

              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-10 w-[240px] shrink-0 items-center rounded-full border border-[#E5E7EB] bg-white px-4">
                  <input
                    value={studentQuery}
                    onChange={(event) => setStudentQuery(event.target.value)}
                    placeholder="학생 이름 검색"
                    aria-label="학생 이름 검색"
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-[#15171A] outline-none placeholder:text-[#B0B4BB]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {studentFilterChips.map((chip) => {
                    const active = chip.id === studentFilter;
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => setStudentFilter(chip.id)}
                        className={`inline-flex h-9 cursor-pointer items-center rounded-full px-3.5 text-[12px] font-bold transition-colors ${
                          active ? chip.activeClass : chip.inactiveClass
                        } ${
                          active && chip.id !== "all"
                            ? "ring-2 ring-[#15171A]/10 ring-offset-1"
                            : ""
                        }`}
                      >
                        {chip.label} {chip.count}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={printableStudents.length === 0}
                  title={
                    printableStudents.length === 0
                      ? "제출한 학생의 오답 데이터가 생기면 출력할 수 있어요."
                      : "제출한 학생별 오답 시험지를 한 번에 미리보고 출력해요."
                  }
                  onClick={() =>
                    void openWrongAnswerPrint({
                      title: "학생 개별 오답 시험지 한 번에 출력",
                      rows: printableStudents,
                    })
                  }
                  className="ml-auto shrink-0 rounded-full bg-[#2F80ED] px-3.5 py-1.5 text-[12px] font-bold text-white transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  학생 개별 오답 시험지 한 번에 출력
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-[14px] border border-[#EDEFF2] bg-white">
              <div className="flex h-12 items-center border-b border-[#EDEFF2] px-5 text-[12px] font-semibold text-[#9CA3AF]">
                <span className="min-w-0 flex-1">학생</span>
                <span className="w-[104px]">학습 현황</span>
                <span className="w-[72px] text-center">진행률</span>
                <span className="w-[76px] text-center">정답률</span>
                <span className="w-[120px] text-center">점수 변화</span>
                <span className="w-[116px] text-center">과제 제출 시간</span>
                <span className="w-[108px]" aria-hidden />
              </div>

              {students.length === 0 ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center">
                  <p className="text-[14px] font-bold text-[#15171A]">
                    등록된 학생이 없어요
                  </p>
                  <p className="mt-1.5 text-[12px] text-[#9CA3AF]">
                    학생 탭에서 학생을 등록하면 학습 현황에 표시됩니다.
                  </p>
                </div>
              ) : visibleStudentProgress.length === 0 ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center">
                  <p className="text-[14px] font-bold text-[#15171A]">
                    조건에 맞는 학생이 없어요
                  </p>
                  <p className="mt-1.5 text-[12px] text-[#9CA3AF]">
                    필터나 검색어를 바꿔 보세요.
                  </p>
                </div>
              ) : (
                <ul>
                  {visibleStudentProgress.map((row) => {
                    const badge = statusBadge(row.status);
                    const scoreChange = (() => {
                      if (row.firstScore == null && row.latestScore == null) {
                        return "—";
                      }
                      if (
                        row.firstScore != null &&
                        row.latestScore != null &&
                        row.firstScore !== row.latestScore
                      ) {
                        const delta = Math.round(row.latestScore - row.firstScore);
                        const sign = delta > 0 ? "+" : "";
                        return `${Math.round(row.firstScore)} → ${Math.round(row.latestScore)} (${sign}${delta})`;
                      }
                      if (row.latestScore != null) {
                        return `${Math.round(row.latestScore)}`;
                      }
                      return "—";
                    })();
                    return (
                      <li
                        key={row.studentId}
                        className="flex h-[68px] items-center border-b border-[#F3F4F6] px-5 last:border-b-0"
                      >
                        <span className="flex min-w-0 flex-1 items-center">
                          <span className="truncate text-[14px] font-bold text-[#15171A]">
                            {row.studentName}
                          </span>
                        </span>
                        <span className="w-[104px]">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${badge.className}`}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: badge.dot }}
                              aria-hidden
                            />
                            {badge.label}
                          </span>
                        </span>
                        <span className="w-[72px] text-center text-[13px] font-medium text-[#6B7280]">
                          {row.progressPercent}%
                        </span>
                        <span className="w-[76px] text-center text-[13px] text-[#6B7280]">
                          {row.latestAccuracy != null
                            ? `${row.latestAccuracy}%`
                            : "—"}
                        </span>
                        <span className="w-[120px] text-center text-[12px] text-[#6B7280]">
                          {scoreChange}
                        </span>
                        <span className="w-[116px] text-center text-[13px] text-[#6B7280]">
                          {formatSubmittedAt(row.submittedAt)}
                        </span>
                        <span className="flex w-[108px] justify-end">
                          <button
                            type="button"
                            disabled={row.status === "idle"}
                            title={
                              row.status === "idle"
                                ? `${row.studentName} 학생이 과제를 제출하면 출력할 수 있어요.`
                                : `${row.studentName} 학생의 오답 시험지를 미리보고 출력해요.`
                            }
                            onClick={() =>
                              void openWrongAnswerPrint({
                                title: `${row.studentName} · 오답 시험지 출력`,
                                rows: [row],
                              })
                            }
                            className="w-[108px] whitespace-nowrap rounded-[10px] border border-[#D8DCE2] bg-white px-2 py-2 text-center text-[12px] font-bold text-[#3D4148] transition-colors hover:bg-[#F7F8F9] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            오답 시험지 출력
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* 과제 결과 — 분류별 문제 정답률 */}
            <div className="mt-8 border-t border-[#EDEFF2] pt-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-[20px] font-bold tracking-[-0.02em] text-[#15171A]">
                    과제 결과
                  </h3>
                  <p className="mt-1.5 text-[13px] font-medium leading-5 text-[#8A8F98]">
                    단어·문장·문법을 나눠 보고, 오답이 많은 문제를 확인해 보세요.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-4 gap-3.5">
                <ResultCard
                  accent="#1AA7F2"
                  accentSoft="#EAF6FE"
                  icon={
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M4 19V9M10 19V5M16 19v-7M22 19V3" />
                    </svg>
                  }
                  label="평균 정답률"
                  value={
                    resultMetrics.avgAccuracy != null
                      ? `${resultMetrics.avgAccuracy}%`
                      : "—"
                  }
                  valueTone={
                    resultMetrics.avgAccuracy != null ? "blue" : "muted"
                  }
                  detail={
                    resultMetrics.answeredCount > 0
                      ? `${resultMetrics.answeredCount}문항 기준`
                      : "제출 데이터 없음"
                  }
                />
                <ResultCard
                  accent="#EF4444"
                  accentSoft="#FEF2F2"
                  icon={
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M12 8.5v5" />
                      <path d="M12 16.8h.01" />
                    </svg>
                  }
                  label="미학습 학생"
                  value={`${metrics.idle}명`}
                  valueTone="red"
                  detail={`전체 ${students.length}명 중`}
                />
                <ResultCard
                  accent="#D97706"
                  accentSoft="#FFFBEB"
                  icon={
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M7 7L17 17" />
                      <path d="M10 17h7V10" />
                    </svg>
                  }
                  label="정답률 70% 미만"
                  value={
                    resultMetrics.answeredCount > 0
                      ? `${resultMetrics.weakCount}문항`
                      : "—"
                  }
                  valueTone={
                    resultMetrics.answeredCount > 0 ? "amber" : "muted"
                  }
                  detail="다시 학습이 필요한 문제"
                />
                <ReissueResultCard
                  enabled={canReissueWeak}
                  weakCount={weakProblemIds.length}
                  error={reissueError}
                  onCreate={() => startReissueWrongProblems(weakProblemIds)}
                />
              </div>

              {categoryTabs.length > 0 ? (
                <div
                  className="mt-5 grid gap-3"
                  style={{
                    gridTemplateColumns: `repeat(${categoryTabs.length}, minmax(0, 1fr))`,
                  }}
                  role="tablist"
                  aria-label="문제 분류"
                >
                  {categoryTabs.map((tab) => {
                    const active = tab.category === selectedCategory;
                    const tone = CATEGORY_TAB[tab.category];
                    return (
                      <button
                        key={tab.category}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setSelectedCategory(tab.category)}
                        className={`rounded-[16px] border px-4 py-3.5 text-left transition-all ${
                          active
                            ? `${tone.active} shadow-[0_1px_3px_rgba(0,0,0,0.06)]`
                            : `${tone.idle} hover:border-[#D8DCE2] hover:bg-[#FAFBFC]`
                        }`}
                      >
                        <span className="block text-[12px] font-bold">
                          {tab.category}
                          <span className="ml-1.5 font-medium opacity-65">
                            {tab.count}문항
                          </span>
                        </span>
                        <span
                          className={`mt-2 block text-[22px] font-bold leading-none tabular-nums tracking-[-0.02em] ${
                            active ? tone.accent : "text-[#15171A]"
                          }`}
                        >
                          {tab.avgAccuracy != null
                            ? `평균 ${tab.avgAccuracy}%`
                            : "평균 —"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="mt-5 flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-[#4B5563]">
                  <input
                    type="checkbox"
                    checked={hidePerfect}
                    onChange={(event) => setHidePerfect(event.target.checked)}
                    className="h-4 w-4 rounded border-[#D1D5DB] accent-[#1AA7F2]"
                  />
                  정답률 100% 문제 숨기기
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
                  }
                  className="flex items-center gap-1.5 rounded-[10px] border border-[#E5E7EB] bg-white px-3.5 py-2 text-[13px] font-medium text-[#6B7280] transition-colors hover:border-[#D0D3D9] hover:bg-[#FAFBFC]"
                >
                  정렬: 정답률 {sortOrder === "asc" ? "낮은" : "높은"} 순
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden
                    className={`shrink-0 transition-transform ${sortOrder === "desc" ? "rotate-180" : ""}`}
                  >
                    <path
                      d="M3 5l3 3 3-3"
                      stroke="#9CA3AF"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>

              <div className="mt-3 overflow-hidden rounded-[16px] border border-[#EDEFF2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="flex h-11 items-center border-b border-[#EDEFF2] bg-[#FAFBFC] px-5 text-[12px] font-semibold text-[#9CA3AF]">
                  <span className="w-10" />
                  <span className="w-[88px]">분류</span>
                  <span className="min-w-0 flex-1">문제</span>
                  <span className="w-[220px]">정답률</span>
                </div>

                {visibleProblemRows.length === 0 ? (
                  <div className="flex min-h-[160px] flex-col items-center justify-center px-6 text-center">
                    <p className="text-[14px] font-bold text-[#15171A]">
                      {problemRows.length === 0
                        ? "출제한 문제가 없어요"
                        : "표시할 문제가 없어요"}
                    </p>
                  </div>
                ) : (
                  <ul>
                    {visibleProblemRows.map((row) => {
                      const checked = checkedProblemIds.has(row.id);
                      const rate = row.correctRate;
                      return (
                        <li
                          key={row.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openProblemDetail(row)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openProblemDetail(row);
                            }
                          }}
                          className="group flex h-[54px] cursor-pointer items-center border-b border-[#F3F4F6] px-5 last:border-b-0 transition-colors hover:bg-[#F0F9FE]"
                        >
                          <span
                            className="w-10"
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={checked}
                              aria-label={`${row.text} 선택`}
                              onClick={() => toggleProblem(row.id)}
                              className={`flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-[5px] border outline-none transition-colors focus:outline-none focus-visible:outline-none ${
                                checked
                                  ? "border-[#1AA7F2] bg-[#1AA7F2]"
                                  : "border-[#D1D5DB] bg-white hover:border-[#9DD9F8]"
                              }`}
                            >
                              {checked ? (
                                <svg
                                  width="11"
                                  height="9"
                                  viewBox="0 0 11 9"
                                  fill="none"
                                  aria-hidden
                                >
                                  <path
                                    d="M1.5 4.5 4 7l5.5-5.5"
                                    stroke="white"
                                    strokeWidth="1.7"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              ) : null}
                            </button>
                          </span>
                          <span className="w-[88px]">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${CATEGORY_BADGE[row.category]}`}
                            >
                              {row.category}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1 truncate pr-4 text-[14px] font-medium text-[#15171A] group-hover:text-[#0F6F9E]">
                            {row.text}
                          </span>
                          <span className="flex w-[220px] items-center gap-3">
                            <span className="h-[7px] flex-1 overflow-hidden rounded-full bg-[#EDEFF2]">
                              {rate != null ? (
                                <span
                                  className="block h-full rounded-full transition-[width]"
                                  style={{
                                    width: `${Math.max(0, Math.min(100, rate))}%`,
                                    backgroundColor:
                                      rate < 70
                                        ? "#F59E0B"
                                        : rate === 100
                                          ? "#10B981"
                                          : "#1AA7F2",
                                  }}
                                />
                              ) : null}
                            </span>
                            <span
                              className={`w-9 text-right text-[13px] font-bold tabular-nums ${
                                rate != null
                                  ? rate < 70
                                    ? "text-[#D97706]"
                                    : "text-[#15171A]"
                                  : "text-[#C3C7CD]"
                              }`}
                            >
                              {rate != null ? `${rate}%` : "—"}
                            </span>
                            <span
                              className="text-[14px] font-medium text-[#C3C7CD] transition-colors group-hover:text-[#1AA7F2]"
                              aria-hidden
                            >
                              ›
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="mt-4 flex items-center justify-center gap-3 pb-2">
                <span className="text-[13px] font-medium text-[#9CA3AF]">
                  {checkedProblemIds.size}개 선택됨
                </span>
                <button
                  type="button"
                  disabled={!canReissueSelected}
                  title={
                    canReissueSelected
                      ? "선택한 문제만 모아 앱에서 다시 풀게 해요."
                      : "다시 출제할 문제를 선택해 주세요."
                  }
                  onClick={() =>
                    startReissueWrongProblems([...checkedProblemIds])
                  }
                  className={`rounded-[10px] px-4 py-2.5 text-[13px] font-bold ${
                    canReissueSelected
                      ? "bg-[#2F80ED] text-white hover:brightness-95"
                      : "cursor-not-allowed bg-[#F3F4F6] text-[#B0B4BB]"
                  }`}
                >
                  선택한 문제 오답만 다시 출제
                </button>
              </div>
            </div>

            {detailOpen ? (
              <ProblemDetailModal
                row={detailOpen.row}
                loading={detailLoading}
                stats={detailStats}
                onClose={closeProblemDetail}
              />
            ) : null}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-[16px] font-bold text-[#15171A]">
              아직 부여한 과제가 없어요
            </p>
            <p className="mt-2 text-[13px] text-[#9CA3AF]">
              문제 관리에서 받을 반을 선택하고 제출해 주세요.
            </p>
          </div>
        )}
      </div>

      <DeleteAssignmentModal
        open={deletingAssignment !== null}
        meta={
          deletingAssignment
            ? `${deletingAssignment.problemSet.grade} · ${deletingAssignment.problemSet.textbook} · ${deletingAssignment.problemSet.unit}`
            : ""
        }
        deadline={
          deletingAssignment
            ? formatDeadlineCancelTag(deletingAssignment.assignment)
            : ""
        }
        busy={deletingBusy}
        error={deleteError}
        onClose={() => {
          setDeletingAssignment(null);
          setDeleteError(null);
        }}
        onConfirm={confirmDeleteAssignment}
      />

      {printOpen ? (
        <WrongAnswerPrintModal
          title={printTitle}
          sheets={printSheets}
          loading={printLoading}
          error={printError}
          onClose={() => {
            setPrintOpen(false);
            setPrintSheets(null);
            setPrintError(null);
            setPrintLoading(false);
          }}
        />
      ) : null}

      {reissueOpen && reissueProblemSet && selectedSchedule ? (
        <AssignAssignmentModal
          open={reissueOpen}
          classes={classes}
          classIds={[selectedSchedule.classId]}
          overlayClassName="z-[100]"
          onClose={() => {
            if (reissueBusy) return;
            setReissueOpen(false);
            setReissueProblemSet(null);
          }}
          onConfirm={(draftAssignments: CreateClassAssignmentInput[]) => {
            if (!reissueProblemSet) return;
            setReissueBusy(true);
            void (async () => {
              try {
                const problemSetId = reissueProblemSet.id;
                const nextAssignments = upsertAssignmentsForProblemSet(
                  problemSetId,
                  draftAssignments.map((item) => ({
                    ...item,
                    problemSetId,
                  })),
                );
                const assignedClassIds = draftAssignments.map(
                  (item) => item.classId,
                );
                const nextSets = updateProblemSet(
                  loadProblemSets(),
                  problemSetId,
                  { assignedClassIds },
                );
                persistProblemSets(nextSets);
                const problemSet =
                  nextSets.find((item) => item.id === problemSetId) ??
                  reissueProblemSet;
                await publishProblemSetAndAssignments({
                  problemSet,
                  assignments: nextAssignments.filter(
                    (item) => item.problemSetId === problemSetId,
                  ),
                });
                setReissueOpen(false);
                setReissueProblemSet(null);
                setCheckedProblemIds(new Set());
                setReissueBusy(false);
              } catch {
                setReissueBusy(false);
                setReissueError("부여하지 못했어요. 다시 시도해 주세요.");
                setReissueOpen(false);
              }
            })();
          }}
        />
      ) : null}

      <RenameAssignmentTitleModal
        open={renameOpen}
        value={renameDraft}
        onChange={setRenameDraft}
        onClose={() => setRenameOpen(false)}
        onConfirm={confirmRenameTitle}
      />
    </section>
  );
}

function AssignmentPicker({
  assignments,
  selectedId,
  open,
  progressByAssignment,
  studentCount,
  onToggle,
  onSelect,
  onDelete,
}: {
  assignments: AssignedProblemView[];
  selectedId: string | null;
  open: boolean;
  progressByAssignment: Record<string, StudentProgressRow[]>;
  studentCount: number;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onDelete: (view: AssignedProblemView) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const selected =
    assignments.find((item) => item.assignment.id === selectedId) ??
    assignments[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onToggle();
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, onToggle]);

  if (!selected) return null;

  const selectedCompleted = isAssignmentFullyCompleted(
    progressByAssignment[selected.assignment.id],
    studentCount,
  );

  return (
    <div ref={ref} className="relative inline-flex max-w-full">
      <button
        type="button"
        aria-label="부여한 과제 선택"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={onToggle}
        className={`inline-flex h-12 max-w-full items-center gap-2.5 rounded-[10px] border bg-white px-4 text-left text-[16px] font-bold outline-none transition-colors ${
          open
            ? "border-[#1AA7F2] ring-1 ring-[#1AA7F2]"
            : "border-[#E5E7EB] hover:border-[#D0D3D9]"
        } text-[#15171A]`}
      >
        <span className="max-w-[360px] truncate">
          {assignmentPickerLabel(selected.problemSet)}
          {selectedCompleted ? (
            <span className="text-[#10B981]"> (완료)</span>
          ) : null}
        </span>
        <svg
          aria-hidden
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
        >
          <path
            d="M1 1.5L5 4.5L9 1.5"
            stroke="#9CA3AF"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label="부여한 과제 목록"
          className="no-scrollbar absolute left-0 top-[52px] z-30 max-h-[280px] min-w-full w-max max-w-[400px] overflow-y-auto rounded-[10px] border border-[#E5E7EB] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        >
          {assignments.map((view) => {
            const { assignment, problemSet } = view;
            const active = assignment.id === selected.assignment.id;
            const completed = isAssignmentFullyCompleted(
              progressByAssignment[assignment.id],
              studentCount,
            );
            return (
              <li key={assignment.id} className="group relative">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => onSelect(assignment.id)}
                  className={`w-full px-4 py-3 pr-10 text-left transition-colors ${
                    active ? "bg-[#EAF6FE]" : "hover:bg-[#F3F4F6]"
                  }`}
                >
                  <span className="block truncate text-[15px] font-bold text-[#15171A]">
                    {assignmentPickerLabel(problemSet)}
                    {completed ? (
                      <span className="text-[#10B981]"> (완료)</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[12px] font-medium text-[#9CA3AF]">
                    {formatAssignmentSchedule(assignment)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(view);
                  }}
                  aria-label={`「${problemSet.title}」 부여 취소`}
                  title="부여한 과제 취소"
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[#B0B4BB] opacity-0 transition-all hover:bg-[#FEE7E7] hover:text-[#C52B2B] group-hover:opacity-100"
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 11 11"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M1.5 1.5l8 8M9.5 1.5l-8 8"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function RenameAssignmentTitleModal({
  open,
  value,
  onChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const canSave = value.trim().length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/35 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="과제 이름 수정"
        className="relative w-full max-w-[400px] overflow-hidden rounded-2xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-7 pt-6 pb-2">
          <h2 className="text-[18px] font-bold tracking-tight text-[#15171A]">
            이름 수정하기
          </h2>
          <p className="mt-2 text-[13px] font-medium text-[#8B8F96]">
            과제에 보이는 이름만 바꿔요.
          </p>
          <input
            autoFocus
            value={value}
            aria-label="과제 이름"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canSave) onConfirm();
            }}
            className="mt-4 h-11 w-full rounded-[10px] border border-[#E1E2E4] px-3 text-[14px] font-semibold text-[#15171A] outline-none focus:border-[#1AA7F2] focus:ring-2 focus:ring-[#1AA7F2]/20"
          />
        </div>

        <div className="flex justify-end gap-2 px-7 py-5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-[10px] border border-[#E1E2E4] px-4 text-[14px] font-bold text-[#3D4148] hover:bg-[#F3F4F5]"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={onConfirm}
            className="h-10 rounded-[10px] bg-[#1AA7F2] px-5 text-[14px] font-bold text-white transition-colors hover:bg-[#1596D9] disabled:cursor-not-allowed disabled:bg-[#E5E7EB] disabled:text-[#6B7280]"
          >
            저장
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 부여 취소 팝업 마감 칩 — `마감 7월 24일 · 다음 수업 전까지` */
function formatDeadlineCancelTag(assignment: ClassAssignment): string {
  const dateLabel = formatLessonDateKo(assignment.deadlineDate);
  if (assignment.deadlineUntilNextLesson) {
    return `마감 ${dateLabel} · 다음 수업 전까지`;
  }
  return `마감 ${dateLabel} · ${assignment.deadlineTime}`;
}

function DeleteAssignmentModal({
  open,
  meta,
  deadline,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  meta: string;
  deadline: string;
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/35 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="이 과제 부여를 취소할까요?"
        className="relative w-full max-w-[520px] overflow-hidden rounded-[28px] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-8 pt-8 pb-2">
          <AlertBadgeIcon
            className="mb-5"
            size={58}
            iconSize={28}
            background="#FFEBE8"
            color="#D40924"
          />
          <h2 className="text-[22px] font-bold tracking-tight text-[#13161B]">
            이 과제 부여를 취소할까요?
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {meta ? (
              <span className="inline-flex items-center rounded-full bg-[#ECEFF2] px-3.5 py-2 text-[13px] font-bold text-[#3C434D]">
                {meta}
              </span>
            ) : null}
            {deadline ? (
              <span className="inline-flex items-center rounded-full bg-[#FFEBE6] px-3.5 py-2 text-[13px] font-bold text-[#AC3225]">
                {deadline}
              </span>
            ) : null}
          </div>
          <p className="mt-4 text-[14px] leading-relaxed text-[#52555B]">
            취소하면 이 반의 과제 목록에서 바로 사라져요.
            <br />
            사용자 지정 과제는 삭제되지 않고 그대로 남아요.
          </p>
          {error ? (
            <p className="mt-3 rounded-[10px] bg-[#FFEBE8] px-3 py-2 text-[13px] font-medium text-[#D40924]">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex gap-3 px-8 pb-8 pt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-[52px] flex-1 rounded-[16px] border border-[#D5D7DB] bg-white text-[15px] font-bold text-[#2B2E33] transition-colors hover:bg-[#F7F8F9] disabled:cursor-not-allowed disabled:opacity-60"
          >
            닫기
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="h-[52px] flex-1 rounded-[16px] bg-[#D40924] text-[15px] font-bold text-white transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "취소 중…" : "과제 취소하기"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ProblemDetailModal({
  row,
  loading,
  stats,
  onClose,
}: {
  row: AssignmentProblemRow;
  loading: boolean;
  stats: QuestionDetailStats | null;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;

  const overallRate = (() => {
    if (!stats?.types.length) return null;
    const answered = stats.types.reduce((sum, t) => sum + t.answeredCount, 0);
    if (answered === 0) return null;
    const correct = stats.types.reduce(
      (sum, t) => sum + t.correctStudents.length,
      0,
    );
    return Math.round((correct / answered) * 100);
  })();

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${row.text} 유형별 정답`}
        className="flex max-h-[min(720px,90vh)] w-full max-w-[520px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative border-b border-[#ECEDEF] bg-gradient-to-b from-[#F0F9FE] to-white px-6 pb-5 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${CATEGORY_BADGE[row.category]}`}
                >
                  {row.category}
                </span>
                {overallRate != null ? (
                  <span className="inline-flex items-center rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-[#1274A9] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    종합 {overallRate}%
                  </span>
                ) : null}
              </div>
              <h3 className="mt-2.5 text-[18px] font-bold tracking-[-0.02em] leading-snug text-[#15171A]">
                {row.text}
              </h3>
              <p className="mt-1 text-[13px] font-medium text-[#8A8F98]">
                유형별 정답률 · 맞힌 학생 · 틀린 학생
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[20px] text-[#9CA3AF] transition-colors hover:bg-white hover:text-[#3D4148]"
            >
              ×
            </button>
          </div>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 text-center">
              <span className="h-8 w-8 animate-pulse rounded-full bg-[#E7F5FE]" />
              <p className="text-[13px] font-medium text-[#9CA3AF]">
                결과를 불러오는 중…
              </p>
            </div>
          ) : !stats || stats.types.length === 0 ? (
            <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[16px] border border-dashed border-[#E3E5E8] bg-[#FAFBFC] px-6 text-center">
              <p className="text-[14px] font-bold text-[#15171A]">
                아직 제출이 없어요
              </p>
              <p className="mt-1.5 text-[12px] leading-5 text-[#9CA3AF]">
                학생이 이 문제를 풀면 유형별 정답률과
                <br />
                맞힌·틀린 학생이 여기에 표시돼요.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.types.map((type) => {
                const rate = type.correctRate;
                return (
                  <section
                    key={type.typeKey}
                    className="overflow-hidden rounded-[16px] border border-[#EDEFF2] bg-white"
                  >
                    <div className="flex items-center gap-3 border-b border-[#F3F4F6] px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-[14px] font-bold text-[#15171A]">
                          {type.typeLabel}
                        </h4>
                        <p className="mt-0.5 text-[11px] font-medium text-[#A0A5AD]">
                          {type.answeredCount}명 응답
                        </p>
                      </div>
                      <div className="w-[120px] shrink-0">
                        <div className="flex items-center justify-end gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#EDEFF2]">
                            {rate != null ? (
                              <span
                                className="block h-full rounded-full"
                                style={{
                                  width: `${Math.max(0, Math.min(100, rate))}%`,
                                  backgroundColor:
                                    rate < 70
                                      ? "#F59E0B"
                                      : rate === 100
                                        ? "#10B981"
                                        : "#1AA7F2",
                                }}
                              />
                            ) : null}
                          </span>
                          <span
                            className={`w-10 text-right text-[16px] font-bold tabular-nums ${
                              rate == null
                                ? "text-[#C3C7CD]"
                                : rate < 70
                                  ? "text-[#D97706]"
                                  : "text-[#1274A9]"
                            }`}
                          >
                            {rate != null ? `${rate}%` : "—"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-0 sm:grid-cols-2">
                      <div className="border-b border-[#F3F4F6] px-4 py-3 sm:border-b-0 sm:border-r">
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-[#047857]">
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-[#10B981]"
                            aria-hidden
                          />
                          맞힌 학생
                          <span className="font-medium text-[#86B8A4]">
                            {type.correctStudents.length}
                          </span>
                        </p>
                        {type.correctStudents.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {type.correctStudents.map((s) => (
                              <span
                                key={s.studentId}
                                className="inline-flex max-w-full truncate rounded-full bg-[#E8F8EF] px-2.5 py-1 text-[12px] font-semibold text-[#047857]"
                              >
                                {s.studentName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[12px] font-medium text-[#C3C7CD]">
                            없음
                          </p>
                        )}
                      </div>
                      <div className="px-4 py-3">
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-[#C52B2B]">
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-[#EF4444]"
                            aria-hidden
                          />
                          틀린 학생
                          <span className="font-medium text-[#E3A0A0]">
                            {type.wrongStudents.length}
                          </span>
                        </p>
                        {type.wrongStudents.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {type.wrongStudents.map((s) => (
                              <span
                                key={s.studentId}
                                className="inline-flex max-w-full truncate rounded-full bg-[#FEE7E7] px-2.5 py-1 text-[12px] font-semibold text-[#C52B2B]"
                              >
                                {s.studentName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[12px] font-medium text-[#C3C7CD]">
                            없음
                          </p>
                        )}
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-[#ECEDEF] px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-[10px] bg-[#1AA7F2] px-5 text-[14px] font-bold text-white transition-colors hover:bg-[#1596D9]"
          >
            확인
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ReissueResultCard({
  enabled,
  weakCount,
  error,
  onCreate,
}: {
  enabled: boolean;
  weakCount: number;
  error: string | null;
  onCreate: () => void;
}) {
  return (
    <article className="flex min-h-[118px] min-w-0 flex-col rounded-[14px] border border-[#E8EAED] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[#059669]"
          style={{ backgroundColor: "#ECFDF5" }}
          aria-hidden
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 1 1 2.64 6.36" />
            <path d="M3 22v-6h6" />
          </svg>
        </span>
        <span className="text-[12px] font-semibold tracking-[-0.01em] text-[#6B7280]">
          오답만 다시 출제
        </span>
      </div>

      <p className="mt-3 flex-1 text-[12px] font-medium leading-[1.55] tracking-[-0.01em] text-[#8B919A]">
        {enabled
          ? `정답률 100% 미만 ${weakCount}문항을 모아 앱에서 다시 풀게 할 수 있어요.`
          : "아직 오답 데이터가 없어요. 제출 후 만들 수 있어요."}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2">
        {error ? (
          <p className="min-w-0 truncate text-[11px] font-medium text-[#DC2626]">
            {error}
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={!enabled}
          title={
            enabled
              ? "오답 문항으로 새 과제를 만들어요."
              : "정답률이 100% 미만인 문제가 생기면 만들 수 있어요."
          }
          onClick={onCreate}
          className="h-8 shrink-0 rounded-[8px] bg-[#1AA7F2] px-3.5 text-[12px] font-bold tracking-[-0.01em] text-white transition-colors hover:bg-[#1596d9] disabled:cursor-not-allowed disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF]"
        >
          만들기
        </button>
      </div>
    </article>
  );
}

const VALUE_TONE: Record<"blue" | "red" | "amber" | "muted", string> = {
  blue: "text-[#1274A9]",
  red: "text-[#DC2626]",
  amber: "text-[#B45309]",
  muted: "text-[#9CA3AF]",
};

function ResultCard({
  accent,
  accentSoft,
  icon,
  label,
  value,
  valueTone = "muted",
  detail,
}: {
  accent: string;
  accentSoft: string;
  icon: ReactNode;
  label: string;
  value: string;
  valueTone?: keyof typeof VALUE_TONE;
  detail: string;
}) {
  return (
    <article className="flex min-h-[118px] min-w-0 flex-col rounded-[14px] border border-[#E8EAED] bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]"
          style={{ backgroundColor: accentSoft, color: accent }}
          aria-hidden
        >
          {icon}
        </span>
        <span className="text-[12px] font-semibold tracking-[-0.01em] text-[#6B7280]">
          {label}
        </span>
      </div>

      <p
        className={`mt-3 text-[26px] font-bold leading-none tracking-[-0.03em] tabular-nums ${VALUE_TONE[valueTone]}`}
      >
        {value}
      </p>
      <p className="mt-2 text-[12px] font-medium tracking-[-0.01em] text-[#9CA3AF]">
        {detail}
      </p>
    </article>
  );
}

function MetricCard({
  label,
  value,
  detail,
  highlight = false,
  valueStyle,
  detailStyle,
}: {
  label: string;
  value: string;
  detail: string;
  highlight?: boolean;
  valueStyle?: { color: string };
  detailStyle?: { color: string };
}) {
  return (
    <article
      className="min-h-[88px] min-w-0 rounded-[16px] border border-[#EDEFF2] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      style={{ backgroundColor: highlight ? "#F6F6F6" : "#FFFFFF" }}
    >
      <p className="text-[12px] font-medium text-[#9CA3AF]">{label}</p>
      <p
        className="mt-1.5 text-[24px] font-bold leading-none tabular-nums text-[#15171A]"
        style={valueStyle}
      >
        {value}
      </p>
      <p
        className="mt-2 truncate text-[11px] font-medium text-[#B0B4BB]"
        style={detailStyle}
        title={detail}
      >
        {detail}
      </p>
    </article>
  );
}
