"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isUnresolvedWordMeaning } from "@/lib/ai/resolve-word-meaning";
import {
  analyzeSelectedWord,
  buildSentenceAnalysis,
} from "@/lib/ai/sentence-problem-service";
import { getAllIdioms } from "@/lib/problem-bank";
import {
  parseEnglishPassage,
  splitIntoMeaningSentences,
  wordSelectionId,
  type ParsedSentence,
} from "@/lib/ai/split-english-text";
import {
  CUSTOM_PROBLEM_TYPE_OPTIONS,
  type CustomProblemTypeId,
  type SentenceAnalysis,
  type WordAnalysis,
} from "@/lib/ai/sentence-problem-types";
import { saveAssignDraft } from "@/lib/assign-draft";
import { contentsFromCustomProblemSet } from "@/lib/custom-assign-contents";
import {
  appendProblemSet,
  loadProblemSets,
  persistProblemSets,
  updateProblemSet,
  type CreateProblemSetInput,
  type CustomAssignmentDraft,
  type SavedProblemSet,
} from "@/lib/problem-sets";
import {
  loadTeacherClasses,
  type TeacherClass,
} from "@/lib/teacher-classes";

type CustomAssignmentCreateModalProps = {
  open: boolean;
  onClose: () => void;
  /** 목록에서 「과제 내기」로 다시 열 때 */
  initialProblemSet?: SavedProblemSet | null;
};

const DEFAULT_TYPE_ON: Record<CustomProblemTypeId, boolean> = {
  match: false,
  listen: false,
  choice: false,
  spell: false,
  chunk: false,
  translate: false,
  write: false,
};

function SectionHeading({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex h-5 items-center gap-2">
      <span
        className="grid size-5 shrink-0 place-items-center rounded-full bg-[#EAF1FF] text-[11px] font-bold leading-none text-[#3667F0]"
        aria-hidden
      >
        {n}
      </span>
      <h2 className="m-0 text-[15px] font-semibold leading-none text-[#16181D]">
        {title}
      </h2>
    </div>
  );
}

function CheckToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-[#1AA7F2]"
    >
      <span
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3.5px]"
        style={{
          background: checked ? "#3667F0" : "#FFFFFF",
          border: `1px solid ${checked ? "#3667F0" : "#D5D7DD"}`,
        }}
        aria-hidden
      >
        {checked ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2 5.2l2 2 4-4.4"
              stroke="#FFFFFF"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      <span className="text-[13px] font-medium text-[#4B5563]">{label}</span>
    </button>
  );
}

function TypeCheckRow({
  title,
  options,
  typeOn,
  onToggle,
  onToggleAll,
}: {
  title: string;
  options: { id: CustomProblemTypeId; label: string }[];
  typeOn: Record<CustomProblemTypeId, boolean>;
  onToggle: (id: CustomProblemTypeId) => void;
  onToggleAll: () => void;
}) {
  const allOn = options.length > 0 && options.every((o) => typeOn[o.id]);
  return (
    <div className="py-3.5">
      <div className="mb-2 text-[13px] font-semibold text-[#16181D]">{title}</div>
      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
        <span className="shrink-0 text-[12px] font-medium text-[#6B7280]">
          유형 선택 :
        </span>
        <CheckToggle checked={allOn} onChange={onToggleAll} label="전체" />
        {options.map((option) => (
          <CheckToggle
            key={option.id}
            checked={typeOn[option.id]}
            onChange={() => onToggle(option.id)}
            label={option.label}
          />
        ))}
      </div>
    </div>
  );
}

function resolveGradeFromClasses(
  classList: TeacherClass[],
  classIds: string[],
): string {
  const grades = classIds
    .map((id) => classList.find((item) => item.id === id)?.grade?.trim())
    .filter((grade): grade is string => Boolean(grade));
  const unique = [...new Set(grades)];
  return unique.length === 1 ? unique[0]! : "사용자 지정";
}

function typeOnFromProblemTypes(
  problemTypes: SavedProblemSet["problemTypes"],
): Record<CustomProblemTypeId, boolean> {
  const wordLabels = new Set(problemTypes.words);
  const sentenceLabels = new Set(problemTypes.sentences);
  const next = { ...DEFAULT_TYPE_ON };
  for (const option of CUSTOM_PROBLEM_TYPE_OPTIONS) {
    next[option.id] =
      option.category === "word"
        ? wordLabels.has(option.label)
        : sentenceLabels.has(option.label);
  }
  if (!CUSTOM_PROBLEM_TYPE_OPTIONS.some((o) => next[o.id])) {
    return { ...DEFAULT_TYPE_ON };
  }
  return next;
}

function sentenceDraftsFromRecord(
  raw: Record<string, SentenceAnalysis> | Record<number, SentenceAnalysis>,
): Record<number, SentenceAnalysis> {
  const next: Record<number, SentenceAnalysis> = {};
  for (const [key, value] of Object.entries(raw)) {
    next[Number(key)] = value;
  }
  return next;
}

function isBlank(value: string | undefined): boolean {
  return !value?.trim();
}

/** 교사 수정이 필요한 칸이 있으면 짧은 안내 문구, 없으면 null */
function getNeedsEditReason(params: {
  hasWordType: boolean;
  hasSentenceType: boolean;
  requireChunksEn: boolean;
  requireChunksKo: boolean;
  selectedIds: string[];
  analyses: Record<string, WordAnalysis>;
  loadingIds: string[];
  errors: Record<string, string>;
  sentenceRows: SentenceAnalysis[];
}): string | null {
  const {
    hasWordType,
    hasSentenceType,
    requireChunksEn,
    requireChunksKo,
    selectedIds,
    analyses,
    loadingIds,
    errors,
    sentenceRows,
  } = params;

  if (hasWordType && selectedIds.length > 0) {
    if (loadingIds.some((id) => selectedIds.includes(id))) {
      return "단어 분석이 끝날 때까지 기다려 주세요.";
    }
    if (selectedIds.some((id) => errors[id])) {
      return "분석에 실패한 단어가 있어요. 다시 시도하거나 뜻을 직접 수정해 주세요.";
    }
    for (const id of selectedIds) {
      const row = analyses[id];
      if (!row) {
        return "선택한 단어의 분석 결과를 확인해 주세요.";
      }
      if (
        isBlank(row.lemma) ||
        isBlank(row.sourceSentence) ||
        isBlank(row.translationKo) ||
        isUnresolvedWordMeaning(row.meaningKo)
      ) {
        return "표에서 비어 있거나 수정이 필요한 칸을 채워 주세요.";
      }
    }
  }

  if (hasSentenceType) {
    for (const row of sentenceRows) {
      if (isBlank(row.english) || isBlank(row.translationKo)) {
        return "표에서 비어 있거나 수정이 필요한 칸을 채워 주세요.";
      }
      if (requireChunksEn && isBlank(row.chunksEn)) {
        return "표에서 비어 있거나 수정이 필요한 칸을 채워 주세요.";
      }
      if (requireChunksKo && isBlank(row.chunksKo)) {
        return "표에서 비어 있거나 수정이 필요한 칸을 채워 주세요.";
      }
    }
  }

  return null;
}

export function CustomAssignmentCreateModal({
  open,
  onClose,
  initialProblemSet = null,
}: CustomAssignmentCreateModalProps) {
  const titleId = useId();
  const [draft, setDraft] = useState("");
  const [draftKo, setDraftKo] = useState("");
  const [passage, setPassage] = useState("");
  const [passageMeanings, setPassageMeanings] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, WordAnalysis>>({});
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [typeOn, setTypeOn] =
    useState<Record<CustomProblemTypeId, boolean>>(DEFAULT_TYPE_ON);
  const [sentenceDrafts, setSentenceDrafts] = useState<
    Record<number, SentenceAnalysis>
  >({});
  const router = useRouter();
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [pendingProblemSet, setPendingProblemSet] =
    useState<SavedProblemSet | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  // 숙어는 한 단어처럼 클릭되게 — 청크 나눔과 같은 목록을 쓴다
  const idioms = useMemo(() => getAllIdioms(), []);

  const sentences = useMemo(
    () => (passage ? parseEnglishPassage(passage, idioms) : []),
    [passage, idioms],
  );

  const resetAll = useCallback(() => {
    setDraft("");
    setDraftKo("");
    setPassage("");
    setPassageMeanings([]);
    setSelectedIds([]);
    setAnalyses({});
    setLoadingIds([]);
    setErrors({});
    setTypeOn({ ...DEFAULT_TYPE_ON });
    setSentenceDrafts({});
    setSelectedClassIds([]);
    setPendingProblemSet(null);
    setSubmitting(false);
    setSubmitError("");
    setHydratedId(null);
  }, []);

  const hydrateFromProblemSet = useCallback((problemSet: SavedProblemSet) => {
    const draftData = problemSet.customDraft;
    if (draftData) {
      setDraft(draftData.draft);
      setDraftKo(draftData.draftKo);
      setPassage(draftData.passage);
      setPassageMeanings(draftData.passageMeanings);
      setSelectedIds(draftData.selectedIds);
      setAnalyses(draftData.analyses);
      setTypeOn({ ...DEFAULT_TYPE_ON, ...draftData.typeOn });
      setSentenceDrafts(sentenceDraftsFromRecord(draftData.sentenceDrafts));
    } else {
      const passageText = problemSet.items.sentences.join("\n");
      // 저장할 때와 같은 규칙으로 나눠야 단어 선택이 그대로 복원된다
      const parsed = passageText
        ? parseEnglishPassage(passageText, getAllIdioms())
        : [];
      const remaining = problemSet.items.words.map((w) => w.toLowerCase());
      const restoredIds: string[] = [];
      const restoredAnalyses: Record<string, WordAnalysis> = {};
      for (const sentence of parsed) {
        for (const token of sentence.tokens) {
          if (token.kind !== "word") continue;
          const hit = remaining.findIndex(
            (surface) => surface === token.text.toLowerCase(),
          );
          if (hit < 0) continue;
          remaining.splice(hit, 1);
          const id = wordSelectionId(sentence.index, token.wordIndex);
          restoredIds.push(id);
          restoredAnalyses[id] = {
            id,
            sentenceIndex: sentence.index,
            wordIndex: token.wordIndex,
            surface: token.text,
            lemma: token.text.toLowerCase(),
            meaningKo: `${token.text} (뜻 확인)`,
            pos: "other",
            // 저장본에는 뜻이 없어 복원 시엔 항상 교사 확인이 필요하다
            needsReview: true,
            candidates: [],
            sourceSentence: sentence.text,
            translationKo: "",
          };
        }
      }
      setDraft(passageText);
      setDraftKo("");
      setPassage(passageText);
      setPassageMeanings([]);
      setSelectedIds(restoredIds);
      setAnalyses(restoredAnalyses);
      setTypeOn(typeOnFromProblemTypes(problemSet.problemTypes));
      setSentenceDrafts({});
    }
    setLoadingIds([]);
    setErrors({});
    setSelectedClassIds([...problemSet.assignedClassIds]);
    setPendingProblemSet(problemSet);
    setSubmitting(false);
    setSubmitError("");
    setHydratedId(problemSet.id);
  }, []);

  useEffect(() => {
    if (!open) {
      setHydratedId(null);
      return;
    }
    setClasses(loadTeacherClasses());
    if (initialProblemSet) {
      if (hydratedId === initialProblemSet.id) return;
      hydrateFromProblemSet(initialProblemSet);
      return;
    }
    if (hydratedId === "new") return;
    resetAll();
    setHydratedId("new");
  }, [
    open,
    initialProblemSet,
    hydratedId,
    hydrateFromProblemSet,
    resetAll,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleClose = () => {
    if (submitting) return;
    resetAll();
    onClose();
  };

  const toggleClass = (classId: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId],
    );
    setSubmitError("");
  };

  const applyPassage = () => {
    const next = draft.trim();
    if (!next) return;
    const meanings = splitIntoMeaningSentences(draftKo);
    setPassage(next);
    setPassageMeanings(meanings);
    setSelectedIds([]);
    setAnalyses({});
    setLoadingIds([]);
    setErrors({});
    setSentenceDrafts({});
    setSelectedClassIds([]);
    setSubmitError("");
  };

  const runAnalyze = useCallback(
    async (
      sentence: ParsedSentence,
      wordIndex: number,
      surface: string,
      opts?: { forceRefresh?: boolean },
    ) => {
      const id = wordSelectionId(sentence.index, wordIndex);
      setLoadingIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      const result = await analyzeSelectedWord(
        {
          sentence: sentence.text,
          surface,
          sentenceIndex: sentence.index,
          wordIndex,
          translationKo: passageMeanings[sentence.index] ?? "",
        },
        opts,
      );
      setLoadingIds((prev) => prev.filter((x) => x !== id));
      if (!result.ok) {
        setErrors((prev) => ({ ...prev, [id]: result.message }));
        return;
      }
      setAnalyses((prev) => ({ ...prev, [id]: result.data }));
    },
    [passageMeanings],
  );

  const toggleWord = async (
    sentence: ParsedSentence,
    wordIndex: number,
    surface: string,
  ) => {
    const id = wordSelectionId(sentence.index, wordIndex);
    const already = selectedIds.includes(id);

    if (already) {
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      setAnalyses((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setLoadingIds((prev) => prev.filter((x) => x !== id));
      return;
    }

    setSelectedIds((prev) => [...prev, id]);
    await runAnalyze(sentence, wordIndex, surface);
  };

  const updateAnalysis = (id: string, patch: Partial<WordAnalysis>) => {
    setSubmitError("");
    setAnalyses((prev) => {
      const current = prev[id];
      if (!current) return prev;
      // 교사가 뜻을 직접 손대면 「확인 필요」는 해소된 것으로 본다
      const resolved =
        patch.meaningKo != null && patch.meaningKo !== current.meaningKo
          ? { needsReview: false }
          : null;
      return { ...prev, [id]: { ...current, ...patch, ...resolved } };
    });
  };

  /**
   * 후보 칩 클릭 = 교사의 확인. **값이 그대로여도 확인으로 친다** —
   * 첫 칩은 이미 선택된 뜻이라, 값 변화만 보면 "이게 맞아요"라고 누른 게
   * 아무 반응 없이 먹히지 않는다.
   */
  const confirmMeaning = (id: string, meaningKo: string) => {
    setSubmitError("");
    setAnalyses((prev) => {
      const current = prev[id];
      if (!current) return prev;
      return { ...prev, [id]: { ...current, meaningKo, needsReview: false } };
    });
  };

  /** 예문과 대조하지 못해 대표 뜻으로 채운 행 수 */
  const reviewCount = useMemo(
    () =>
      selectedIds.filter((id) => analyses[id]?.needsReview).length,
    [selectedIds, analyses],
  );

  const selectedAnalyses = useMemo(
    () =>
      selectedIds
        .map((id) => analyses[id])
        .filter((item): item is WordAnalysis => Boolean(item)),
    [selectedIds, analyses],
  );

  /** 선택된 단어가 속한 문장 → 문장유형 행 자동 생성 */
  useEffect(() => {
    const groups = new Map<number, WordAnalysis[]>();
    for (const item of selectedAnalyses) {
      const list = groups.get(item.sentenceIndex) ?? [];
      list.push(item);
      groups.set(item.sentenceIndex, list);
    }

    setSentenceDrafts((prev) => {
      const next: Record<number, SentenceAnalysis> = {};
      for (const [sentenceIndex, words] of groups) {
        const sample = words[0]!;
        const existing = prev[sentenceIndex];
        const english = sample.sourceSentence;
        const translationKo = sample.translationKo;
        const meanings = words.map((w) => w.meaningKo);

        if (
          existing &&
          existing.english === english &&
          existing.translationKo === translationKo
        ) {
          next[sentenceIndex] = existing;
          continue;
        }

        next[sentenceIndex] = buildSentenceAnalysis({
          sentenceIndex,
          english,
          translationKo,
          wordMeanings: meanings,
          idioms: getAllIdioms(),
        });
      }
      return next;
    });
  }, [selectedAnalyses]);

  const sentenceRows = useMemo(
    () =>
      Object.values(sentenceDrafts).sort(
        (a, b) => a.sentenceIndex - b.sentenceIndex,
      ),
    [sentenceDrafts],
  );

  const updateSentence = (
    sentenceIndex: number,
    patch: Partial<SentenceAnalysis>,
  ) => {
    setSubmitError("");
    setSentenceDrafts((prev) => {
      const current = prev[sentenceIndex];
      if (!current) return prev;

      // 청크만 수정
      if (
        (patch.chunksEn != null || patch.chunksKo != null) &&
        patch.english == null &&
        patch.translationKo == null
      ) {
        return { ...prev, [sentenceIndex]: { ...current, ...patch } };
      }

      const english = patch.english ?? current.english;
      const translationKo = patch.translationKo ?? current.translationKo;
      const rebuilt = buildSentenceAnalysis({
        sentenceIndex,
        english,
        translationKo,
        wordMeanings: selectedAnalyses
          .filter((w) => w.sentenceIndex === sentenceIndex)
          .map((w) => w.meaningKo),
        idioms: getAllIdioms(),
      });

      return {
        ...prev,
        [sentenceIndex]: {
          ...rebuilt,
          chunksEn: patch.chunksEn ?? rebuilt.chunksEn,
          chunksKo: patch.chunksKo ?? rebuilt.chunksKo,
        },
      };
    });

    if (patch.english != null || patch.translationKo != null) {
      setAnalyses((prev) => {
        const next = { ...prev };
        for (const [id, item] of Object.entries(next)) {
          if (item.sentenceIndex !== sentenceIndex) continue;
          next[id] = {
            ...item,
            sourceSentence: patch.english ?? item.sourceSentence,
            translationKo: patch.translationKo ?? item.translationKo,
          };
        }
        return next;
      });
    }
  };

  const activeTypes = useMemo(
    () =>
      CUSTOM_PROBLEM_TYPE_OPTIONS.map((t) => t.id).filter((id) => typeOn[id]),
    [typeOn],
  );

  const hasWordType = useMemo(
    () =>
      activeTypes.some(
        (id) =>
          CUSTOM_PROBLEM_TYPE_OPTIONS.find((t) => t.id === id)?.category ===
          "word",
      ),
    [activeTypes],
  );

  const hasSentenceType = useMemo(
    () =>
      activeTypes.some(
        (id) =>
          CUSTOM_PROBLEM_TYPE_OPTIONS.find((t) => t.id === id)?.category ===
          "sentence",
      ),
    [activeTypes],
  );

  const readyForClasses = useMemo(() => {
    if (activeTypes.length === 0) return false;
    if (hasWordType && selectedAnalyses.length === 0) return false;
    if (hasSentenceType && sentenceRows.length === 0) return false;
    return true;
  }, [
    activeTypes.length,
    hasWordType,
    hasSentenceType,
    selectedAnalyses.length,
    sentenceRows.length,
  ]);

  const needsEditReason = useMemo(
    () =>
      getNeedsEditReason({
        hasWordType,
        hasSentenceType,
        requireChunksEn: typeOn.chunk,
        requireChunksKo: typeOn.translate,
        selectedIds,
        analyses,
        loadingIds,
        errors,
        sentenceRows,
      }),
    [
      hasWordType,
      hasSentenceType,
      typeOn.chunk,
      typeOn.translate,
      selectedIds,
      analyses,
      loadingIds,
      errors,
      sentenceRows,
    ],
  );

  const canSubmit =
    readyForClasses &&
    selectedClassIds.length > 0 &&
    !needsEditReason &&
    !submitting;

  const buildCustomDraft = (): CustomAssignmentDraft => ({
    draft,
    draftKo,
    passage,
    passageMeanings,
    selectedIds,
    analyses,
    typeOn,
    sentenceDrafts: Object.fromEntries(
      Object.entries(sentenceDrafts).map(([key, value]) => [String(key), value]),
    ),
  });

  const handleSubmit = () => {
    setSubmitError("");
    if (!readyForClasses) {
      setSubmitError("문제 유형과 필수 단어를 확인해 주세요.");
      return;
    }
    if (needsEditReason) {
      setSubmitError(needsEditReason);
      return;
    }
    if (selectedClassIds.length === 0) {
      setSubmitError("받는 반을 선택해 주세요.");
      return;
    }

    const wordLabels = CUSTOM_PROBLEM_TYPE_OPTIONS.filter(
      (o) => o.category === "word" && typeOn[o.id],
    ).map((o) => o.label);
    const sentenceLabels = CUSTOM_PROBLEM_TYPE_OPTIONS.filter(
      (o) => o.category === "sentence" && typeOn[o.id],
    ).map((o) => o.label);

    const customDraft = buildCustomDraft();
    const input: CreateProblemSetInput = {
      grade: resolveGradeFromClasses(classes, selectedClassIds),
      textbook: "문장 과제",
      unit: new Date().toLocaleDateString("ko-KR"),
      assignedClassIds: [...selectedClassIds],
      items: {
        words: selectedAnalyses.map((w) => w.lemma || w.surface),
        sentences: sentenceRows.map((s) => s.english),
        grammar: [],
      },
      problemTypes: {
        words: wordLabels,
        sentences: sentenceLabels,
        grammar: [],
      },
      // 문제 제출 화면 부여분과 달리, 여기서 만든 세트는 목록에 남긴다
      hiddenFromLibrary: false,
      customDraft,
    };

    // 이미 저장해 둔 세트가 있으면 내용만 갱신 후 과제 부여 페이지로
    let problemSetId: string;
    if (pendingProblemSet) {
      const next = updateProblemSet(loadProblemSets(), pendingProblemSet.id, {
        grade: input.grade,
        textbook: input.textbook,
        unit: input.unit,
        assignedClassIds: input.assignedClassIds,
        items: input.items,
        problemTypes: input.problemTypes,
        customDraft,
        hiddenFromLibrary: false,
      });
      persistProblemSets(next);
      problemSetId = pendingProblemSet.id;
      setPendingProblemSet(
        next.find((item) => item.id === pendingProblemSet.id) ?? null,
      );
    } else {
      const created = appendProblemSet(input);
      problemSetId = created.id;
      setPendingProblemSet(created);
    }

    saveAssignDraft({
      v: 1,
      source: "custom",
      problemSetId,
      classIds: [...selectedClassIds],
      returnHref: "/teacher/problems/saved",
      contents: contentsFromCustomProblemSet(input),
    });
    resetAll();
    onClose();
    router.push("/teacher/problems/assign");
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-[min(900px,94%)] w-[min(1100px,98%)] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#F0F1F3] px-6 py-4">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-[18px] font-bold tracking-[0.02em] text-[#15171A]"
            >
              문장 기반 자동 문제 생성
            </h2>
            <p className="mt-1 text-[13px] font-medium leading-relaxed tracking-[0.01em] text-[#8B8F96]">
              영어 문장과 문장 뜻을 함께 넣고, 필수 단어를 골라 문제를 만들 수
              있어요.
            </p>
            <p
              role="note"
              className="mt-2 inline-flex max-w-full items-start gap-1.5 rounded-[8px] border border-[#FDE68A] bg-[#FFFBEB] px-2.5 py-1.5 text-[12px] font-medium leading-snug text-[#92400E]"
            >
              <span
                className="mt-[1px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-[#F59E0B] text-[9px] font-bold leading-none text-white"
                aria-hidden
              >
                !
              </span>
              <span>
                지금은 무료 버전 AI를 쓰고 있어요. 단어와 뜻은 한 번만 확인해
                주세요. 오류가 많진 않아요!
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="닫기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#8B8F96] hover:bg-[#F3F4F5] hover:text-[#15171A]"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <section className="rounded-[14px] border border-[#E8E8EA] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-[12px] font-bold text-[#8B8F96]">1. 문장 입력</p>
            <label className="mt-2 block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#4B5563]">
                영어 문장
              </span>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={`예)\nI woke up early because I had a math test today.\nAlthough I was a little nervous, I did my best during the exam.`}
                rows={4}
                className="w-full resize-y rounded-[12px] border border-[#E1E2E4] bg-[#FAFBFC] px-3.5 py-3 text-[14px] font-medium leading-relaxed text-[#15171A] outline-none placeholder:text-[#B0B4BB] focus:border-[#1AA7F2] focus:bg-white"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#4B5563]">
                문장 뜻
              </span>
              <textarea
                value={draftKo}
                onChange={(event) => setDraftKo(event.target.value)}
                placeholder={`영어와 같은 순서로 뜻을 적어 주세요.\n예)\n나는 오늘 수학 시험이 있어서 일찍 일어났다.\n조금 긴장했지만 시험 동안 최선을 다했다.`}
                rows={4}
                className="w-full resize-y rounded-[12px] border border-[#E1E2E4] bg-[#FAFBFC] px-3.5 py-3 text-[14px] font-medium leading-relaxed text-[#15171A] outline-none placeholder:text-[#B0B4BB] focus:border-[#1AA7F2] focus:bg-white"
              />
            </label>
            <p className="mt-2 text-[11px] font-medium text-[#9CA3AF]">
              영어·한글 모두 문장 수·순서를 맞춰 주세요. (줄바꿈, 마침표, 물음표,
              느낌표로 구분)
            </p>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                disabled={!draft.trim()}
                onClick={applyPassage}
                className={`h-10 rounded-[10px] px-4 text-[13px] font-bold ${
                  draft.trim()
                    ? "bg-[#1AA7F2] text-white hover:bg-[#1596d9]"
                    : "cursor-not-allowed bg-[#E5E7EB] text-[#6B7280]"
                }`}
              >
                문장으로 나누기
              </button>
            </div>
          </section>

          {sentences.length > 0 ? (
            <section className="mt-4 rounded-[14px] border border-[#E8E8EA] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[12px] font-bold text-[#8B8F96]">
                2. 필수 단어 선택
              </p>
              <p className="mt-1 text-[12px] font-medium text-[#9CA3AF]">
                단어를 클릭해 선택·해제할 수 있어요. 한 문장에서 여러 개를 고를
                수 있어요.
              </p>
              <div className="mt-3 space-y-4">
                {sentences.map((sentence) => (
                  <div
                    key={sentence.index}
                    className="rounded-[12px] border border-[#F0F1F3] bg-[#FAFBFC] px-3.5 py-3"
                  >
                    <p className="mb-2 text-[11px] font-bold text-[#B0B4BB]">
                      문장 {sentence.index + 1}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {sentence.tokens.map((token, tokenIndex) => {
                        if (token.kind === "gap") {
                          return (
                            <span
                              key={`g-${sentence.index}-${tokenIndex}`}
                              className="whitespace-pre text-[14px] text-[#6E6A63]"
                            >
                              {token.text}
                            </span>
                          );
                        }
                        const id = wordSelectionId(
                          sentence.index,
                          token.wordIndex,
                        );
                        const on = selectedIds.includes(id);
                        const busy = loadingIds.includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            disabled={busy}
                            aria-label={token.text}
                            onClick={() =>
                              void toggleWord(
                                sentence,
                                token.wordIndex,
                                token.text,
                              )
                            }
                            className={`relative inline-flex h-8 min-w-[2.75rem] items-center justify-center rounded-[8px] border px-2 text-[13px] font-semibold transition-colors ${
                              on
                                ? "border-[#1AA7F2] bg-[#EAF6FE] text-[#1274A9]"
                                : "border-[#E5E7EB] bg-white text-[#3D4148] hover:border-[#9DD9F8] hover:bg-[#F8FCFF]"
                            }`}
                          >
                            <span className={busy ? "opacity-35" : undefined}>
                              {token.text}
                            </span>
                            {busy ? (
                              <span
                                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                                aria-hidden
                              >
                                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1AA7F2] border-t-transparent" />
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {selectedIds.length > 0 ? (
            <section className="mt-4 rounded-[14px] border border-[#E8E8EA] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[12px] font-bold text-[#8B8F96]">
                3. 단어유형 자동생성
              </p>
                <p className="mt-1 text-[12px] font-medium text-[#9CA3AF]">
                  선택한 단어는 동사원형(기본형)으로 자동 변환돼요. 뜻은
                  Wiktionary 한국어 뜻을 문장 뜻과 맞춰 고르고, 없으면 로컬
                  사전·번역으로 보완해요. 칩에 마우스를 올리면 전체 뜻 목록이
                  보여요. 표에서 바로 고칠 수 있어요.
                </p>

                {reviewCount > 0 ? (
                  <p className="mt-2 rounded-[8px] border border-[#F5C26B] bg-[#FFFBF2] px-3 py-2 text-[12px] font-semibold text-[#B4791B]">
                    ⚠ 예문과 뜻을 맞추지 못한 단어가 {reviewCount}개예요. 대표
                    뜻을 넣어 뒀으니 노란 칸을 확인하고 고쳐 주세요.
                  </p>
                ) : null}

              {(loadingIds.length > 0 || Object.keys(errors).length > 0) && (
                <div className="mt-3 space-y-2">
                  {selectedIds.map((id) => {
                    if (!loadingIds.includes(id) && !errors[id]) return null;
                    const [sIdx, wIdx] = id.split(":").map(Number);
                    const host = sentences.find((s) => s.index === sIdx);
                    const surfaceToken = host?.tokens.find(
                      (t) => t.kind === "word" && t.wordIndex === wIdx,
                    );
                    const label =
                      surfaceToken && surfaceToken.kind === "word"
                        ? surfaceToken.text
                        : id;

                    if (loadingIds.includes(id)) {
                      return (
                        <div
                          key={`load-${id}`}
                          className="flex items-center gap-3 rounded-[10px] border border-[#D6EDFB] bg-[#F2FAFF] px-3.5 py-2.5"
                        >
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1AA7F2] border-t-transparent" />
                          <p className="text-[12px] font-semibold text-[#1274A9]">
                            {label} 분석 중…
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={`err-${id}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#F5D0D0] bg-[#FFF7F7] px-3.5 py-2.5"
                      >
                        <p className="text-[12px] font-semibold text-[#C52B2B]">
                          {label} · {errors[id]}
                        </p>
                        <button
                          type="button"
                          className="h-8 rounded-[8px] border border-[#FECACA] bg-white px-2.5 text-[11px] font-bold text-[#C52B2B] hover:bg-[#FEF2F2]"
                          onClick={() => {
                            if (
                              !host ||
                              !surfaceToken ||
                              surfaceToken.kind !== "word"
                            )
                              return;
                            void runAnalyze(host, wIdx, surfaceToken.text, {
                              forceRefresh: true,
                            });
                          }}
                        >
                          다시 시도
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedAnalyses.length > 0 ? (
                <div className="mt-3 overflow-x-auto rounded-[12px] border border-[#E5E7EB]">
                  <table className="min-w-[720px] w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-[#F7F8FA] text-[12px] font-bold text-[#6B7280]">
                        <th className="w-[14%] border-b border-[#E5E7EB] px-3 py-2.5">
                          단어 (원형)
                        </th>
                        <th className="w-[18%] border-b border-[#E5E7EB] px-3 py-2.5">
                          단어 뜻
                        </th>
                        <th className="w-[34%] border-b border-[#E5E7EB] px-3 py-2.5">
                          예문
                        </th>
                        <th className="w-[34%] border-b border-[#E5E7EB] px-3 py-2.5">
                          예문 뜻
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedIds.map((id) => {
                        const analysis = analyses[id];
                        if (!analysis) return null;
                        return (
                          <tr
                            key={id}
                            className="border-b border-[#F0F1F3] last:border-b-0"
                          >
                            <td className="align-top px-2 py-2">
                              <input
                                value={analysis.lemma}
                                aria-label="단어 원형"
                                onChange={(event) =>
                                  updateAnalysis(id, {
                                    lemma: event.target.value,
                                  })
                                }
                                className="h-9 w-full rounded-[8px] border border-transparent bg-transparent px-2 text-[13px] font-semibold text-[#15171A] outline-none hover:border-[#E5E7EB] focus:border-[#1AA7F2] focus:bg-white"
                              />
                              {analysis.lemma.toLowerCase() !==
                              analysis.surface.toLowerCase() ? (
                                <p className="mt-0.5 px-2 text-[10px] font-medium text-[#9CA3AF]">
                                  문장형: {analysis.surface}
                                </p>
                              ) : null}
                            </td>
                            <td className="align-top px-2 py-2">
                              <input
                                value={analysis.meaningKo}
                                aria-label="단어 뜻"
                                onChange={(event) =>
                                  updateAnalysis(id, {
                                    meaningKo: event.target.value,
                                  })
                                }
                                className={`h-9 w-full rounded-[8px] border bg-transparent px-2 text-[13px] font-medium text-[#15171A] outline-none focus:border-[#1AA7F2] focus:bg-white ${
                                  analysis.needsReview
                                    ? "border-[#F5C26B] bg-[#FFFBF2]"
                                    : "border-transparent hover:border-[#E5E7EB]"
                                }`}
                              />
                              {analysis.needsReview ? (
                                <div className="mt-1 px-1">
                                  <p className="flex items-center gap-1 text-[10px] font-semibold text-[#B4791B]">
                                    <span aria-hidden>⚠</span>
                                    예문과 못 맞춰서 대표 뜻이에요 · 확인해 주세요
                                  </p>
                                  {analysis.candidates &&
                                  analysis.candidates.length > 1 ? (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {analysis.candidates.map((candidate) => (
                                        <button
                                          key={candidate}
                                          type="button"
                                          aria-label={
                                            candidate === analysis.meaningKo
                                              ? `뜻을 ${candidate}로 확정하기`
                                              : `뜻을 ${candidate}로 바꾸기`
                                          }
                                          onClick={() =>
                                            confirmMeaning(id, candidate)
                                          }
                                          className={`rounded-[6px] border px-1.5 py-0.5 text-[11px] font-medium ${
                                            candidate === analysis.meaningKo
                                              ? "border-[#1AA7F2] bg-[#E0F2FE] text-[#1274A9]"
                                              : "border-[#E5E7EB] bg-white text-[#4B5563] hover:border-[#1AA7F2] hover:text-[#1274A9]"
                                          }`}
                                        >
                                          {candidate}
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </td>
                            <td className="align-top px-2 py-2">
                              <textarea
                                value={analysis.sourceSentence}
                                aria-label="예문"
                                rows={2}
                                onChange={(event) =>
                                  updateAnalysis(id, {
                                    sourceSentence: event.target.value,
                                  })
                                }
                                className="w-full resize-y rounded-[8px] border border-transparent bg-transparent px-2 py-1.5 text-[13px] font-medium leading-snug text-[#15171A] outline-none hover:border-[#E5E7EB] focus:border-[#1AA7F2] focus:bg-white"
                              />
                            </td>
                            <td className="align-top px-2 py-2">
                              <textarea
                                value={analysis.translationKo}
                                aria-label="예문 뜻"
                                rows={2}
                                onChange={(event) =>
                                  updateAnalysis(id, {
                                    translationKo: event.target.value,
                                  })
                                }
                                className="w-full resize-y rounded-[8px] border border-transparent bg-transparent px-2 py-1.5 text-[13px] font-medium leading-snug text-[#15171A] outline-none hover:border-[#E5E7EB] focus:border-[#1AA7F2] focus:bg-white"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : null}

          {sentenceRows.length > 0 ? (
            <section className="mt-4 rounded-[14px] border border-[#E8E8EA] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-[12px] font-bold text-[#8B8F96]">
                4. 문장유형 자동생성
              </p>
              <p className="mt-1 text-[12px] font-medium text-[#9CA3AF]">
                문장·뜻과 함께 영어 청크 배열 · 한글 뜻 청크 배열이 자동으로
                채워져요.
              </p>
              <div className="mt-3 overflow-x-auto rounded-[12px] border border-[#E5E7EB]">
                <table className="min-w-[720px] w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-[#F7F8FA] text-[12px] font-bold text-[#6B7280]">
                      <th className="w-[22%] border-b border-[#E5E7EB] px-3 py-2.5">
                        문장
                      </th>
                      <th className="w-[22%] border-b border-[#E5E7EB] px-3 py-2.5">
                        문장 뜻
                      </th>
                      <th className="w-[28%] border-b border-[#E5E7EB] px-3 py-2.5">
                        청크 배열
                      </th>
                      <th className="w-[28%] border-b border-[#E5E7EB] px-3 py-2.5">
                        한글 뜻 청크 배열
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sentenceRows.map((row) => (
                      <tr
                        key={row.sentenceIndex}
                        className="border-b border-[#F0F1F3] last:border-b-0"
                      >
                        <td className="align-top px-2 py-2">
                          <textarea
                            value={row.english}
                            aria-label="문장"
                            rows={3}
                            onChange={(event) =>
                              updateSentence(row.sentenceIndex, {
                                english: event.target.value,
                              })
                            }
                            className="w-full resize-y rounded-[8px] border border-transparent bg-transparent px-2 py-1.5 text-[13px] font-medium leading-snug text-[#15171A] outline-none hover:border-[#E5E7EB] focus:border-[#1AA7F2] focus:bg-white"
                          />
                        </td>
                        <td className="align-top px-2 py-2">
                          <textarea
                            value={row.translationKo}
                            aria-label="문장 뜻"
                            rows={3}
                            onChange={(event) =>
                              updateSentence(row.sentenceIndex, {
                                translationKo: event.target.value,
                              })
                            }
                            className="w-full resize-y rounded-[8px] border border-transparent bg-transparent px-2 py-1.5 text-[13px] font-medium leading-snug text-[#15171A] outline-none hover:border-[#E5E7EB] focus:border-[#1AA7F2] focus:bg-white"
                          />
                        </td>
                        <td className="align-top px-2 py-2">
                          <textarea
                            value={row.chunksEn}
                            aria-label="청크 배열"
                            rows={3}
                            onChange={(event) =>
                              updateSentence(row.sentenceIndex, {
                                chunksEn: event.target.value,
                              })
                            }
                            className="w-full resize-y rounded-[8px] border border-transparent bg-transparent px-2 py-1.5 text-[12px] font-medium leading-snug text-[#15171A] outline-none hover:border-[#E5E7EB] focus:border-[#1AA7F2] focus:bg-white"
                          />
                        </td>
                        <td className="align-top px-2 py-2">
                          <textarea
                            value={row.chunksKo}
                            aria-label="한글 뜻 청크 배열"
                            rows={3}
                            onChange={(event) =>
                              updateSentence(row.sentenceIndex, {
                                chunksKo: event.target.value,
                              })
                            }
                            className="w-full resize-y rounded-[8px] border border-transparent bg-transparent px-2 py-1.5 text-[12px] font-medium leading-snug text-[#15171A] outline-none hover:border-[#E5E7EB] focus:border-[#1AA7F2] focus:bg-white"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {selectedAnalyses.length > 0 || sentenceRows.length > 0 ? (
            <section className="mt-4 rounded-[14px] border border-[#E8E8EA] bg-white px-3.5 py-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="border-b border-[#ECECEF] px-0.5 pt-3.5 pb-1">
                <p className="text-[12px] font-bold text-[#8B8F96]">
                  5. 문제 유형
                </p>
                <p className="mt-1 text-[12px] font-medium text-[#9CA3AF]">
                  문제 제출과 같은 방식으로 유형을 골라 주세요.
                </p>
              </div>
              <div className="divide-y divide-[#ECECEF]">
                <TypeCheckRow
                  title="단어"
                  options={CUSTOM_PROBLEM_TYPE_OPTIONS.filter(
                    (o) => o.category === "word",
                  ).map((o) => ({ id: o.id, label: o.label }))}
                  typeOn={typeOn}
                  onToggle={(id) =>
                    setTypeOn((prev) => ({ ...prev, [id]: !prev[id] }))
                  }
                  onToggleAll={() => {
                    const wordIds = CUSTOM_PROBLEM_TYPE_OPTIONS.filter(
                      (o) => o.category === "word",
                    ).map((o) => o.id);
                    const allOn = wordIds.every((id) => typeOn[id]);
                    setTypeOn((prev) => {
                      const next = { ...prev };
                      for (const id of wordIds) next[id] = !allOn;
                      return next;
                    });
                  }}
                />
                <TypeCheckRow
                  title="문장"
                  options={CUSTOM_PROBLEM_TYPE_OPTIONS.filter(
                    (o) => o.category === "sentence",
                  ).map((o) => ({ id: o.id, label: o.label }))}
                  typeOn={typeOn}
                  onToggle={(id) =>
                    setTypeOn((prev) => ({ ...prev, [id]: !prev[id] }))
                  }
                  onToggleAll={() => {
                    const sentenceIds = CUSTOM_PROBLEM_TYPE_OPTIONS.filter(
                      (o) => o.category === "sentence",
                    ).map((o) => o.id);
                    const allOn = sentenceIds.every((id) => typeOn[id]);
                    setTypeOn((prev) => {
                      const next = { ...prev };
                      for (const id of sentenceIds) next[id] = !allOn;
                      return next;
                    });
                  }}
                />
              </div>
            </section>
          ) : null}

          {readyForClasses ? (
            <section className="mt-4 rounded-[14px] border border-[#E8E8EA] bg-white px-3.5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="mb-1 flex items-center justify-between gap-3">
                <SectionHeading n={6} title="받는 반" />
                {classes.length > 0 ? (
                  <span className="text-[12px] font-semibold leading-none text-[#1AA7F2]">
                    {selectedClassIds.length}개 반 선택
                  </span>
                ) : null}
              </div>
              <p className="mb-3 ml-7 text-[12px] text-[#9CA3AF]">
                과제를 받을 반을 선택해 주세요. 여러 반을 선택할 수 있어요.
              </p>
              {classes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {classes.map((cls) => {
                    const on = selectedClassIds.includes(cls.id);
                    return (
                      <button
                        key={cls.id}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`${cls.name} ${on ? "선택 해제" : "선택"}`}
                        onClick={() => toggleClass(cls.id)}
                        className={`flex h-10 min-w-[112px] cursor-pointer items-center gap-2 rounded-[10px] border px-3 text-[13px] font-semibold outline-none transition-all focus:outline-none focus-visible:outline-none ${
                          on
                            ? "border-[#1AA7F2] bg-[#EAF6FE] text-[#1274A9] shadow-[0_0_0_1px_rgba(26,167,242,0.08)]"
                            : "border-[#E5E7EB] bg-white text-[#4B5563] hover:border-[#9DD9F8] hover:bg-[#F8FCFF]"
                        }`}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: cls.color }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-left">
                          {cls.name}
                        </span>
                        <span
                          className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border ${
                            on
                              ? "border-[#1AA7F2] bg-[#1AA7F2]"
                              : "border-[#C7CBD1] bg-white"
                          }`}
                          aria-hidden
                        >
                          {on ? (
                            <svg
                              width="11"
                              height="9"
                              viewBox="0 0 11 9"
                              fill="none"
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
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="ml-7 text-[13px] text-[#9497A0]">
                  등록된 반이 없어요. 반 설정에서 반을 추가해 주세요.
                </p>
              )}
            </section>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-[#F0F1F3] px-6 py-4">
          {needsEditReason || submitError ? (
            <p className="text-right text-[13px] font-medium text-[#DC2626]">
              {needsEditReason || submitError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="h-11 rounded-[12px] border border-[#E1E2E4] bg-white px-5 text-[14px] font-bold text-[#3D4148] hover:bg-[#F7F7F7] disabled:cursor-not-allowed disabled:opacity-60"
            >
              닫기
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className={`h-11 rounded-[12px] px-5 text-[14px] font-bold ${
                canSubmit
                  ? "bg-[#1AA7F2] text-white hover:bg-[#1596d9]"
                  : "cursor-not-allowed bg-[#E5E7EB] text-[#6B7280]"
              }`}
            >
              제출하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 4L12 12M12 4L4 12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
