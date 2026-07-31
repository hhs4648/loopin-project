import type {
  CreateProblemSetInput,
  CustomAssignmentDraft,
  SavedProblemSet,
} from "@/lib/problem-sets";

/**
 * 선택한 문항(단어·문장·문법 id)만 남긴 오답 복습용 문제 세트 입력.
 * 학생 앱에는 `buildContentSnapshot` → content_snapshot 으로 전달된다.
 */
export function buildReissueProblemSetInput(
  source: SavedProblemSet,
  selectedBaseIds: string[],
): CreateProblemSetInput | null {
  const idSet = new Set(selectedBaseIds.filter(Boolean));
  if (idSet.size === 0) return null;

  const draft = source.customDraft
    ? filterCustomDraft(source.customDraft, idSet)
    : undefined;

  const words = draft
    ? Object.values(draft.analyses).map((w) => w.lemma || w.surface)
    : source.items.words.filter((id) => idSet.has(id));

  const sentences = draft
    ? Object.values(draft.sentenceDrafts)
        .sort((a, b) => a.sentenceIndex - b.sentenceIndex)
        .map((s) => s.english)
    : source.items.sentences.filter((id) => idSet.has(id));

  const grammar = source.items.grammar.filter((id) => idSet.has(id));

  if (words.length + sentences.length + grammar.length === 0) return null;

  const problemTypes = {
    words: words.length > 0 ? [...source.problemTypes.words] : [],
    sentences: sentences.length > 0 ? [...source.problemTypes.sentences] : [],
    grammar: grammar.length > 0 ? [...source.problemTypes.grammar] : [],
  };

  const unitDate = new Date().toLocaleDateString("ko-KR");

  return {
    grade: source.grade,
    textbook: source.textbook,
    unit: `${source.unit} · 오답`,
    assignedClassIds: [...source.assignedClassIds],
    items: { words, sentences, grammar },
    problemTypes,
    // 반 과제에서 바로 부여하는 복습 세트 — 목록에는 안 쌓음
    hiddenFromLibrary: true,
    customDraft: draft,
    // title은 createProblemSetTitle(grade·textbook·unit)로 생성됨
  };
}

function filterCustomDraft(
  draft: CustomAssignmentDraft,
  idSet: Set<string>,
): CustomAssignmentDraft {
  const analyses: CustomAssignmentDraft["analyses"] = {};
  const selectedIds: string[] = [];

  for (const [id, item] of Object.entries(draft.analyses)) {
    if (!idSet.has(id)) continue;
    analyses[id] = item;
    selectedIds.push(id);
  }

  const sentenceDrafts: CustomAssignmentDraft["sentenceDrafts"] = {};
  for (const [key, item] of Object.entries(draft.sentenceDrafts)) {
    const sid = `custom-s-${item.sentenceIndex}`;
    if (idSet.has(sid) || idSet.has(key) || idSet.has(String(item.sentenceIndex))) {
      sentenceDrafts[String(item.sentenceIndex)] = item;
    }
  }

  // 단어만 골랐을 때 예문용 문장 행도 유지하면 문장 유형이 과하게 늘어남 —
  // 문장 id가 선택된 경우만 sentenceDrafts에 남긴다.

  return {
    ...draft,
    selectedIds,
    analyses,
    sentenceDrafts,
  };
}

export function reissueProblemSetTitle(source: SavedProblemSet): string {
  const base = source.title.replace(/\s·\s오답.*$/, "").trim();
  return `${base} · 오답 복습`;
}
