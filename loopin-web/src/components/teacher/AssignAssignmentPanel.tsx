"use client";

import { useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  AssignAssignmentModal,
  type AssignResult,
} from "@/components/teacher/AssignAssignmentModal";
import {
  clearAssignDraft,
  loadAssignDraft,
  patchAssignDraft,
  type AssignDraft,
  type AssignDraftUi,
} from "@/lib/assign-draft";
import {
  publishCustomAssign,
  publishProblemsAssign,
} from "@/lib/assign-publish";
import { CLASS_LAYOUT } from "@/lib/class-layout";
import { loadProblemSets } from "@/lib/problem-sets";
import { loadTeacherClasses } from "@/lib/teacher-classes";

/**
 * 초안 hydrate 전에도 깔아 둔다.
 * 안 그러면 `problems-list.svg`(문제 관리)가 한 프레임 보인다.
 */
function AssignPageCover() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[22]" aria-hidden>
      <div
        className="absolute"
        style={{
          left: CLASS_LAYOUT.sidebarWidth,
          top: 0,
          width: 1557 - CLASS_LAYOUT.sidebarWidth,
          height: 973,
          background: "#FFFFFF",
        }}
      />
    </div>
  );
}

/**
 * `/teacher/problems/assign` — sessionStorage 초안을 읽어 과제 부여 화면을 띄운다.
 */
export function AssignAssignmentPanel() {
  const router = useRouter();
  const [draft, setDraft] = useState<AssignDraft | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const loaded = loadAssignDraft();
    setDraft(loaded);
    setHydrated(true);
    if (!loaded) {
      router.replace("/teacher/problems");
    }
  }, [router]);

  /**
   * 취소·브라우저 뒤로 — 초안을 지운다.
   * 예전엔 유지해서 문제 제출 화면에 유형·반·파트·문항을 복원했는데,
   * 그게 「기본이 전부 체크된 것처럼」 보여서 비우는 쪽으로 바꿨다.
   */
  const goBack = () => {
    const href = draft?.returnHref || "/teacher/problems";
    clearAssignDraft();
    router.push(href);
  };

  const handleAssignUiChange = (assignUi: AssignDraftUi) => {
    patchAssignDraft({ assignUi });
  };

  const handleConfirm = (result: AssignResult) => {
    if (!draft || busy) return;
    setBusy(true);
    setError(null);
    void (async () => {
      if (draft.source === "problems" && draft.pendingInput) {
        const editing =
          draft.editingProblemSetId != null
            ? (loadProblemSets().find(
                (item) => item.id === draft.editingProblemSetId,
              ) ?? null)
            : null;
        const publish = await publishProblemsAssign({
          pendingInput: draft.pendingInput,
          result,
          context: {
            unitItemIds: draft.unitItemIds ?? {
              words: [],
              sentences: [],
              grammar: [],
            },
            partCounts: draft.partCounts ?? {
              words: 1,
              sentences: 1,
              grammar: 1,
            },
          },
          editingProblemSet: editing,
        });
        setBusy(false);
        if (!publish.ok) {
          setError(publish.message);
          return;
        }
        clearAssignDraft();
        router.push(draft.returnHref || "/teacher/problems");
        return;
      }

      if (draft.source === "custom" && draft.problemSetId) {
        const problemSet =
          loadProblemSets().find((item) => item.id === draft.problemSetId) ??
          null;
        if (!problemSet) {
          setBusy(false);
          setError("문제 세트를 찾지 못했어요.");
          return;
        }
        const assignments = result.groups[0]?.assignments ?? [];
        const publish = await publishCustomAssign({
          problemSet,
          assignments,
        });
        setBusy(false);
        if (!publish.ok) {
          setError(publish.message);
          return;
        }
        clearAssignDraft();
        router.push(draft.returnHref || "/teacher/problems/saved");
        return;
      }

      setBusy(false);
      setError("부여할 과제 정보가 없어요.");
    })();
  };

  if (!hydrated || !draft) return <AssignPageCover />;

  const classes = loadTeacherClasses().filter((item) =>
    draft.classIds.some((id) => id === item.id),
  );

  return (
    <>
      <AssignAssignmentModal
        open
        variant="page"
        busy={busy}
        classes={classes.length > 0 ? classes : loadTeacherClasses()}
        classIds={draft.classIds}
        contents={draft.contents}
        initialAssignUi={draft.assignUi}
        onAssignUiChange={handleAssignUiChange}
        onClose={goBack}
        onConfirm={handleConfirm}
      />
      {error ? (
        <div className="pointer-events-none absolute bottom-8 left-1/2 z-[30] -translate-x-1/2 rounded-[10px] bg-[#FEF2F2] px-4 py-2 text-[13px] font-semibold text-[#B91C1C] shadow">
          {error}
        </div>
      ) : null}
    </>
  );
}
