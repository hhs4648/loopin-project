export type VocabEntry = {
  id: string;
  /** 단원 (하루 분량 묶음 번호, 저장 키는 unit 유지) */
  unit: string;
  /** 단어 (표제어) */
  word: string;
  /** 단어 뜻 */
  meaning: string;
  /** 예문 */
  example: string;
  /** 예문 뜻 */
  exampleMeaning: string;
};

export type VocabSet = {
  id: string;
  name: string;
  /** 선택 그룹명 — 비우면 표시하지 않음 */
  groupName?: string;
  /** 하루에 외울 단어수 — 시트 열이 아님. 단원 자동 번호용 메타 (기본 8) */
  wordsPerDay?: number;
  createdAt: string;
  updatedAt: string;
  entries: VocabEntry[];
};

export const DEFAULT_VOCAB_WORDS_PER_DAY = 8;

const LEGACY_STORAGE_KEY = "haksup-vocab-workbook";
const SETS_STORAGE_KEY = "haksup-vocab-sets";

function createId(prefix = "vocab"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function splitPasteLine(line: string): string[] {
  if (line.includes("\t")) {
    return line.split("\t").map((cell) => cell.trim());
  }
  if (line.includes(",")) {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  }
  return [line.trim()];
}

function looksLikeHeader(cells: string[]): boolean {
  const joined = cells.join(" ");
  return (
    cells[0]?.includes("단원") === true ||
    cells[0]?.includes("파트") === true ||
    joined.includes("한글뜻") ||
    joined.includes("단어 뜻") ||
    joined.includes("단어뜻") ||
    joined.includes("예문뜻") ||
    joined.includes("예문 뜻") ||
    (cells[1] === "한글" && cells[2]?.includes("뜻") === true) ||
    (cells[1] === "단어" && cells[2]?.includes("뜻") === true)
  );
}

/**
 * 엑셀 복붙 파싱 — 열 순서: 단원, 단어, 단어 뜻, 예문, 예문 뜻
 */
export function parseVocabPaste(raw: string): VocabEntry[] {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  const out: VocabEntry[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const cells = splitPasteLine(lines[i]!);
    if (cells.every((c) => !c)) continue;
    if (i === 0 && looksLikeHeader(cells)) continue;

    const unit = (cells[0] ?? "").trim();
    const word = (cells[1] ?? "").trim();
    const meaning = (cells[2] ?? "").trim();
    const example = (cells[3] ?? "").trim();
    const exampleMeaning = (cells[4] ?? "").trim();

    if (!word && !meaning) continue;

    out.push({
      id: createId("entry"),
      unit,
      word,
      meaning,
      example,
      exampleMeaning,
    });
  }

  return out;
}

export type VocabGridRow = {
  unit: string;
  word: string;
  meaning: string;
  example: string;
  exampleMeaning: string;
};

export const VOCAB_GRID_COLUMNS: {
  key: keyof VocabGridRow;
  label: string;
  /** table-fixed 기준 열 너비(px) */
  width: number;
}[] = [
  { key: "unit", label: "단원", width: 72 },
  { key: "word", label: "단어", width: 120 },
  { key: "meaning", label: "단어 뜻", width: 130 },
  { key: "example", label: "예문", width: 250 },
  { key: "exampleMeaning", label: "예문 뜻", width: 250 },
];

export function createEmptyVocabGridRow(): VocabGridRow {
  return {
    unit: "",
    word: "",
    meaning: "",
    example: "",
    exampleMeaning: "",
  };
}

export function createEmptyVocabGrid(rowCount = 10): VocabGridRow[] {
  return Array.from({ length: rowCount }, () => createEmptyVocabGridRow());
}

export function createEmptyVocabEntry(): VocabEntry {
  return {
    id: createId("entry"),
    unit: "",
    word: "",
    meaning: "",
    example: "",
    exampleMeaning: "",
  };
}

export function createEmptyVocabEntries(count = 10): VocabEntry[] {
  return Array.from({ length: count }, () => createEmptyVocabEntry());
}

/** 단어·단어 뜻이 모두 비어 있는 행 제거 */
export function compactVocabEntries(entries: VocabEntry[]): VocabEntry[] {
  return entries.filter((e) => e.word.trim() || e.meaning.trim());
}

/**
 * 채워진 단어 순서대로 단원 번호 부여.
 * wordsPerDay=8 → 1~8행 단원1, 9~16행 단원2 …
 */
export function applyVocabPartsByDay(
  entries: VocabEntry[],
  wordsPerDay: number,
): VocabEntry[] {
  const size = Math.floor(wordsPerDay);
  if (size < 1) return entries;
  let filledIndex = 0;
  return entries.map((entry) => {
    if (!entry.word.trim() && !entry.meaning.trim()) {
      return entry.unit === "" ? entry : { ...entry, unit: "" };
    }
    const part = Math.floor(filledIndex / size) + 1;
    filledIndex += 1;
    const label = String(part);
    return entry.unit === label ? entry : { ...entry, unit: label };
  });
}

export function normalizeWordsPerDay(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_VOCAB_WORDS_PER_DAY;
  return Math.min(500, Math.floor(n));
}

/** 엑셀형 시트 초기·확장 크기 */
export const VOCAB_SHEET_INITIAL = 100;
export const VOCAB_SHEET_CHUNK = 50;

function isBlankVocabEntry(entry: VocabEntry): boolean {
  return (
    !entry.unit.trim() &&
    !entry.word.trim() &&
    !entry.meaning.trim() &&
    !entry.example.trim() &&
    !entry.exampleMeaning.trim()
  );
}

/** 시트를 최소 행 수까지 빈 칸으로 채움 (입력 시 한 줄씩 늘리지 않음) */
export function padVocabSheet(
  entries: VocabEntry[],
  minRows = VOCAB_SHEET_INITIAL,
): VocabEntry[] {
  if (entries.length >= minRows) return entries;
  return [...entries, ...createEmptyVocabEntries(minRows - entries.length)];
}

/** 스크롤로 아래로 이어갈 때 빈 행 묶음 추가 */
export function expandVocabSheet(
  entries: VocabEntry[],
  by = VOCAB_SHEET_CHUNK,
): VocabEntry[] {
  return [...entries, ...createEmptyVocabEntries(by)];
}

/** @deprecated padVocabSheet 사용 */
export function withTrailingEmptyVocabRows(
  entries: VocabEntry[],
  trailing = 5,
  minTotal = 10,
): VocabEntry[] {
  return padVocabSheet(entries, Math.max(minTotal, entries.length + trailing));
}

/** @deprecated padVocabSheet 사용 */
export function ensureTrailingEmptyVocabRows(
  entries: VocabEntry[],
  minEmpty = 3,
): VocabEntry[] {
  let trailing = 0;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (!isBlankVocabEntry(entries[i]!)) break;
    trailing += 1;
  }
  if (trailing >= minEmpty) return entries;
  return [...entries, ...createEmptyVocabEntries(minEmpty - trailing)];
}

/** 그리드 행 → VocabEntry (단어 또는 단어 뜻이 있는 행만) */
export function entriesFromVocabGrid(rows: VocabGridRow[]): VocabEntry[] {
  const out: VocabEntry[] = [];
  for (const row of rows) {
    const unit = row.unit.trim();
    const word = row.word.trim();
    const meaning = row.meaning.trim();
    const example = row.example.trim();
    const exampleMeaning = row.exampleMeaning.trim();
    if (!word && !meaning) continue;
    out.push({
      id: createId("entry"),
      unit,
      word,
      meaning,
      example,
      exampleMeaning,
    });
  }
  return out;
}

function isVocabEntry(value: unknown): value is VocabEntry {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<VocabEntry>;
  return (
    typeof item.id === "string" &&
    typeof item.unit === "string" &&
    typeof item.word === "string" &&
    typeof item.meaning === "string" &&
    typeof item.example === "string" &&
    typeof item.exampleMeaning === "string"
  );
}

function isVocabSet(value: unknown): value is VocabSet {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<VocabSet>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.updatedAt === "string" &&
    Array.isArray(item.entries) &&
    item.entries.every(isVocabEntry)
  );
}

function normalizeVocabSet(set: VocabSet): VocabSet {
  return {
    ...set,
    wordsPerDay: normalizeWordsPerDay(set.wordsPerDay),
  };
}

function loadLegacyWorkbook(): VocabEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isVocabEntry);
  } catch {
    return [];
  }
}

/** @deprecated 세트 모델로 이전 — 마이그레이션용 */
export function loadVocabWorkbook(): VocabEntry[] {
  return loadLegacyWorkbook();
}

/** @deprecated */
export function saveVocabWorkbook(entries: VocabEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(entries));
}

export function createVocabSetId(): string {
  return createId("set");
}

export function createEmptyVocabSet(name = "새 단어장"): VocabSet {
  const now = new Date().toISOString();
  return {
    id: createVocabSetId(),
    name,
    wordsPerDay: DEFAULT_VOCAB_WORDS_PER_DAY,
    createdAt: now,
    updatedAt: now,
    entries: createEmptyVocabEntries(VOCAB_SHEET_INITIAL),
  };
}

export function loadVocabSets(): VocabSet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SETS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter(isVocabSet)
          .map(normalizeVocabSet)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      }
    }

    // 구버전 flat 목록 → 한 세트로 이전
    const legacy = loadLegacyWorkbook();
    if (legacy.length === 0) return [];
    const now = new Date().toISOString();
    const migrated: VocabSet = {
      id: createVocabSetId(),
      name: "가져온 단어장",
      wordsPerDay: DEFAULT_VOCAB_WORDS_PER_DAY,
      createdAt: now,
      updatedAt: now,
      entries: legacy,
    };
    saveVocabSets([normalizeVocabSet(migrated)]);
    try {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return [normalizeVocabSet(migrated)];
  } catch {
    return [];
  }
}

export function saveVocabSets(sets: VocabSet[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETS_STORAGE_KEY, JSON.stringify(sets));
  window.dispatchEvent(new Event("haksup-vocab-sets-changed"));
}

export function upsertVocabSet(sets: VocabSet[], next: VocabSet): VocabSet[] {
  const wordsPerDay = normalizeWordsPerDay(next.wordsPerDay);
  const groupName = next.groupName?.trim();
  const updated: VocabSet = {
    ...next,
    name: next.name.trim() || "이름 없는 단어장",
    groupName: groupName || undefined,
    wordsPerDay,
    entries: applyVocabPartsByDay(next.entries, wordsPerDay),
    updatedAt: new Date().toISOString(),
  };
  const idx = sets.findIndex((item) => item.id === updated.id);
  const list =
    idx >= 0
      ? sets.map((item, i) => (i === idx ? updated : item))
      : [updated, ...sets];
  const sorted = [...list].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  saveVocabSets(sorted);
  return sorted;
}

export function removeVocabSets(sets: VocabSet[], ids: string[]): VocabSet[] {
  const drop = new Set(ids);
  const next = sets.filter((item) => !drop.has(item.id));
  saveVocabSets(next);
  return next;
}

export function vocabSetWordCount(set: VocabSet): number {
  return set.entries.filter((e) => e.word.trim() || e.meaning.trim()).length;
}

export function formatVocabDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

export function listVocabUnits(entries: VocabEntry[]): string[] {
  const seen = new Set<string>();
  const units: string[] = [];
  for (const entry of entries) {
    const unit = entry.unit.trim() || "단원 없음";
    if (seen.has(unit)) continue;
    seen.add(unit);
    units.push(unit);
  }
  return units;
}

export function filterVocabByUnit(
  entries: VocabEntry[],
  unit: string | "all",
): VocabEntry[] {
  if (unit === "all") return entries;
  return entries.filter(
    (entry) => (entry.unit.trim() || "단원 없음") === unit,
  );
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

export type VocabQuizItem = {
  id: string;
  prompt: string;
  answer: string;
  options: string[];
};

/** 단어 → 단어 뜻 3지선다 */
export function buildMeaningQuizzes(entries: VocabEntry[]): VocabQuizItem[] {
  const usable = entries.filter((e) => e.word.trim() && e.meaning.trim());
  if (usable.length === 0) return [];

  return usable.map((entry) => {
    const distractors = shuffle(
      usable.filter((e) => e.id !== entry.id).map((e) => e.meaning),
    ).slice(0, 2);
    while (distractors.length < 2) {
      distractors.push(`(보기 ${distractors.length + 1})`);
    }
    return {
      id: entry.id,
      prompt: entry.word,
      answer: entry.meaning,
      options: shuffle([entry.meaning, ...distractors]),
    };
  });
}

/** 단어 뜻 → 단어 3지선다 */
export function buildWordQuizzes(entries: VocabEntry[]): VocabQuizItem[] {
  const usable = entries.filter((e) => e.word.trim() && e.meaning.trim());
  if (usable.length === 0) return [];

  return usable.map((entry) => {
    const distractors = shuffle(
      usable.filter((e) => e.id !== entry.id).map((e) => e.word),
    ).slice(0, 2);
    while (distractors.length < 2) {
      distractors.push(`(보기 ${distractors.length + 1})`);
    }
    return {
      id: entry.id,
      prompt: entry.meaning,
      answer: entry.word,
      options: shuffle([entry.word, ...distractors]),
    };
  });
}

export type VocabMatchPair = {
  id: string;
  left: string;
  right: string;
};

export function buildMatchPairs(entries: VocabEntry[]): VocabMatchPair[] {
  return entries
    .filter((e) => e.word.trim() && e.meaning.trim())
    .map((e) => ({
      id: e.id,
      left: e.word,
      right: e.meaning,
    }));
}

export { shuffle as shuffleVocabItems };
