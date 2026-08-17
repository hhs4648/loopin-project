"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { CLASS_LAYOUT } from "@/lib/class-layout";
import {
  formatOpenAtKo,
  isScheduledForLater,
} from "@/lib/assignment-open-at";
import type { ClassStudent } from "@/lib/class-students";
import { AlertBadgeIcon } from "@/components/teacher/AlertBadgeIcon";
import { ReissueWrongAnswersModal } from "@/components/teacher/ReissueWrongAnswersModal";
import {
  formatAssignmentPeriod,
  formatAssignmentSchedule,
  formatLessonDateKo,
  hasAssignmentDeadline,
  loadClassAssignments,
  removeAssignmentsByIds,
  saveClassAssignments,
  type AssignedProblemView,
  type ClassAssignment,
} from "@/lib/class-assignments";
import { stripBrackets } from "@/lib/problem-bank";
import {
  loadProblemSets,
  persistProblemSets,
  problemSetItemCount,
  problemSetItemSummary,
  problemSetPartLabel,
  updateProblemSet,
  type SavedProblemSet,
} from "@/lib/problem-sets";
import { buildContentSnapshot } from "@/lib/sync/content-snapshot";
import {
  deleteClassAssignmentRemote,
  fetchQuestionDetailStats,
  fetchQuestionStats,
  fetchWrongAnswersForStudent,
} from "@/lib/sync/teacher-sync";
import type {
  QuestionDetailStats,
  QuestionStat,
  StudentProgressRow,
} from "@/lib/sync/types";
import { loadTeacherProfile } from "@/lib/teacher-profile";
import type { TeacherClass } from "@/lib/teacher-classes";
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
  /** 반 정보(호출부 호환용 — 오답 재출제는 마감을 쓰지 않음) */
  teacherClass?: TeacherClass | null;
};

type StudentProgressFilter = "all" | "idle" | "in_progress" | "completed";

/**
 * 오답 재출제 전용 필터.
 *
 * 재출제 과제는 **그 학생이 틀렸던 문항만** 담겨 있다. 그래서 선생님이 궁금한 건
 * 「진행중이냐」가 아니라 **「틀린 걸 고쳤냐」** 다 — 전부 정답이면 「만점」이다.
 * 그래서 반 전체 과제의 진행 단계 칩(미학습·진행중·완료)을 이 축으로 갈아끼운다.
 */
type ReissueProgressFilter = "all" | "unsubmitted" | "still-wrong" | "fixed";

/**
 * 재출제에서 이 학생이 어디에 속하는지.
 *
 * **점수(%)가 아니라 맞은 개수로 판정한다.** 점수는 반올림된 값이라 96%가 100처럼 보이거나
 * 그 반대가 생긴다 — 실제로 「보완 필요인데 정답 7/7」로 표시가 어긋난 적이 있다(2026-08-09).
 * 표의 개수와 배지가 **같은 값**에서 나와야 절대 모순되지 않는다.
 */
function resolveReissueOutcome(
  row: StudentProgressRow,
): Exclude<ReissueProgressFilter, "all"> {
  // 아직 결과가 없는 상태(미학습·푸는 중)는 한 칸으로 묶는다 — 둘 다 「아직 안 냄」이다
  if (row.status !== "completed") return "unsubmitted";
  const answered = row.latestAnsweredCount;
  const correct = row.latestCorrectCount;
  if (answered != null && correct != null && answered > 0) {
    // 재출제는 틀렸던 것만 모아 놓았으므로 **하나도 안 틀려야** 다 고친 것
    return correct >= answered ? "fixed" : "still-wrong";
  }
  // 개수가 없는 옛 기록만 점수로 판정 (100점 미만이면 남은 오답이 있다)
  return (row.latestScore ?? 0) >= 100 ? "fixed" : "still-wrong";
}

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

/**
 * 재출제 표의 「결과」 배지 — 진행 단계가 아니라 **오답을 고쳤는지**를 보여준다.
 * 칩(`reissueChips`)과 같은 구분·같은 색을 쓴다.
 */
function reissueOutcomeBadge(row: StudentProgressRow) {
  const outcome = resolveReissueOutcome(row);
  if (outcome === "fixed") {
    return {
      label: "만점",
      className: "bg-[#E8F8EF] text-[#047857]",
      dot: "#10B981",
    };
  }
  if (outcome === "still-wrong") {
    return {
      label: "보완 필요",
      className: "bg-[#FEE7E7] text-[#C52B2B]",
      dot: "#EF4444",
    };
  }
  return {
    label: "미제출",
    className: "bg-[#F3F4F6] text-[#4B5563]",
    dot: "#9CA3AF",
  };
}

/** 과제 탭 드롭다운용 — 학년·교과서는 반이 같아 생략 */
function assignmentPickerLabel(problemSet: SavedProblemSet): string {
  const unit = problemSet.unit
    .replace(/\s·\s오답(?:\s.*)?$/, "")
    .replace(/\.오답문제$/, "")
    .trim();
  const part = problemSetPartLabel(problemSet.part);
  const count = `${problemSetItemCount(problemSet)}문제`;
  const segments = [unit || problemSet.unit, ...(part ? [part] : []), count];
  return segments.filter(Boolean).join(" · ");
}

function resolveTargetStudentLabel(
  assignment: ClassAssignment,
  students: ClassStudent[],
): string | null {
  if (!assignment.targetStudentId) return null;
  const name = students.find(
    (student) => student.id === assignment.targetStudentId,
  )?.name;
  return name?.trim() || "개인";
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
  teacherClass = null,
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
  const [reissueFilter, setReissueFilter] =
    useState<ReissueProgressFilter>("all");
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
    // 재출제 칩은 별도 상태라 같이 풀어 준다 — 안 그러면 「보완 필요」가 걸린 채
    // 다른 과제로 넘어가 학생이 없는 것처럼 보인다
    setReissueFilter("all");
  }, [selectedId]);

  async function confirmDeleteAssignment() {
    if (!deletingAssignment) return;

    /*
      재출제는 학생 수만큼 과제가 쪼개져 있다 — 20명에게 냈으면 20개다.
      드롭다운에는 한 줄로 접혀 보이므로, 취소도 **묶음 통째로** 해야 한다.
      하나만 지우면 나머지 19개가 유령처럼 남고 화면에는 안 보인다.
    */
    const target = deletingAssignment.assignment;
    const batchKey = batchKeyOf(target);
    const ids = batchKey
      ? assignments
          .filter((item) => batchKeyOf(item.assignment) === batchKey)
          .map((item) => item.assignment.id)
      : [target.id];

    setDeletingBusy(true);
    setDeleteError(null);

    // 원격 삭제가 실제로 성공한 뒤에만 로컬 목록에서 지운다 —
    // 실패했는데 화면에서만 사라지면 학생 앱 DB에는 그대로 남아 헷갈린다.
    const deleted: string[] = [];
    for (const id of ids) {
      const result = await deleteClassAssignmentRemote(id);
      if (!result.ok) break;
      deleted.push(id);
    }

    // 일부만 지워졌으면 지워진 것까지는 로컬에도 반영하고 나머지는 남긴다.
    // 전부 실패했을 때만 아무것도 건드리지 않는다.
    if (deleted.length > 0) {
      saveClassAssignments(
        removeAssignmentsByIds(loadClassAssignments(), deleted),
      );
    }

    if (deleted.length < ids.length) {
      setDeletingBusy(false);
      setDeleteError(
        deleted.length === 0
          ? "삭제에 실패했어요. 네트워크를 확인하고 다시 시도해 주세요."
          : `${ids.length}명 중 ${deleted.length}명만 취소됐어요. 다시 시도해 주세요.`,
      );
      return;
    }

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

  /**
   * 재출제 묶음의 키 — 같은 「앱에 내기」로 나간 과제들이 공유한다.
   * `reissueBatchId`가 없는 옛 과제는 자기 id를 키로 써서 1개짜리 묶음이 된다.
   */
  const batchKeyOf = (assignment: ClassAssignment): string | null =>
    assignment.targetStudentId
      ? (assignment.reissueBatchId ?? assignment.id)
      : null;

  /**
   * 드롭다운에 실제로 띄우는 목록 — **재출제는 묶음당 한 줄만.**
   * 20명에게 내면 과제가 20개 생기는데 그대로 두면 같은 제목이 20줄 쌓인다.
   * 원래 순서(최근 부여 순)를 유지하려고 앞에서부터 훑으며 첫 항목만 남긴다.
   */
  const pickerViews = useMemo(() => {
    const seen = new Set<string>();
    const out: AssignedProblemView[] = [];
    for (const view of assignments) {
      const key = batchKeyOf(view.assignment);
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      out.push(view);
    }
    return out;
  }, [assignments]);

  /** 드롭다운 대표 과제 id → 그 묶음의 학생 수 (반 전체 과제는 들어가지 않는다) */
  const batchSizeById = useMemo(() => {
    const counts = new Map<string, number>();
    for (const view of assignments) {
      const key = batchKeyOf(view.assignment);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const out: Record<string, number> = {};
    for (const view of pickerViews) {
      const key = batchKeyOf(view.assignment);
      if (key) out[view.assignment.id] = counts.get(key) ?? 1;
    }
    return out;
  }, [assignments, pickerViews]);

  const selected =
    pickerViews.find((item) => item.assignment.id === selectedId) ??
    assignments.find((item) => item.assignment.id === selectedId) ??
    pickerViews[0] ??
    null;
  const selectedAssignment = selected?.problemSet ?? null;
  const selectedSchedule = selected?.assignment ?? null;
  const selectedTargetLabel = selectedSchedule
    ? resolveTargetStudentLabel(selectedSchedule, students)
    : null;
  /**
   * 오답 재출제 과제 — **학생 1명 전용**이라 반 단위 지표(평균·완료 N명·필터 칩)가
   * 전부 n=1이 되어 의미가 없다. 그래서 화면 여러 곳을 이 값으로 갈라 놓는다.
   */
  const isReissue = Boolean(selectedSchedule?.targetStudentId);

  /**
   * 선택된 재출제가 속한 묶음의 과제 전부 (학생 1명당 1개).
   * 지표·학생 표는 이 묶음 전체를 합쳐서 낸다 — 그래야 「20명 중 12명 제출」이 보인다.
   */
  const batchViews = useMemo(() => {
    if (!selectedSchedule) return [];
    const key = batchKeyOf(selectedSchedule);
    if (!key) return [];
    return assignments.filter((item) => batchKeyOf(item.assignment) === key);
  }, [assignments, selectedSchedule]);

  /** 묶음 크기 — 1이면 개인 한 명, N이면 단체로 나간 것 */
  const batchSize = batchViews.length;
  /** 단체 재출제 — 학생 표·상태 칩이 다시 제 역할을 한다 */
  const isBatchReissue = isReissue && batchSize > 1;
  /** 오답의 출처가 된 원본 과제 — 목록에 남아 있을 때만(지웠으면 null) */
  const sourceView = selectedSchedule?.sourceAssignmentId
    ? (assignments.find(
        (item) => item.assignment.id === selectedSchedule.sourceAssignmentId,
      ) ?? null)
    : null;
  const assignedStudents = (() => {
    if (!selectedSchedule?.targetStudentId) return students;
    // 묶음 안의 대상 학생 전원 — 단체로 냈으면 20명이 다 들어온다
    const targets = new Set(
      batchViews.map((view) => view.assignment.targetStudentId),
    );
    if (targets.size === 0) targets.add(selectedSchedule.targetStudentId);
    return students.filter((student) => targets.has(student.id));
  })();

  const selectedProgress = useMemo(() => {
    if (!selected?.assignment.id) return [];

    const idleRow = (student: { id: string; name: string }) => ({
      studentId: student.id,
      studentName: student.name,
      status: "idle" as const,
      progressPercent: 0,
      latestAccuracy: null,
      averageAccuracy: null,
      firstScore: null,
      latestScore: null,
      latestCorrectCount: null,
      latestAnsweredCount: null,
      submittedAt: null,
      lastLearnedAt: null,
      studyStreakDays: 0,
    });

    // 재출제 묶음은 **과제가 학생 수만큼 쪼개져 있다** — 각 과제의 진행 행을 합쳐야
    // 「20명 중 12명 제출」이 나온다. 과제 하나만 보면 영원히 1명짜리 표다.
    if (batchViews.length > 0) {
      const rows = batchViews.flatMap((view) => {
        const targetId = view.assignment.targetStudentId;
        const found = (progressByAssignment[view.assignment.id] ?? []).filter(
          (row) => !targetId || row.studentId === targetId,
        );
        if (found.length > 0) return found;
        const student = assignedStudents.find((item) => item.id === targetId);
        return student ? [idleRow(student)] : [];
      });
      // 학생 표 정렬이 반 명단과 어긋나지 않게 맞춘다
      const order = new Map(
        assignedStudents.map((student, index) => [student.id, index]),
      );
      return rows.sort(
        (a, b) =>
          (order.get(a.studentId) ?? 0) - (order.get(b.studentId) ?? 0),
      );
    }

    return (
      progressByAssignment[selected.assignment.id] ??
      assignedStudents.map(idleRow)
    );
  }, [
    progressByAssignment,
    selected?.assignment.id,
    assignedStudents,
    batchViews,
  ]);

  /** 개인 재출제(묶음 크기 1)일 때 그 한 줄 — 지표에서 바로 쓴다 */
  const reissueRow = isReissue ? (selectedProgress[0] ?? null) : null;

  /**
   * 단체 재출제의 「틀렸던 문항」 평균 — 학생마다 틀린 개수가 달라 합계는 의미가 없다.
   * (원본 20문항 중 어떤 애는 3개, 어떤 애는 12개 틀린다)
   */
  const reissueAvgItemCount =
    batchViews.length > 0
      ? Math.round(
          batchViews.reduce(
            (sum, view) => sum + problemSetItemCount(view.problemSet),
            0,
          ) / batchViews.length,
        )
      : 0;

  /**
   * 재출제의 존재 이유는 「원본에서 틀린 걸 이번엔 맞혔나」다.
   * 원본 과제가 목록에 남아 있고 그 학생 점수가 있으면 변화를 보여준다.
   */
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
      if (isReissue) {
        if (
          reissueFilter !== "all" &&
          resolveReissueOutcome(row) !== reissueFilter
        ) {
          return false;
        }
      } else if (studentFilter !== "all" && row.status !== studentFilter) {
        return false;
      }
      if (query && !row.studentName.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [selectedProgress, studentFilter, reissueFilter, isReissue, studentQuery]);

  /**
   * 재출제 대상 학생 → 그 학생이 받은 **문제집 항목 수**(= 원본에서 틀린 개수).
   * 학생마다 다르다(3개짜리·12개짜리). 교사 로컬 데이터라 신뢰할 수 있는 값이다 —
   * 서버의 `answered_count`와 달리 재풀이로 부풀지 않는다.
   */
  const reissueItemCountByStudent = useMemo(() => {
    const out: Record<string, number> = {};
    for (const view of batchViews) {
      const id = view.assignment.targetStudentId;
      if (id) out[id] = problemSetItemCount(view.problemSet);
    }
    return out;
  }, [batchViews]);

  /** 재출제 칩 개수 — 「고쳤나」 기준 */
  const reissueCounts = useMemo(() => {
    let unsubmitted = 0;
    let stillWrong = 0;
    let fixed = 0;
    for (const row of selectedProgress) {
      const outcome = resolveReissueOutcome(row);
      if (outcome === "unsubmitted") unsubmitted += 1;
      else if (outcome === "still-wrong") stillWrong += 1;
      else fixed += 1;
    }
    return { unsubmitted, stillWrong, fixed };
  }, [selectedProgress]);

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

  function openReissueWrongModal(filterIds?: string[]) {
    if (!selectedAssignment || !selectedSchedule) return;
    setReissueError(null);
    setReissueFilterIds(filterIds ?? null);
    setReissueOpen(true);
  }

  type FilterChip = {
    id: string;
    label: string;
    count: number;
    activeClass: string;
    inactiveClass: string;
    onSelect: () => void;
    active: boolean;
  };

  const classWideChips: FilterChip[] = [
    {
      id: "all",
      label: "전체",
      count: selectedProgress.length,
      activeClass: "bg-[#1F2A37] text-white",
      inactiveClass: "bg-[#F3F4F6] text-[#6B7280]",
      onSelect: () => setStudentFilter("all"),
      active: studentFilter === "all",
    },
    {
      id: "idle",
      label: "미학습",
      count: metrics.idle,
      activeClass: "bg-[#FEE7E7] text-[#C52B2B]",
      inactiveClass: "bg-[#FEE7E7] text-[#C52B2B]",
      onSelect: () => setStudentFilter("idle"),
      active: studentFilter === "idle",
    },
    {
      id: "in_progress",
      label: "진행중",
      count: metrics.inProgress,
      activeClass: "bg-[#FEF9E7] text-[#B45309]",
      inactiveClass: "bg-[#FEF9E7] text-[#B45309]",
      onSelect: () => setStudentFilter("in_progress"),
      active: studentFilter === "in_progress",
    },
    {
      id: "completed",
      label: "완료",
      count: metrics.completed,
      activeClass: "bg-[#E8F8EF] text-[#047857]",
      inactiveClass: "bg-[#E8F8EF] text-[#047857]",
      onSelect: () => setStudentFilter("completed"),
      active: studentFilter === "completed",
    },
  ];

  /*
    재출제 칩 — 진행 단계가 아니라 **오답을 고쳤는지**로 나눈다.
    재출제 과제에는 그 학생이 틀렸던 문항만 들어 있어서 만점이 목표치이고,
    선생님이 바로 찾아야 하는 건 「제출했는데 아직 틀린 학생」이다.
  */
  const reissueChips: FilterChip[] = [
    {
      id: "all",
      label: "전체",
      count: selectedProgress.length,
      activeClass: "bg-[#1F2A37] text-white",
      inactiveClass: "bg-[#F3F4F6] text-[#6B7280]",
      onSelect: () => setReissueFilter("all"),
      active: reissueFilter === "all",
    },
    {
      id: "unsubmitted",
      label: "미제출",
      count: reissueCounts.unsubmitted,
      activeClass: "bg-[#F3F4F6] text-[#4B5563]",
      inactiveClass: "bg-[#F3F4F6] text-[#6B7280]",
      onSelect: () => setReissueFilter("unsubmitted"),
      active: reissueFilter === "unsubmitted",
    },
    {
      id: "still-wrong",
      label: "보완 필요",
      count: reissueCounts.stillWrong,
      activeClass: "bg-[#FEE7E7] text-[#C52B2B]",
      inactiveClass: "bg-[#FEE7E7] text-[#C52B2B]",
      onSelect: () => setReissueFilter("still-wrong"),
      active: reissueFilter === "still-wrong",
    },
    {
      id: "fixed",
      label: "만점",
      count: reissueCounts.fixed,
      activeClass: "bg-[#E8F8EF] text-[#047857]",
      inactiveClass: "bg-[#E8F8EF] text-[#047857]",
      onSelect: () => setReissueFilter("fixed"),
      active: reissueFilter === "fixed",
    },
  ];

  const studentFilterChips = isReissue ? reissueChips : classWideChips;

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
  const [reissueOpen, setReissueOpen] = useState(false);
  const [reissueBusy, setReissueBusy] = useState(false);
  const [reissueError, setReissueError] = useState<string | null>(null);
  const [reissueFilterIds, setReissueFilterIds] = useState<string[] | null>(
    null,
  );

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

  const selectedAssignmentRef = useRef(selectedAssignment);
  selectedAssignmentRef.current = selectedAssignment;
  const problemStatsAssignmentIdRef = useRef<string | null>(null);

  useEffect(() => {
    const assignment = selectedAssignmentRef.current;
    if (!assignment || !selected?.assignment.id) {
      setProblemRows([]);
      problemStatsAssignmentIdRef.current = null;
      return;
    }

    const assignmentId = selected.assignment.id;
    const fallback = buildProblemRowsFallback(assignment);
    // 과제 전환 때만 빈 정답률로 초기화 — progress 폴링마다 리셋하면 바가 깜빡임
    const switched = problemStatsAssignmentIdRef.current !== assignmentId;
    problemStatsAssignmentIdRef.current = assignmentId;
    if (switched) {
      setProblemRows(fallback);
    }

    let cancelled = false;
    void (async () => {
      const stats = await fetchQuestionStats(
        assignmentId,
        buildProblemSnapshot(assignment),
      );
      if (cancelled) return;
      if (problemStatsAssignmentIdRef.current !== assignmentId) return;
      setProblemRows(stats.length > 0 ? statsToRows(stats) : fallback);
    })();

    return () => {
      cancelled = true;
    };
  }, [selected?.assignment.id, progressRefreshKey]);

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
  const canReissueWeak = printableStudents.length > 0 && !reissueBusy;

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
                    {pickerViews.length > 0 ? (
                      <AssignmentPicker
                        assignments={pickerViews}
                        batchSizeById={batchSizeById}
                        students={students}
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
                    {selectedTargetLabel ? (
                      <span className="shrink-0 rounded-full bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-bold text-[#047857]">
                        오답 재출제 · {selectedTargetLabel}
                      </span>
                    ) : null}
                    {/* 재출제는 원본과의 관계가 곧 의미라 원본으로 바로 건너뛸 수 있게 한다 */}
                    {isReissue && sourceView ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(sourceView.assignment.id);
                          setPickerOpen(false);
                        }}
                        title={sourceView.problemSet.title}
                        className="inline-flex max-w-[220px] shrink-0 items-center gap-1 rounded-full border border-[#E1E2E4] bg-white px-2.5 py-1 text-[11px] font-bold text-[#6B7280] hover:border-[#1AA7F2] hover:text-[#1274A9]"
                      >
                        <span aria-hidden>↩</span>
                        <span className="truncate">
                          원본 · {sourceView.problemSet.title}
                        </span>
                      </button>
                    ) : null}
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
              {/*
                재출제는 학생 1명짜리라 반 단위 지표를 그대로 쓰면 「평균 점수(1명)」
                「미학습 학생 1명 / 전체 1명 중」처럼 정보량이 0인 칸이 된다.
                같은 자리에 그 학생 하나를 설명하는 값으로 바꿔 넣는다.
              */}
              {isReissue ? (
                <div className="grid grid-cols-4 gap-3">
                  <MetricCard
                    label="대상 학생"
                    value={
                      isBatchReissue
                        ? `${batchSize}명`
                        : (selectedTargetLabel ?? "개인")
                    }
                    detail={
                      isBatchReissue
                        ? "각자 틀린 문항만 받습니다"
                        : "이 학생만 앱에서 봅니다"
                    }
                  />
                  <MetricCard
                    label="제출"
                    value={
                      isBatchReissue
                        ? `${metrics.completed}/${batchSize}명`
                        : metrics.completed > 0
                          ? "완료"
                          : "미제출"
                    }
                    detail={
                      isBatchReissue
                        ? // 칩 라벨과 같은 말을 쓴다 — 여기는 「미학습」, 칩은 「미제출」이면 헷갈린다
                          `미제출 ${reissueCounts.unsubmitted}명 · 보완 필요 ${reissueCounts.stillWrong}명`
                        : reissueRow?.submittedAt
                          ? formatSubmittedAt(reissueRow.submittedAt)
                          : `진행률 ${reissueRow?.progressPercent ?? 0}%`
                    }
                    highlight
                    detailStyle={
                      metrics.completed > 0 ? undefined : { color: "#EF4444" }
                    }
                  />
                  {/*
                    「점수」가 아니라 「고친 개수」다 — 재출제 백분율은 원본과 분모가 달라
                    비교할 수 없고, 선생님이 알고 싶은 건 「틀린 걸 몇 개 고쳤나」다.
                  */}
                  <MetricCard
                    label="만점"
                    value={
                      isBatchReissue
                        ? `${reissueCounts.fixed}/${selectedProgress.length}명`
                        : reissueCounts.fixed > 0
                          ? "예"
                          : reissueCounts.stillWrong > 0
                            ? "보완 필요"
                            : "—"
                    }
                    valueStyle={
                      reissueCounts.fixed > 0 ? undefined : { color: "#9CA3AF" }
                    }
                    detail={
                      reissueCounts.stillWrong > 0
                        ? `보완 필요 ${reissueCounts.stillWrong}명`
                        : "틀렸던 문항을 모두 고쳤어요"
                    }
                  />
                  <MetricCard
                    label="틀렸던 문항"
                    value={
                      isBatchReissue
                        ? `평균 ${reissueAvgItemCount}문항`
                        : `${problemSetItemCount(selectedAssignment)}문항`
                    }
                    detail={
                      sourceView
                        ? `원본 ${problemSetItemCount(sourceView.problemSet)}문항 중`
                        : "원본 과제 없음(삭제됨)"
                    }
                  />
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  <MetricCard
                    label="배정 학생"
                    value={`${assignedStudents.length}명`}
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
              )}
            </div>

            <div className="mb-3">
              <p className="text-[14px] font-bold text-[#4B5563]">
                {isReissue && !isBatchReissue ? "학습 현황" : "학생별 학습 현황"}
              </p>

              <div className="mt-3 flex items-center gap-3">
                {/*
                  일반·오답 재출제(개인/단체) 모두 같은 줄에 이름 검색을 둔다.
                  필터·오답 시험지 출력 버튼과 나란히 — 검색은 왼쪽, 출력은 ml-auto 오른쪽.
                */}
                <div className="flex h-10 w-[240px] shrink-0 items-center rounded-full border border-[#E5E7EB] bg-white px-4">
                  <input
                    value={studentQuery}
                    onChange={(event) => setStudentQuery(event.target.value)}
                    placeholder="학생 이름 검색"
                    aria-label="학생 이름 검색"
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-[#15171A] outline-none placeholder:text-[#B0B4BB]"
                  />
                </div>

                <div
                  /*
                    개인(1명) 재출제에서도 칩을 보여준다. 「n=1이라 무의미」해서 숨겼었는데,
                    그러면 오답 칩이 **화면에서 아예 사라져** 바뀐 걸 확인할 수가 없다.
                    한 명이어도 `아직 틀림 1`은 「고쳤나」를 한눈에 알려주는 값이다.
                  */
                  className="flex flex-wrap items-center gap-2"
                >
                  {studentFilterChips.map((chip) => {
                    const active = chip.active;
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={chip.onSelect}
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
                      title: isReissue
                        ? `${selectedTargetLabel ?? "학생"} 오답 시험지`
                        : "학생 개별 오답 시험지 한 번에 출력",
                      rows: printableStudents,
                    })
                  }
                  className="ml-auto shrink-0 rounded-full bg-[#2F80ED] px-3.5 py-1.5 text-[12px] font-bold text-white transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {/* 한 명뿐인데 「한 번에」는 어색하다 */}
                  {isReissue && !isBatchReissue
                    ? "오답 시험지 출력"
                    : "학생 개별 오답 시험지 한 번에 출력"}
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-[14px] border border-[#EDEFF2] bg-white">
              <div className="flex h-12 items-center border-b border-[#EDEFF2] px-5 text-[12px] font-semibold text-[#9CA3AF]">
                <span className="min-w-0 flex-1">학생</span>
                {/* 재출제는 「진행 단계」가 아니라 「고쳤나」가 궁금한 표다 */}
                <span className="w-[104px]">{isReissue ? "결과" : "학습 현황"}</span>
                <span className="w-[72px] text-center">진행률</span>
                <span className="w-[76px] text-center">
                  {isReissue ? "틀렸던 문항" : "정답률"}
                </span>
                <span className="w-[120px] text-center">
                  {/*
                    재출제에는 「점수 변화」에 해당하는 참값이 없다 —
                    원본과 분모가 다르고, 서버 `answered_count`는 재풀이로 부풀어
                    `48/50` 같은 숫자가 나온다. 빈칸으로 두는 게 거짓말보다 낫다.
                  */}
                  {isReissue ? "" : "점수 변화"}
                </span>
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
                    const badge = isReissue
                      ? reissueOutcomeBadge(row)
                      : statusBadge(row.status);

                    /**
                     * 재출제 「이번 정답」 — `21/22`.
                     *
                     * **실제로 푼 문항 수를 그대로 쓴다.** 점수(%)에서 개수를 역산했더니
                     * 96%가 `7/7`로 보이면서 배지(「아직 틀림」)와 어긋났다.
                     * 여기 분모는 학생이 실제 푼 **출제 문항** 수라, 위 카드의
                     * 「틀렸던 문항 7문항」(문제집 항목 수)과 숫자가 다를 수 있다 —
                     * 단어 1개가 짝맞추기·3지선다·영작 3문항으로 나가기 때문이다.
                     */
                    /**
                     * 재출제 「틀렸던 문항」 — 이 학생이 원본에서 틀려서 다시 받은 개수.
                     *
                     * 서버의 `answered_count`는 쓰지 않는다. 그건 **답안 이벤트 카운터**라
                     * 같은 문제를 다시 풀면 계속 올라가고(`clientAnswerId`에 `Date.now()`가
                     * 들어가 중복 제거가 안 된다), 그래서 7문항짜리에 `48/50` 같은 값이 나왔다.
                     * 여기 값은 교사 로컬의 문제집 항목 수라 부풀지 않는다.
                     */
                    const fixedCell = (() => {
                      const total = reissueItemCountByStudent[row.studentId];
                      return total ? `${total}문항` : "—";
                    })();

                    /**
                     * 재출제 행의 「원본 점수」 — **참고값이지 비교 대상이 아니다.**
                     * 원본(전체 문항)과 재출제(틀린 것만)는 분모가 달라 증감을 낼 수 없다.
                     * 여기 값은 「이 학생이 원래 몇 점이었나」를 옆에 두는 용도다.
                     */
                    const versusSource = "";

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
                          {isReissue
                            ? fixedCell
                            : row.latestAccuracy != null
                              ? `${row.latestAccuracy}%`
                              : "—"}
                        </span>
                        <span className="w-[120px] text-center text-[12px] text-[#6B7280]">
                          {isReissue ? versusSource : scoreChange}
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
                    {isReissue
                      ? `${selectedTargetLabel ?? "이 학생"}이 원본에서 틀렸던 문항입니다. 이번엔 맞혔는지 확인해 보세요.`
                      : "단어·문장·문법을 나눠 보고, 오답이 많은 문제를 확인해 보세요."}
                  </p>
                </div>
              </div>

              {/*
                재출제에서는 4칸 중 두 칸을 뺀다.
                - 「미학습 학생 N명 / 전체 N명 중」: 대상이 한 명이라 상단 「제출」과 같은 말
                - 「오답만 다시 출제」: 오답 과제 위에 또 오답 과제를 만드는 재귀. 눌러 나갈수록
                  학생 맵에 성만 쌓이고 원본과의 관계도 흐려진다.
              */}
              <div
                className={`mt-5 grid gap-3.5 ${
                  isReissue && !isBatchReissue
                    ? "grid-cols-2"
                    : isReissue
                      ? "grid-cols-3"
                      : "grid-cols-4"
                }`}
              >
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
                {isReissue && !isBatchReissue ? null : (
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
                )}
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
                {isReissue ? null : (
                  <ReissueResultCard
                    enabled={canReissueWeak}
                    studentCount={printableStudents.length}
                    error={reissueError}
                    onCreate={() => openReissueWrongModal()}
                  />
                )}
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
                      ? "선택한 문항의 학생별 오답만 앱에 보내요."
                      : "다시 출제할 문제를 선택해 주세요."
                  }
                  onClick={() =>
                    openReissueWrongModal([...checkedProblemIds])
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

      {reissueOpen && selectedAssignment && selectedSchedule ? (
        <ReissueWrongAnswersModal
          open={reissueOpen}
          source={selectedAssignment}
          classId={selectedSchedule.classId}
          assignmentId={selectedSchedule.id}
          classLabel={resolvedClassLabel}
          students={printableStudents}
          filterBaseIds={reissueFilterIds}
          teacherClass={teacherClass}
          busy={reissueBusy}
          onClose={() => {
            if (reissueBusy) return;
            setReissueOpen(false);
            setReissueFilterIds(null);
          }}
          onDone={() => {
            setReissueOpen(false);
            setReissueFilterIds(null);
            setCheckedProblemIds(new Set());
            setReissueBusy(false);
            setReissueError(null);
          }}
          onError={(message) => {
            setReissueBusy(false);
            setReissueError(message);
            setReissueOpen(false);
            setReissueFilterIds(null);
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
  batchSizeById,
  students,
  selectedId,
  open,
  progressByAssignment,
  studentCount,
  onToggle,
  onSelect,
  onDelete,
}: {
  assignments: AssignedProblemView[];
  /** 재출제 묶음 대표 과제 id → 묶음에 속한 학생 수 (1이면 개인) */
  batchSizeById: Record<string, number>;
  students: ClassStudent[];
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

  const selectedCohortCount = selected.assignment.targetStudentId
    ? (batchSizeById[selected.assignment.id] ?? 1)
    : studentCount;
  const selectedCompleted = isAssignmentFullyCompleted(
    progressByAssignment[selected.assignment.id],
    selectedCohortCount,
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
            const cohortCount = assignment.targetStudentId
              ? (batchSizeById[assignment.id] ?? 1)
              : studentCount;
            const completed = isAssignmentFullyCompleted(
              progressByAssignment[assignment.id],
              cohortCount,
            );
            const targetLabel = resolveTargetStudentLabel(assignment, students);
            // 단체 재출제는 이름 대신 인원수로 — 20줄이 1줄로 접혀 있기 때문
            const size = batchSizeById[assignment.id] ?? 1;
            const reissueNote = targetLabel
              ? size > 1
                ? ` · 오답 재출제 · ${size}명`
                : ` · 오답 재출제 · ${targetLabel}`
              : "";
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
                    {reissueNote}
                  </span>
                  {/*
                    아직 공개 전이면 학생 앱에는 안 보인다. 표시가 없으면 교사는
                    「출제가 안 됐나」로 읽는다 — 언제 열리는지까지 적어 준다.
                  */}
                  {isScheduledForLater(assignment.openAt) ? (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#FFF4D6] px-2 py-0.5 text-[11px] font-bold text-[#8A6100]">
                      예약 · {formatOpenAtKo(assignment.openAt)}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(view);
                  }}
                  aria-label={
                    size > 1
                      ? `「${problemSet.title}」 재출제 ${size}명 전체 취소`
                      : `「${problemSet.title}」 부여 취소`
                  }
                  title={
                    size > 1 ? `재출제 ${size}명 전체 취소` : "부여한 과제 취소"
                  }
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

/** 부여 취소 팝업 마감 칩 — 마감 없으면 빈 문자열 */
function formatDeadlineCancelTag(assignment: ClassAssignment): string {
  if (!hasAssignmentDeadline(assignment)) return "";
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
  studentCount,
  error,
  onCreate,
}: {
  enabled: boolean;
  studentCount: number;
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

      <p className="mt-3 flex-1 whitespace-nowrap text-[12px] font-medium leading-[1.55] tracking-[-0.01em] text-[#8B919A]">
        {enabled
          ? `제출 ${studentCount}명의 오답만 각자 앱에 보내요.`
          : "제출 후 보낼 수 있어요."}
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
              ? "학생별 오답을 앱 과제로 보내요."
              : "제출한 학생이 생기면 보낼 수 있어요."
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
