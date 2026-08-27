"use client";

import { useEffect, useMemo, useState } from "react";
import { CustomAssignmentCreateModal } from "@/components/teacher/custom-assignment/CustomAssignmentCreateModal";
import { DeleteProblemSetModal } from "@/components/teacher/DeleteProblemSetModal";
import { PROBLEMS_PAGE_LAYOUT } from "@/components/teacher/NewProblemSetPanel";
import {
  hideProblemSetFromLibrary,
  isCustomSentenceProblemSet,
  type SavedProblemSet,
  listLibraryProblemSets,
  loadProblemSets,
  persistProblemSets,
  problemSetItemSummary,
  setProblemSetFavorite,
  updateProblemSet,
} from "@/lib/problem-sets";
import { deleteProblemSetRemote } from "@/lib/sync/teacher-sync";

type ProblemSetFolder = {
  id: string;
  label: string;
  count: number;
};

/** 스케치 순서: 전체 → 학년(중1·중2·중3) → 즐겨찾기 */
type SortMode = "recent" | "name";

export function SavedProblemSetsPanel() {
  const [folderId, setFolderId] = useState("all");
  const [sort, setSort] = useState<SortMode>("recent");
  const [problemSets, setProblemSets] = useState<SavedProblemSet[]>([]);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [assigningSet, setAssigningSet] = useState<SavedProblemSet | null>(
    null,
  );

  useEffect(() => {
    const refresh = () => setProblemSets(loadProblemSets());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("haksup-problem-sets-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("haksup-problem-sets-changed", refresh);
    };
  }, []);

  const librarySets = useMemo(
    () => listLibraryProblemSets(problemSets),
    [problemSets],
  );

  const allFolder: ProblemSetFolder = {
    id: "all",
    label: "전체",
    count: librarySets.length,
  };
  const gradeFolders: ProblemSetFolder[] = ["중1", "중2", "중3"].map(
    (grade, index) => ({
      id: `grade${index + 1}`,
      label: grade,
      count: librarySets.filter((item) => item.grade === grade).length,
    }),
  );
  const favoritesFolder: ProblemSetFolder = {
    id: "favorites",
    label: "즐겨찾기",
    count: librarySets.filter((item) => item.favorite).length,
  };

  const visibleProblemSets = useMemo(() => {
    let items = [...librarySets];
    if (folderId.startsWith("grade")) {
      const grade = `중${folderId.replace("grade", "")}`;
      items = items.filter((item) => item.grade === grade);
    } else if (folderId === "favorites") {
      items = items.filter((item) => item.favorite);
    }
    return items.sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title, "ko")
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [folderId, librarySets, sort]);

  const deletingSet =
    librarySets.find((item) => item.id === deletingId) ?? null;

  function toggleFavorite(problemSet: SavedProblemSet) {
    const next = setProblemSetFavorite(
      problemSets,
      problemSet.id,
      !problemSet.favorite,
    );
    persistProblemSets(next);
    setProblemSets(next);
  }

  function startRenaming(problemSet: SavedProblemSet) {
    setDeletingId(null);
    setEditingTitleId(problemSet.id);
    setTitleDraft(problemSet.title);
  }

  function saveTitle(problemSetId: string) {
    const title = titleDraft.trim();
    if (!title) return;
    const next = updateProblemSet(problemSets, problemSetId, { title });
    persistProblemSets(next);
    setProblemSets(next);
    setEditingTitleId(null);
  }

  async function confirmDelete(problemSetId: string) {
    const target =
      problemSets.find((item) => item.id === problemSetId) ?? null;
    if (!target) return;
    setDeletingBusy(true);
    setDeleteError(null);
    // 목록에서만 숨김 — 원격 `problem_sets` 행을 지우면 cascade로
    // 부여된 과제까지 사라지므로 soft-hide 한다.
    const result = await deleteProblemSetRemote(target);
    if (!result.ok) {
      setDeletingBusy(false);
      setDeleteError("삭제에 실패했어요. 네트워크를 확인하고 다시 시도해 주세요.");
      return;
    }
    const next = hideProblemSetFromLibrary(problemSets, problemSetId);
    persistProblemSets(next);
    setProblemSets(next);
    setDeletingBusy(false);
    setDeletingId(null);
    if (editingTitleId === problemSetId) setEditingTitleId(null);
  }

  function folderChip(folder: ProblemSetFolder, withStar = false) {
    const active = folder.id === folderId;
    return (
      <button
        type="button"
        onClick={() => setFolderId(folder.id)}
        className={`flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-[10px] px-3.5 text-[14px] font-bold outline-none transition-colors focus:outline-none focus-visible:outline-none ${
          active
            ? "bg-[#FFF4EF] text-[#16150F]"
            : "text-[#16150F] hover:bg-[#F8FAFB]"
        }`}
      >
        {withStar ? (
          <span className="shrink-0 text-[14px] leading-none text-[#F5B301]" aria-hidden>
            ★
          </span>
        ) : active ? (
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-[#FF5430]"
            aria-hidden
          />
        ) : null}
        <span>
          {folder.label}
          <span className="ml-1 font-semibold text-[#9CA3AF]">
            ({folder.count})
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3">
          <nav
            className="flex items-center gap-1 rounded-[14px] border border-[#E8EAED] bg-white p-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            aria-label="문제 세트 폴더"
          >
            {folderChip(allFolder)}

            <div className="mx-1 h-6 w-px bg-[#EFF1F4]" aria-hidden />

            {gradeFolders.map((folder) => (
              <span key={folder.id}>{folderChip(folder)}</span>
            ))}

            <div className="mx-1 h-6 w-px bg-[#EFF1F4]" aria-hidden />

            {folderChip(favoritesFolder, true)}
          </nav>

          <div className="ml-auto flex items-center gap-1 rounded-[10px] border border-[#E5E7EB] bg-white p-0.5">
              <button
                type="button"
                onClick={() => setSort("recent")}
                className={`h-8 cursor-pointer rounded-[8px] px-3 text-[13px] font-semibold outline-none transition-colors focus:outline-none focus-visible:outline-none ${
                  sort === "recent"
                    ? "bg-[#F4F6F8] text-[#16150F]"
                    : "text-[#9CA3AF] hover:text-[#6B7280]"
                }`}
              >
                최근 수정순
              </button>
              <button
                type="button"
                onClick={() => setSort("name")}
                className={`h-8 cursor-pointer rounded-[8px] px-3 text-[13px] font-semibold outline-none transition-colors focus:outline-none focus-visible:outline-none ${
                  sort === "name"
                    ? "bg-[#F4F6F8] text-[#16150F]"
                    : "text-[#9CA3AF] hover:text-[#6B7280]"
                }`}
              >
                이름순
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-3">
            <button
              type="button"
              onClick={() => {
                setAssigningSet(null);
                setCreateOpen(true);
              }}
              className="flex min-h-[196px] cursor-pointer flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-[#D1D5DB] bg-white text-[#9CA3AF] outline-none transition-colors hover:border-[#B0ABA3] hover:bg-[#FAFAFB] focus:outline-none focus-visible:outline-none"
              style={{ maxWidth: PROBLEMS_PAGE_LAYOUT.formMaxWidth }}
            >
              <span className="text-[32px] font-light leading-none" aria-hidden>
                +
              </span>
              <span className="mt-2 text-[15px] font-bold">과제 만들기</span>
            </button>

            {visibleProblemSets.map((problemSet) => (
              <article
                key={problemSet.id}
                className="flex min-h-[196px] flex-col rounded-[16px] border border-[#E8EAED] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
              >
                <div className="flex items-start gap-2">
                  {editingTitleId === problemSet.id ? (
                    <div className="min-w-0 flex-1">
                      <input
                        autoFocus
                        value={titleDraft}
                        aria-label="문제 세트 이름"
                        onChange={(event) => setTitleDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveTitle(problemSet.id);
                          if (event.key === "Escape") setEditingTitleId(null);
                        }}
                        className="h-9 w-full rounded-[8px] border border-[#1AA7F2] px-2.5 text-[14px] font-bold text-[#16150F] outline-none ring-1 ring-[#1AA7F2]"
                      />
                      <div className="mt-1.5 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => saveTitle(problemSet.id)}
                          disabled={!titleDraft.trim()}
                          className="text-[12px] font-semibold text-[#1AA7F2] disabled:text-[#C7CBD1]"
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTitleId(null)}
                          className="text-[12px] font-semibold text-[#6B7280]"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <h3 className="min-w-0 flex-1 text-[16px] font-bold leading-6 text-[#16150F]">
                      {problemSet.title}
                    </h3>
                  )}
                  {editingTitleId !== problemSet.id ? (
                    <button
                      type="button"
                      aria-label="세트 이름 수정"
                      title="세트 이름 수정"
                      onClick={() => startRenaming(problemSet)}
                      className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[#9CA3AF] outline-none transition-colors hover:bg-[#F3F4F6] hover:text-[#4B5563] focus:outline-none focus-visible:outline-none"
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        <path d="m15 5 4 4" />
                      </svg>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label={
                      problemSet.favorite
                        ? "즐겨찾기 해제"
                        : "즐겨찾기에 추가"
                    }
                    aria-pressed={problemSet.favorite}
                    onClick={() => toggleFavorite(problemSet)}
                    className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-[18px] outline-none transition-colors hover:bg-[#F3F4F6] focus:outline-none focus-visible:outline-none ${
                      problemSet.favorite
                        ? "text-[#F5B301]"
                        : "text-[#D1D5DB] hover:text-[#F5B301]"
                    }`}
                  >
                    ★
                  </button>
                </div>
                <p className="mt-2 text-[13px] font-medium text-[#6B7280]">
                  {problemSetItemSummary(problemSet)}
                </p>
                <p className="mt-1 text-[12px] text-[#9CA3AF]">
                  부여한 반 {problemSet.assignedClassIds.length}개 ·{" "}
                  {formatSavedDate(problemSet.updatedAt)}
                </p>
                <div className="mt-auto flex items-center gap-2 pt-4">
                  {isCustomSentenceProblemSet(problemSet) ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCreateOpen(false);
                        setAssigningSet(problemSet);
                      }}
                      className="inline-flex h-9 flex-1 cursor-pointer items-center justify-center rounded-[10px] bg-[#1AA7F2] text-[13px] font-bold text-white transition-colors hover:bg-[#1596D9]"
                    >
                      과제 내기
                    </button>
                  ) : (
                    <a
                      href={`/teacher/problems?problemSetId=${encodeURIComponent(problemSet.id)}`}
                      className="inline-flex h-9 flex-1 items-center justify-center rounded-[10px] bg-[#1AA7F2] text-[13px] font-bold text-white transition-colors hover:bg-[#1596D9]"
                    >
                      과제 내기
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTitleId(null);
                      setDeleteError(null);
                      setDeletingId(problemSet.id);
                    }}
                    className="h-9 rounded-[10px] border border-[#FECACA] px-3 text-[12px] font-semibold text-[#EF4444] hover:bg-[#FEF2F2]"
                  >
                    삭제
                  </button>
                </div>
              </article>
            ))}
          </div>
      </div>

      <DeleteProblemSetModal
        open={deletingSet !== null}
        problemSetTitle={deletingSet?.title ?? ""}
        busy={deletingBusy}
        error={deleteError}
        onClose={() => {
          setDeletingId(null);
          setDeleteError(null);
        }}
        onConfirm={() => {
          if (deletingSet) void confirmDelete(deletingSet.id);
        }}
      />
      <CustomAssignmentCreateModal
        open={createOpen || assigningSet !== null}
        initialProblemSet={assigningSet}
        onClose={() => {
          setCreateOpen(false);
          setAssigningSet(null);
        }}
      />
    </div>
  );
}

function formatSavedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()} 저장`;
}
