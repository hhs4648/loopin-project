"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { toLocalIsoDate } from "@/lib/calendar-one-off-lessons";
import {
  findExistingWrongReissues,
  loadClassAssignments,
} from "@/lib/class-assignments";
import {
  assignPerStudentWrongReissues,
  filterStudentsWithWrongReissue,
  reissueProblemSetTitle,
  type StudentWrongReissueRow,
} from "@/lib/reissue-wrong-problems";
import type { SavedProblemSet } from "@/lib/problem-sets";
import { fetchWrongAnswersForStudent } from "@/lib/sync/teacher-sync";
import type { StudentProgressRow } from "@/lib/sync/types";
import type { TeacherClass } from "@/lib/teacher-classes";

type ReissueWrongAnswersModalProps = {
  open: boolean;
  source: SavedProblemSet;
  classId: string;
  assignmentId: string;
  classLabel: string;
  /** 진행중·완료 학생 (미학습 제외) */
  students: StudentProgressRow[];
  /** 있으면 이 문항(base id)과 겹치는 오답만 */
  filterBaseIds?: string[] | null;
  /** 넘기면 조회 생략 — 없으면 classId로 localStorage에서 찾음 */
  teacherClass?: TeacherClass | null;
  busy?: boolean;
  onClose: () => void;
  onDone: (assignedCount: number) => void;
  onError: (message: string) => void;
};

export function ReissueWrongAnswersModal({
  open,
  source,
  classId,
  assignmentId,
  classLabel,
  students,
  filterBaseIds = null,
  teacherClass: _teacherClassProp = null,
  busy = false,
  onClose,
  onDone,
  onError,
}: ReissueWrongAnswersModalProps) {
  const titleId = useId();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<StudentWrongReissueRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  /** 중복 경고를 한 번 보고도 그대로 보내겠다고 한 상태 */
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting, busy]);

  const studentKey = students.map((s) => s.studentId).join(",");
  const filterKey = (filterBaseIds ?? []).join(",");

  useEffect(() => {
    if (!open) return;
    setLoadError(null);
    setRows([]);
    setSelectedIds(new Set());
    setDuplicateAcknowledged(false);
    setLoading(true);

    let cancelled = false;
    void (async () => {
      try {
        const next = await Promise.all(
          students.map(async (student) => {
            const wrongAnswers = await fetchWrongAnswersForStudent({
              assignmentId,
              studentId: student.studentId,
            });
            return {
              studentId: student.studentId,
              studentName: student.studentName,
              wrongAnswers,
            } satisfies StudentWrongReissueRow;
          }),
        );
        if (cancelled) return;
        setRows(next);
        const eligible = filterStudentsWithWrongReissue(next, filterBaseIds);
        setSelectedIds(new Set(eligible.map((r) => r.studentId)));
      } catch {
        if (!cancelled) {
          setLoadError("학생 오답을 불러오지 못했어요.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // students / filterBaseIds 는 studentKey·filterKey로 안정화
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assignmentId, studentKey, filterKey]);

  const eligible = useMemo(
    () => filterStudentsWithWrongReissue(rows, filterBaseIds),
    [rows, filterBaseIds],
  );

  const selectedEligible = useMemo(
    () => eligible.filter((row) => selectedIds.has(row.studentId)),
    [eligible, selectedIds],
  );

  const totalQuestions = selectedEligible.reduce(
    (sum, row) => sum + row.baseIds.length,
    0,
  );

  /**
   * 이미 이 과제로 재출제를 받은 학생들. 만들기를 두 번 누르면 제목·날짜·대상이
   * 똑같은 과제가 그대로 하나 더 생기고 학생 맵에 같은 성이 두 개 선다.
   */
  const duplicateNames = useMemo(() => {
    if (selectedEligible.length === 0) return [];
    const existing = findExistingWrongReissues(
      loadClassAssignments(),
      assignmentId,
      selectedEligible.map((row) => row.studentId),
    );
    const hit = new Set(existing.map((item) => item.targetStudentId));
    return selectedEligible
      .filter((row) => hit.has(row.studentId))
      .map((row) => row.studentName);
  }, [selectedEligible, assignmentId]);

  if (!open || typeof document === "undefined") return null;

  const locked = submitting || busy;
  const blockedByDuplicate =
    duplicateNames.length > 0 && !duplicateAcknowledged;

  function toggleStudent(studentId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function toggleAll() {
    if (selectedEligible.length === eligible.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(eligible.map((r) => r.studentId)));
  }

  async function handleConfirm() {
    if (selectedEligible.length === 0 || locked || blockedByDuplicate) return;
    setSubmitting(true);
    const lessonDate = toLocalIsoDate(new Date());
    // 오답 재출제는 마감 없음 — 스키마상 날짜만 먼 미래 센티널로 채운다
    const result = await assignPerStudentWrongReissues({
      source,
      classId,
      sourceAssignmentId: assignmentId,
      lessonDate,
      students: selectedEligible.map((row) => ({
        studentId: row.studentId,
        studentName: row.studentName,
        wrongAnswers: row.wrongAnswers,
        baseIds: row.baseIds,
      })),
    });
    setSubmitting(false);
    if (!result.ok) {
      onError(result.message);
      return;
    }
    onDone(result.count);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-4"
      onClick={() => {
        if (!locked) onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(720px,92vh)] w-full max-w-[520px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#F0F1F3] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold tracking-[-0.01em] text-[#1AA7F2]">
              {classLabel}
            </p>
            <h2
              id={titleId}
              className="mt-0.5 text-[18px] font-bold tracking-[-0.02em] text-[#15171A]"
            >
              학생별 오답 앱에 내기
            </h2>
            <p className="mt-1 text-[13px] font-medium leading-snug text-[#6B7280]">
              각 학생이 틀린 문제만 모아, 그 학생 앱에 개인 과제로 보내요.
            </p>
            <p className="mt-2 truncate text-[12px] font-semibold text-[#9CA3AF]">
              과제 제목 · {reissueProblemSetTitle(source)}
            </p>
          </div>
          <button
            type="button"
            aria-label="닫기"
            disabled={locked}
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-[#6B7280] transition-colors hover:bg-[#F3F4F6] disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M2 2l10 10M12 2L2 12"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-[14px] font-medium text-[#6B7280]">
              학생 오답을 불러오는 중…
            </p>
          ) : loadError ? (
            <p className="py-8 text-center text-[14px] font-semibold text-[#DC2626]">
              {loadError}
            </p>
          ) : eligible.length === 0 ? (
            <p className="py-8 text-center text-[14px] font-medium text-[#6B7280]">
              보낼 오답이 있는 학생이 없어요.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-[#374151]">
                  보낼 학생 {selectedEligible.length}명 · 문항 {totalQuestions}개
                </p>
                <button
                  type="button"
                  disabled={locked}
                  onClick={toggleAll}
                  className="cursor-pointer text-[12px] font-bold text-[#1AA7F2] hover:underline disabled:opacity-50"
                >
                  {selectedEligible.length === eligible.length
                    ? "전체 해제"
                    : "전체 선택"}
                </button>
              </div>

              <ul className="flex flex-col gap-2">
                {eligible.map((row) => {
                  const checked = selectedIds.has(row.studentId);
                  return (
                    <li key={row.studentId}>
                      <label
                        className={`flex cursor-pointer items-center gap-3 rounded-[12px] border px-3 py-2.5 transition-colors ${
                          checked
                            ? "border-[#B8E2FA] bg-[#F5FBFF]"
                            : "border-[#E8EAED] bg-white hover:bg-[#FAFAFB]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleStudent(row.studentId)}
                          className="h-4 w-4 rounded border-[#D1D5DB] text-[#1AA7F2] focus:ring-[#1AA7F2]"
                        />
                        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.01em] text-[#15171A]">
                          {row.studentName}
                        </span>
                        <span className="shrink-0 text-[12px] font-bold tabular-nums text-[#DC2626]">
                          오답 {row.baseIds.length}문항
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/*
          중복 경고 — 색만으로 알리지 않고 아이콘 + 문구를 같이 쓴다(디자인 규칙).
          막아 놓기만 하면 「일부러 또 내려는」 경우를 못 하므로 확인 후 진행 가능.
        */}
        {duplicateNames.length > 0 ? (
          <div className="shrink-0 border-t border-[#FDE68A] bg-[#FFFBEB] px-5 py-3">
            <div className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-[1px] grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#F59E0B] text-[11px] font-bold text-white"
              >
                !
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-[#92400E]">
                  이미 이 과제로 오답을 내보낸 학생이 있어요 (
                  {duplicateNames.length}명) —{" "}
                  {/* 20명 단체면 이름을 다 늘어놓으면 벽이 된다 */}
                  {duplicateNames.length <= 5
                    ? duplicateNames.join(", ")
                    : `${duplicateNames.slice(0, 3).join(", ")} 외 ${
                        duplicateNames.length - 3
                      }명`}
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-[#A16207]">
                  그대로 내면 같은 과제가 하나 더 생겨요. 그래도 보낼까요?
                </p>
                {!duplicateAcknowledged ? (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => setDuplicateAcknowledged(true)}
                    className="mt-2 cursor-pointer text-[12px] font-bold text-[#B45309] underline disabled:opacity-50"
                  >
                    그래도 보내기
                  </button>
                ) : (
                  <p className="mt-2 text-[12px] font-bold text-[#15803D]">
                    확인됨 — 아래 「앱에 내기」로 진행할 수 있어요.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#F0F1F3] px-5 py-3.5">
          <button
            type="button"
            disabled={locked}
            onClick={onClose}
            className="h-10 cursor-pointer rounded-[10px] px-4 text-[14px] font-bold text-[#6B7280] hover:bg-[#F3F4F6] disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            disabled={
              locked ||
              loading ||
              selectedEligible.length === 0 ||
              blockedByDuplicate
            }
            onClick={() => void handleConfirm()}
            className="h-10 cursor-pointer rounded-[10px] bg-[#1AA7F2] px-5 text-[14px] font-bold text-white shadow-[0_4px_12px_rgba(26,167,242,0.35)] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "보내는 중…" : "앱에 내기"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
