import type {
  AnalyzeWordRequest,
  AnalyzeWordResult,
  GeneratedCustomProblem,
  CustomProblemTypeId,
  PartOfSpeech,
  SentenceAnalysis,
  WordAnalysis,
} from "@/lib/ai/sentence-problem-types";
import { CUSTOM_PROBLEM_TYPE_OPTIONS } from "@/lib/ai/sentence-problem-types";
import {
  formatChunkLine,
  looksLikeAdjective,
  splitEnglishChunksPhrase,
  splitKoreanChunksPhrase,
} from "@/lib/ai/phrase-chunks";
import {
  resolveWordMeaningPipeline,
  toKoreanAttributive,
} from "@/lib/ai/resolve-word-meaning";
import { clearTranslateCache } from "@/lib/ai/translate-en-ko";
import { clearWiktionaryGlossCache } from "@/lib/ai/wiktionary-ko-glosses";

/**
 * 문장·단어 분석 서비스.
 * 문장 뜻은 사용자 입력.
 * 단어 뜻: Wiktionary 한국어 gloss → 문장 뜻 매칭 → (없으면) 핵심 뜻 → 교사가 표에서 수정.
 */

const analysisCache = new Map<string, WordAnalysis>();

function cacheKey(req: AnalyzeWordRequest): string {
  return [
    "v9-adjective-form",
    req.sentence.trim().toLowerCase(),
    req.surface.trim().toLowerCase(),
    String(req.wordIndex),
    (req.translationKo ?? "").trim(),
  ].join("||");
}

/** 흔한 단어 목업 사전 — 없으면 휴리스틱 */
const MOCK_LEXICON: Record<
  string,
  { lemma: string; meaningKo: string; pos: PartOfSpeech }
> = {
  i: { lemma: "I", meaningKo: "나", pos: "pronoun" },
  you: { lemma: "you", meaningKo: "너, 당신", pos: "pronoun" },
  he: { lemma: "he", meaningKo: "그", pos: "pronoun" },
  she: { lemma: "she", meaningKo: "그녀", pos: "pronoun" },
  we: { lemma: "we", meaningKo: "우리", pos: "pronoun" },
  they: { lemma: "they", meaningKo: "그들", pos: "pronoun" },
  the: { lemma: "the", meaningKo: "(정관사)", pos: "determiner" },
  a: { lemma: "a", meaningKo: "(부정관사)", pos: "determiner" },
  an: { lemma: "an", meaningKo: "(부정관사)", pos: "determiner" },
  is: { lemma: "be", meaningKo: "~이다", pos: "verb" },
  are: { lemma: "be", meaningKo: "~이다", pos: "verb" },
  was: { lemma: "be", meaningKo: "~였다", pos: "verb" },
  were: { lemma: "be", meaningKo: "~였다", pos: "verb" },
  be: { lemma: "be", meaningKo: "~이다, ~되다", pos: "verb" },
  have: { lemma: "have", meaningKo: "가지다", pos: "verb" },
  has: { lemma: "have", meaningKo: "가지다", pos: "verb" },
  had: { lemma: "have", meaningKo: "가졌다", pos: "verb" },
  do: { lemma: "do", meaningKo: "하다", pos: "verb" },
  does: { lemma: "do", meaningKo: "하다", pos: "verb" },
  did: { lemma: "do", meaningKo: "했다", pos: "verb" },
  go: { lemma: "go", meaningKo: "가다", pos: "verb" },
  goes: { lemma: "go", meaningKo: "가다", pos: "verb" },
  went: { lemma: "go", meaningKo: "갔다", pos: "verb" },
  make: { lemma: "make", meaningKo: "만들다", pos: "verb" },
  makes: { lemma: "make", meaningKo: "만들다", pos: "verb" },
  made: { lemma: "make", meaningKo: "만들었다", pos: "verb" },
  know: { lemma: "know", meaningKo: "알다", pos: "verb" },
  knows: { lemma: "know", meaningKo: "알다", pos: "verb" },
  knew: { lemma: "know", meaningKo: "알았다", pos: "verb" },
  related: { lemma: "relate", meaningKo: "관련되다", pos: "adjective" },
  drawing: { lemma: "drawing", meaningKo: "그림", pos: "noun" },
  kind: { lemma: "kind", meaningKo: "친절한; 종류", pos: "adjective" },
  raise: { lemma: "raise", meaningKo: "기르다; 올리다", pos: "verb" },
  personality: { lemma: "personality", meaningKo: "성격", pos: "noun" },
  student: { lemma: "student", meaningKo: "학생", pos: "noun" },
  teacher: { lemma: "teacher", meaningKo: "선생님", pos: "noun" },
  school: { lemma: "school", meaningKo: "학교", pos: "noun" },
  book: { lemma: "book", meaningKo: "책", pos: "noun" },
  time: { lemma: "time", meaningKo: "시간", pos: "noun" },
  people: { lemma: "people", meaningKo: "사람들", pos: "noun" },
  important: { lemma: "important", meaningKo: "중요한", pos: "adjective" },
  different: { lemma: "different", meaningKo: "다른", pos: "adjective" },
  because: { lemma: "because", meaningKo: "~때문에", pos: "conjunction" },
  and: { lemma: "and", meaningKo: "그리고", pos: "conjunction" },
  but: { lemma: "but", meaningKo: "그러나", pos: "conjunction" },
  in: { lemma: "in", meaningKo: "~안에", pos: "preposition" },
  on: { lemma: "on", meaningKo: "~위에", pos: "preposition" },
  at: { lemma: "at", meaningKo: "~에", pos: "preposition" },
  to: { lemma: "to", meaningKo: "~로; ~에게", pos: "preposition" },
  for: { lemma: "for", meaningKo: "~을 위해", pos: "preposition" },
  with: { lemma: "with", meaningKo: "~와 함께", pos: "preposition" },
  from: { lemma: "from", meaningKo: "~로부터", pos: "preposition" },
  about: { lemma: "about", meaningKo: "~에 대해", pos: "preposition" },
  that: { lemma: "that", meaningKo: "그것; ~라는 것", pos: "pronoun" },
  this: { lemma: "this", meaningKo: "이것", pos: "pronoun" },
  what: { lemma: "what", meaningKo: "무엇", pos: "pronoun" },
  when: { lemma: "when", meaningKo: "언제; ~할 때", pos: "adverb" },
  where: { lemma: "where", meaningKo: "어디; ~하는 곳", pos: "adverb" },
  how: { lemma: "how", meaningKo: "어떻게", pos: "adverb" },
  very: { lemma: "very", meaningKo: "매우", pos: "adverb" },
  also: { lemma: "also", meaningKo: "또한", pos: "adverb" },
  not: { lemma: "not", meaningKo: "~않다", pos: "adverb" },
  can: { lemma: "can", meaningKo: "~할 수 있다", pos: "verb" },
  will: { lemma: "will", meaningKo: "~할 것이다", pos: "verb" },
  would: { lemma: "would", meaningKo: "~할 것이다(가정)", pos: "verb" },
  should: { lemma: "should", meaningKo: "~해야 한다", pos: "verb" },
  // 샘플 지문 단어
  woke: { lemma: "wake", meaningKo: "일어나다", pos: "verb" },
  early: { lemma: "early", meaningKo: "일찍", pos: "adverb" },
  math: { lemma: "math", meaningKo: "수학", pos: "noun" },
  test: { lemma: "test", meaningKo: "시험", pos: "noun" },
  today: { lemma: "today", meaningKo: "오늘", pos: "adverb" },
  although: { lemma: "although", meaningKo: "비록", pos: "conjunction" },
  little: { lemma: "little", meaningKo: "조금", pos: "adverb" },
  nervous: { lemma: "nervous", meaningKo: "긴장한", pos: "adjective" },
  best: { lemma: "best", meaningKo: "최선을", pos: "adverb" },
  during: { lemma: "during", meaningKo: "~동안", pos: "preposition" },
  exam: { lemma: "exam", meaningKo: "시험", pos: "noun" },
  after: { lemma: "after", meaningKo: "~후에", pos: "preposition" },
  met: { lemma: "meet", meaningKo: "만나다", pos: "verb" },
  friend: { lemma: "friend", meaningKo: "친구", pos: "noun" },
  library: { lemma: "library", meaningKo: "도서관", pos: "noun" },
  talked: { lemma: "talk", meaningKo: "이야기하다", pos: "verb" },
  future: { lemma: "future", meaningKo: "미래", pos: "noun" },
  dreams: { lemma: "dream", meaningKo: "꿈", pos: "noun" },
  studied: { lemma: "study", meaningKo: "공부하다", pos: "verb" },
  english: { lemma: "English", meaningKo: "영어", pos: "noun" },
  together: { lemma: "together", meaningKo: "함께", pos: "adverb" },
  want: { lemma: "want", meaningKo: "원하다", pos: "verb" },
  improve: { lemma: "improve", meaningKo: "향상시키다", pos: "verb" },
  speaking: { lemma: "speaking", meaningKo: "말하기", pos: "noun" },
  skills: { lemma: "skill", meaningKo: "실력", pos: "noun" },
  before: { lemma: "before", meaningKo: "~전에", pos: "preposition" },
  going: { lemma: "go", meaningKo: "가다", pos: "verb" },
  home: { lemma: "home", meaningKo: "집", pos: "noun" },
  promised: { lemma: "promise", meaningKo: "약속하다", pos: "verb" },
  work: { lemma: "work", meaningKo: "노력하다", pos: "verb" },
  hard: { lemma: "hard", meaningKo: "열심히", pos: "adverb" },
  help: { lemma: "help", meaningKo: "돕다", pos: "verb" },
  each: { lemma: "each", meaningKo: "서로", pos: "determiner" },
  other: { lemma: "other", meaningKo: "다른", pos: "adjective" },
  whenever: { lemma: "whenever", meaningKo: "~할 때마다", pos: "conjunction" },
  need: { lemma: "need", meaningKo: "필요하다", pos: "verb" },
  support: { lemma: "support", meaningKo: "도움", pos: "noun" },
  // 복합 대명사·부사 (-thing/-one/-body/-where) — -ing 어간 규칙에 걸리면 everyth 등으로 깨짐
  everything: { lemma: "everything", meaningKo: "모든 것", pos: "pronoun" },
  something: { lemma: "something", meaningKo: "무언가", pos: "pronoun" },
  anything: { lemma: "anything", meaningKo: "무엇이든", pos: "pronoun" },
  nothing: { lemma: "nothing", meaningKo: "아무것도", pos: "pronoun" },
  everyone: { lemma: "everyone", meaningKo: "모두", pos: "pronoun" },
  someone: { lemma: "someone", meaningKo: "누군가", pos: "pronoun" },
  anyone: { lemma: "anyone", meaningKo: "누구든", pos: "pronoun" },
  noone: { lemma: "no one", meaningKo: "아무도", pos: "pronoun" },
  everybody: { lemma: "everybody", meaningKo: "모두", pos: "pronoun" },
  somebody: { lemma: "somebody", meaningKo: "누군가", pos: "pronoun" },
  anybody: { lemma: "anybody", meaningKo: "누구든", pos: "pronoun" },
  nobody: { lemma: "nobody", meaningKo: "아무도", pos: "pronoun" },
  everywhere: { lemma: "everywhere", meaningKo: "어디에나", pos: "adverb" },
  somewhere: { lemma: "somewhere", meaningKo: "어딘가", pos: "adverb" },
  anywhere: { lemma: "anywhere", meaningKo: "어디에든", pos: "adverb" },
  nowhere: { lemma: "nowhere", meaningKo: "어디에도", pos: "adverb" },
};

/**
 * every/some/any/no + thing|one|body|where 닫힌 부류.
 * `everything`이 -ing 제거로 `everyth`가 되는 것을 막는다.
 */
const CLOSED_CLASS_COMPOUNDS = new Set([
  "everything",
  "something",
  "anything",
  "nothing",
  "everyone",
  "someone",
  "anyone",
  "noone",
  "no-one",
  "everybody",
  "somebody",
  "anybody",
  "nobody",
  "everywhere",
  "somewhere",
  "anywhere",
  "nowhere",
]);

function closedClassLemma(lower: string): string | null {
  if (!CLOSED_CLASS_COMPOUNDS.has(lower)) return null;
  if (lower === "noone" || lower === "no-one") return "no one";
  return lower;
}

function guessPos(surface: string): PartOfSpeech {
  const lower = surface.toLowerCase();
  if (CLOSED_CLASS_COMPOUNDS.has(lower)) {
    return /(?:where)$/.test(lower) ? "adverb" : "pronoun";
  }
  if (lower.endsWith("ly") && lower.length > 3) return "adverb";
  if (lower.endsWith("ing") || lower.endsWith("ed")) return "verb";
  if (lower.endsWith("tion") || lower.endsWith("ness") || lower.endsWith("ment"))
    return "noun";
  if (lower.endsWith("ful") || lower.endsWith("ous") || lower.endsWith("ive"))
    return "adjective";
  return "other";
}

/** 불규칙·활용형 → 동사원형 (사전 없을 때) */
const IRREGULAR_LEMMAS: Record<string, string> = {
  woke: "wake",
  woken: "wake",
  wakes: "wake",
  waking: "wake",
  met: "meet",
  meeting: "meet",
  meets: "meet",
  went: "go",
  gone: "go",
  going: "go",
  goes: "go",
  was: "be",
  were: "be",
  been: "be",
  being: "be",
  is: "be",
  are: "be",
  am: "be",
  had: "have",
  has: "have",
  having: "have",
  did: "do",
  does: "do",
  done: "do",
  doing: "do",
  made: "make",
  makes: "make",
  making: "make",
  knew: "know",
  known: "know",
  knows: "know",
  knowing: "know",
  took: "take",
  taken: "take",
  takes: "take",
  taking: "take",
  came: "come",
  comes: "come",
  coming: "come",
  saw: "see",
  seen: "see",
  sees: "see",
  seeing: "see",
  got: "get",
  gotten: "get",
  gets: "get",
  getting: "get",
  gave: "give",
  given: "give",
  gives: "give",
  giving: "give",
  found: "find",
  finds: "find",
  finding: "find",
  thought: "think",
  thinks: "think",
  thinking: "think",
  told: "tell",
  tells: "tell",
  telling: "tell",
  became: "become",
  becomes: "become",
  becoming: "become",
  began: "begin",
  begun: "begin",
  begins: "begin",
  beginning: "begin",
  brought: "bring",
  brings: "bring",
  bringing: "bring",
  built: "build",
  builds: "build",
  building: "build",
  bought: "buy",
  buys: "buy",
  buying: "buy",
  caught: "catch",
  catches: "catch",
  catching: "catch",
  chose: "choose",
  chosen: "choose",
  chooses: "choose",
  choosing: "choose",
  felt: "feel",
  feels: "feel",
  feeling: "feel",
  kept: "keep",
  keeps: "keep",
  keeping: "keep",
  left: "leave",
  leaves: "leave",
  leaving: "leave",
  lost: "lose",
  loses: "lose",
  losing: "lose",
  meant: "mean",
  means: "mean",
  meaning: "mean",
  ran: "run",
  runs: "run",
  running: "run",
  said: "say",
  says: "say",
  saying: "say",
  sat: "sit",
  sits: "sit",
  sitting: "sit",
  spoke: "speak",
  spoken: "speak",
  speaks: "speak",
  speaking: "speak",
  stood: "stand",
  stands: "stand",
  standing: "stand",
  taught: "teach",
  teaches: "teach",
  teaching: "teach",
  understood: "understand",
  understands: "understand",
  understanding: "understand",
  wrote: "write",
  written: "write",
  writes: "write",
  writing: "write",
  promised: "promise",
  promises: "promise",
  promising: "promise",
  studied: "study",
  studies: "study",
  studying: "study",
  talked: "talk",
  talks: "talk",
  talking: "talk",
  improved: "improve",
  improves: "improve",
  improving: "improve",
  dreamed: "dream",
  dreamt: "dream",
  dreams: "dream",
  dreaming: "dream",
  skills: "skill",
  // 아래 동사들은 과거형이 `-ed`로 끝나지 않아 규칙으로는 원형이 안 나온다
  // (`held`는 `ld`로 끝나 어떤 접미사 규칙에도 안 걸려 그대로 남았다)
  held: "hold",
  holds: "hold",
  holding: "hold",
  heard: "hear",
  hears: "hear",
  hearing: "hear",
  sold: "sell",
  sells: "sell",
  selling: "sell",
  sent: "send",
  sends: "send",
  sending: "send",
  spent: "spend",
  spends: "spend",
  spending: "spend",
  slept: "sleep",
  sleeps: "sleep",
  sleeping: "sleep",
  fed: "feed",
  feeds: "feed",
  feeding: "feed",
  led: "lead",
  leads: "lead",
  leading: "lead",
  rode: "ride",
  ridden: "ride",
  rides: "ride",
  riding: "ride",
  drove: "drive",
  driven: "drive",
  drives: "drive",
  driving: "drive",
  broke: "break",
  broken: "break",
  breaks: "break",
  breaking: "break",
  drew: "draw",
  drawn: "draw",
  draws: "draw",
  fell: "fall",
  fallen: "fall",
  falls: "fall",
  falling: "fall",
  flew: "fly",
  flown: "fly",
  flies: "fly",
  flying: "fly",
  forgot: "forget",
  forgotten: "forget",
  forgets: "forget",
  forgetting: "forget",
  froze: "freeze",
  frozen: "freeze",
  freezes: "freeze",
  freezing: "freeze",
  grew: "grow",
  grown: "grow",
  grows: "grow",
  growing: "grow",
  hid: "hide",
  hidden: "hide",
  hides: "hide",
  hiding: "hide",
  sang: "sing",
  sung: "sing",
  sings: "sing",
  singing: "sing",
  swam: "swim",
  swum: "swim",
  swims: "swim",
  swimming: "swim",
  threw: "throw",
  thrown: "throw",
  throws: "throw",
  throwing: "throw",
  wore: "wear",
  worn: "wear",
  wears: "wear",
  wearing: "wear",
  won: "win",
  wins: "win",
  winning: "win",
  drank: "drink",
  drunk: "drink",
  drinks: "drink",
  drinking: "drink",
  ate: "eat",
  eaten: "eat",
  eats: "eat",
  eating: "eat",
  fought: "fight",
  fights: "fight",
  fighting: "fight",
  paid: "pay",
  pays: "pay",
  paying: "pay",
  stole: "steal",
  stolen: "steal",
  steals: "steal",
  stealing: "steal",
  dealt: "deal",
  deals: "deal",
  dealing: "deal",
  shown: "show",
  showed: "show",
  shows: "show",
  showing: "show",
  rose: "rise",
  risen: "rise",
  rises: "rise",
  rising: "rise",
  // FLOSS 규칙의 예외 — 원형이 이미 `dd`로 끝나 겹침 제거 규칙에 걸린다
  added: "add",
  adds: "add",
  adding: "add",
};

/**
 * `-s`로 끝나지만 복수·3인칭이 **아닌** 어미.
 * 이게 없으면 `various → variou`, `famous → famou` 처럼 멀쩡한 단어가 깎인다.
 */
const NON_PLURAL_S_ENDING = /(?:ous|ss|us|is|as|ics|sis)$/;

/**
 * `-ed`를 뗀 어간에 묵음 e를 되돌린다 — `liked → lik` 이 아니라 `like` 가 되도록.
 *
 * 어간만 보고는 원형이 `e`로 끝났는지 알 수 없어(`looked→look` vs `liked→like`)
 * 확실한 단서가 있을 때만 붙인다:
 *   · 영어 단어는 `v`로 끝나지 않는다 → `mov` 는 반드시 `move`
 *   · `c`/`z`, 그리고 `ss`가 아닌 `s` → dance, raise, use
 *   · 자음+모음+자음 3글자 → lik(e), hop(e), nam(e). `ask`·`look`은 형태가 달라 안 걸린다
 * `g`는 뺐다 — `chang(e)`와 `belong`이 같은 꼴이라 한쪽이 반드시 틀린다.
 */
function restoreSilentE(stem: string): string {
  if (stem.length < 2) return stem;
  if (/[vcz]$/.test(stem)) return `${stem}e`;
  // 모음 + s → raise·use·close. `ss`는 앞 글자가 자음이라 자동으로 빠진다 (pass, miss)
  if (/[aeiou]s$/.test(stem)) return `${stem}e`;
  if (/^[^aeiou][aeiou][^aeiouwxy]$/.test(stem)) return `${stem}e`;
  return stem;
}

/** 문장 속 활용형 → 동사·명사 원형 */
export function toLemma(surface: string): string {
  const lower = surface.trim().toLowerCase();
  if (!lower) return surface;
  const hit = MOCK_LEXICON[lower];
  if (hit?.lemma) return hit.lemma;
  const closed = closedClassLemma(lower);
  if (closed) return closed;
  if (IRREGULAR_LEMMAS[lower]) return IRREGULAR_LEMMAS[lower]!;

  if (lower.endsWith("ies") && lower.length > 4) return `${lower.slice(0, -3)}y`;
  if (lower.endsWith("ied") && lower.length > 4) return `${lower.slice(0, -3)}y`;
  if (lower.endsWith("ying") && lower.length > 5)
    return `${lower.slice(0, -4)}ie`;
  // stopped → stop, planned → plan
  // f·l·s·z 는 영어 단어 끝에서 원래 겹친다(FLOSS 규칙) — `pass`·`fill` 은 그 자체가
  // 원형이라 겹침을 풀면 `pas`·`fil` 이 된다. 실제로 겹쳐 쓰는 자음만 대상으로 한다.
  if (/([bcdgkmnprt])\1(?:ed|ing)$/.test(lower) && lower.length > 5) {
    return lower.replace(/([bcdgkmnprt])\1(?:ed|ing)$/, "$1");
  }
  if (lower.endsWith("ing") && lower.length > 5) {
    const stem = lower.slice(0, -3);
    if (stem.endsWith("e")) return stem;
    if (stem.length <= 4 && /[^aeiou][^aeiou]$/.test(stem)) return `${stem}e`;
    return stem;
  }
  if (lower.endsWith("es") && lower.length > 3) {
    if (/[sxz]$/.test(lower.slice(0, -2)) || /[cs]h$/.test(lower.slice(0, -2)))
      return lower.slice(0, -2);
    if (lower.endsWith("ves")) return `${lower.slice(0, -3)}f`;
  }
  if (lower.endsWith("ed") && lower.length > 3) {
    const stem = lower.slice(0, -2);
    if (stem.endsWith("i")) return `${stem.slice(0, -1)}y`;
    return restoreSilentE(stem);
  }
  if (
    lower.endsWith("s") &&
    lower.length > 3 &&
    !NON_PLURAL_S_ENDING.test(lower)
  )
    return lower.slice(0, -1);
  return lower;
}

function guessLemma(surface: string): string {
  return toLemma(surface);
}

/** 문장유형 행 — 영문·해석·구나 단위 청크 자동 생성 */
export function buildSentenceAnalysis(params: {
  sentenceIndex: number;
  english: string;
  translationKo: string;
  wordMeanings?: string[];
  /** 쪼개면 안 되는 숙어(여러 단어짜리 어휘). 단원 어휘가 있으면 넘긴다. */
  idioms?: string[];
}): SentenceAnalysis {
  const english = params.english.trim();
  const translationKo = params.translationKo.trim();
  const chunksEn = formatChunkLine(
    splitEnglishChunksPhrase(english, params.idioms ?? []),
  );
  const hasHangul = /[\uac00-\ud7a3]/.test(translationKo);
  const chunksKo = hasHangul
    ? formatChunkLine(splitKoreanChunksPhrase(translationKo))
    : params.wordMeanings && params.wordMeanings.length >= 2
      ? formatChunkLine(params.wordMeanings)
      : formatChunkLine(splitKoreanChunksPhrase(translationKo));

  return {
    sentenceIndex: params.sentenceIndex,
    english,
    translationKo,
    chunksEn,
    chunksKo,
  };
}

async function buildWordAnalysis(req: AnalyzeWordRequest): Promise<WordAnalysis> {
  const key = req.surface.toLowerCase();
  const surfaceHit = MOCK_LEXICON[key];
  const lemma = surfaceHit?.lemma ?? guessLemma(req.surface);
  const hit = surfaceHit ?? MOCK_LEXICON[lemma.toLowerCase()];
  const translationKo = (req.translationKo ?? "").trim();
  const resolved = await resolveWordMeaningPipeline({
    surface: req.surface,
    lemma,
    sentence: req.sentence,
    translationKo,
    lexiconMeaning: hit?.meaningKo,
  });
  const guessed = guessPos(req.surface);
  const pos = hit?.pos ?? guessed;

  /**
   * 교과서 단어장은 형용사를 관형형으로 싣는다(`various 다양한`, `heavy 무거운`).
   * 사전은 기본형(`다양하다`)을 주므로 형용사일 때만 바꿔 준다.
   *
   * 품사 판단은 어휘 사전(`hit.pos`)을 최우선으로 보고, 없으면 청크 엔진의
   * 형용사 판별을 쓴다 — `guessPos`는 `heavy`·`light`를 놓친다.
   * 다만 활용형(`-ed`/`-ing`)이면 동사로 보고 건드리지 않는다.
   */
  const isAdjective = hit?.pos
    ? hit.pos === "adjective"
    : guessed !== "verb" && looksLikeAdjective(req.surface);
  const shape = (meaning: string) =>
    isAdjective ? toKoreanAttributive(meaning) : meaning;

  return {
    id: `${req.sentenceIndex}:${req.wordIndex}`,
    sentenceIndex: req.sentenceIndex,
    wordIndex: req.wordIndex,
    surface: req.surface,
    lemma: hit?.lemma ?? lemma,
    meaningKo: shape(resolved.meaningKo),
    pos,
    needsReview: resolved.needsReview,
    candidates: resolved.candidates.map(shape),
    sourceSentence: req.sentence,
    translationKo,
  };
}

/**
 * 단어 분석 — Wiktionary/사전/번역 파이프라인.
 * `forceFail`은 실패 UI 점검용.
 */
async function fetchAnalyzeFromApi(
  req: AnalyzeWordRequest,
  opts?: { forceFail?: boolean },
): Promise<WordAnalysis> {
  if (opts?.forceFail) {
    throw new Error("AI 분석에 실패했어요. 잠시 후 다시 시도해 주세요.");
  }
  return buildWordAnalysis(req);
}

/** 캐시를 먼저 보고, 없으면 AI(목업) 호출 */
export async function analyzeSelectedWord(
  req: AnalyzeWordRequest,
  opts?: { forceRefresh?: boolean; forceFail?: boolean },
): Promise<AnalyzeWordResult> {
  const key = cacheKey(req);
  if (!opts?.forceRefresh && !opts?.forceFail) {
    const cached = analysisCache.get(key);
    if (cached) {
      return {
        ok: true,
        data: {
          ...cached,
          id: `${req.sentenceIndex}:${req.wordIndex}`,
          sentenceIndex: req.sentenceIndex,
          wordIndex: req.wordIndex,
        },
      };
    }
  }

  try {
    const data = await fetchAnalyzeFromApi(req, {
      forceFail: opts?.forceFail,
    });
    analysisCache.set(key, data);
    return { ok: true, data };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI 분석에 실패했어요. 다시 시도해 주세요.";
    return { ok: false, message };
  }
}

/** 테스트·디버그용 캐시 비우기 */
export function clearSentenceAnalysisCache(): void {
  analysisCache.clear();
  clearWiktionaryGlossCache();
  clearTranslateCache();
}

export function buildProblemsFromSelection(params: {
  words: WordAnalysis[];
  sentences: SentenceAnalysis[];
  typeIds: CustomProblemTypeId[];
}): GeneratedCustomProblem[] {
  const out: GeneratedCustomProblem[] = [];
  let n = 0;

  const wordTypes = params.typeIds.filter((id) =>
    CUSTOM_PROBLEM_TYPE_OPTIONS.some(
      (t) => t.id === id && t.category === "word",
    ),
  );
  const sentenceTypes = params.typeIds.filter((id) =>
    CUSTOM_PROBLEM_TYPE_OPTIONS.some(
      (t) => t.id === id && t.category === "sentence",
    ),
  );

  for (const word of params.words) {
    for (const typeId of wordTypes) {
      const meta = CUSTOM_PROBLEM_TYPE_OPTIONS.find((t) => t.id === typeId);
      if (!meta) continue;
      n += 1;
      out.push(makeWordProblem(word, typeId, meta.label, n));
    }
  }

  for (const sentence of params.sentences) {
    for (const typeId of sentenceTypes) {
      const meta = CUSTOM_PROBLEM_TYPE_OPTIONS.find((t) => t.id === typeId);
      if (!meta) continue;
      n += 1;
      out.push(makeSentenceProblem(sentence, typeId, meta.label, n));
    }
  }

  return out;
}

/** @deprecated buildProblemsFromSelection 사용 */
export function buildProblemsFromWords(
  words: WordAnalysis[],
  typeIds: CustomProblemTypeId[],
): GeneratedCustomProblem[] {
  return buildProblemsFromSelection({
    words,
    sentences: [],
    typeIds,
  });
}

function makeWordProblem(
  word: WordAnalysis,
  type: CustomProblemTypeId,
  typeLabel: string,
  n: number,
): GeneratedCustomProblem {
  const id = `custom-q-${n}-${word.id}-${type}`;
  const cite = word.lemma.trim() || word.surface;
  const base = {
    id,
    type,
    typeLabel,
    category: "word" as const,
    relatedWordId: word.id,
  };

  if (type === "match" || type === "listen") {
    return {
      ...base,
      prompt:
        type === "listen"
          ? `발음을 듣고 「${cite}」의 뜻과 짝 맞추세요.`
          : `「${cite}」와 알맞은 뜻을 짝 맞추세요.`,
      options: [word.meaningKo],
      answer: `${cite} → ${word.meaningKo}`,
    };
  }

  if (type === "choice") {
    const distractors = ["관련되다", "기르다", "성격", "그림", "친절한"].filter(
      (d) => d !== word.meaningKo,
    );
    const options = shuffleStable(
      [word.meaningKo, ...distractors.slice(0, 2)],
      id,
    );
    return {
      ...base,
      prompt: `다음 단어의 뜻으로 알맞은 것을 고르세요.\n${cite}`,
      options,
      answer: word.meaningKo,
    };
  }

  // spell — 예문 빈칸 (문장에 나온 형태 그대로)
  const blanked = word.sourceSentence.replace(
    new RegExp(`\\b${escapeRegExp(word.surface)}\\b`),
    "________",
  );
  return {
    ...base,
    prompt: `빈칸에 알맞은 단어를 쓰세요.\n${blanked}`,
    answer: word.surface,
  };
}

function makeSentenceProblem(
  sentence: SentenceAnalysis,
  type: CustomProblemTypeId,
  typeLabel: string,
  n: number,
): GeneratedCustomProblem {
  const id = `custom-q-${n}-s${sentence.sentenceIndex}-${type}`;
  const base = {
    id,
    type,
    typeLabel,
    category: "sentence" as const,
    relatedSentenceIndex: sentence.sentenceIndex,
  };

  if (type === "chunk") {
    const parts = sentence.chunksEn
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      ...base,
      prompt: `청크를 알맞은 순서로 배열하세요.`,
      options: shuffleStable(parts, id),
      answer: sentence.chunksEn,
    };
  }

  if (type === "translate") {
    const parts = sentence.chunksKo
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      ...base,
      prompt: `한글 뜻 청크를 알맞은 순서로 배열하세요.\n(원문: ${sentence.english})`,
      options: shuffleStable(parts, id),
      answer: sentence.chunksKo,
    };
  }

  // write — 영작
  return {
    ...base,
    prompt: `다음 뜻을 영어로 쓰세요.\n${sentence.translationKo}`,
    answer: sentence.english,
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shuffleStable<T>(items: T[], seed: string): T[] {
  const arr = [...items];
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    h = (h * 1664525 + 1013904223) | 0;
    const j = Math.abs(h) % (i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
