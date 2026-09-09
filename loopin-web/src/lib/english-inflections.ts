/**
 * 중등 영어 표제어 → 예문에 나올 수 있는 표면형.
 * `hold` / `held`처럼 철자가 달라도 같은 단어로 본다.
 * `big` / `biggest`처럼 비교급·최상급도 본다.
 */

/** 불규칙 과거·과거분사·특수단수 → 기본형 */
const IRREGULAR_TO_BASE: Record<string, string> = {
  am: "be",
  is: "be",
  are: "be",
  was: "be",
  were: "be",
  been: "be",
  being: "be",
  has: "have",
  had: "have",
  having: "have",
  does: "do",
  did: "do",
  done: "do",
  doing: "do",
  goes: "go",
  went: "go",
  gone: "go",
  going: "go",
  made: "make",
  took: "take",
  taken: "take",
  gave: "give",
  given: "give",
  came: "come",
  got: "get",
  gotten: "get",
  found: "find",
  threw: "throw",
  thrown: "throw",
  wrote: "write",
  written: "write",
  stood: "stand",
  sat: "sit",
  ran: "run",
  grew: "grow",
  grown: "grow",
  brought: "bring",
  thought: "think",
  kept: "keep",
  woke: "wake",
  woken: "wake",
  hung: "hang",
  heard: "hear",
  put: "put",
  cut: "cut",
  set: "set",
  lost: "lose",
  spent: "spend",
  left: "leave",
  felt: "feel",
  told: "tell",
  said: "say",
  broke: "break",
  broken: "break",
  paid: "pay",
  caught: "catch",
  taught: "teach",
  dealt: "deal",
  meant: "mean",
  sent: "send",
  built: "build",
  slept: "sleep",
  sold: "sell",
  held: "hold",
  understood: "understand",
  hurt: "hurt",
  let: "let",
  hit: "hit",
  saw: "see",
  seen: "see",
  knew: "know",
  known: "know",
  drew: "draw",
  drawn: "draw",
  ate: "eat",
  eaten: "eat",
  became: "become",
  began: "begin",
  begun: "begin",
  chose: "choose",
  chosen: "choose",
  drove: "drive",
  driven: "drive",
  fell: "fall",
  fallen: "fall",
  forgot: "forget",
  forgotten: "forget",
  hidden: "hide",
  met: "meet",
  rode: "ride",
  ridden: "ride",
  rose: "rise",
  risen: "rise",
  sang: "sing",
  sung: "sing",
  spoke: "speak",
  spoken: "speak",
  stole: "steal",
  stolen: "steal",
  swam: "swim",
  swum: "swim",
  tore: "tear",
  torn: "tear",
  wore: "wear",
  worn: "wear",
  won: "win",
  bought: "buy",
  fed: "feed",
  fought: "fight",
  flew: "fly",
  flown: "fly",
  hid: "hide",
  led: "lead",
  lent: "lend",
  lit: "light",
  rang: "ring",
  rung: "ring",
  shook: "shake",
  shaken: "shake",
  shone: "shine",
  shot: "shoot",
  shown: "show",
  shut: "shut",
  sank: "sink",
  sunk: "sink",
  stuck: "stick",
  struck: "strike",
  swore: "swear",
  sworn: "swear",
  bit: "bite",
  bitten: "bite",
  blew: "blow",
  blown: "blow",
  bound: "bind",
  bent: "bend",
  bled: "bleed",
  dug: "dig",
  froze: "freeze",
  frozen: "freeze",
  laid: "lay",
  lain: "lie",
  lay: "lie",
};

const IRREGULAR_BY_BASE = (() => {
  const map = new Map<string, string[]>();
  for (const [form, base] of Object.entries(IRREGULAR_TO_BASE)) {
    if (form === base) continue;
    map.set(base, [...(map.get(base) ?? []), form]);
  }
  return map;
})();

/**
 * even + ing → evening 처럼, 접미사로 다른 단어가 되는 표제어는 -ing를 만들지 않는다.
 */
const SKIP_ING = new Set([
  "even",
  "ever",
  "over",
  "under",
  "after",
  "other",
  "rather",
  "never",
  "together",
]);

/** 불규칙 비교급·최상급. 규칙 -er/-est 는 만들지 않는다. */
const IRREGULAR_COMPARATIVE: Record<string, string[]> = {
  good: ["better", "best"],
  well: ["better", "best"],
  bad: ["worse", "worst"],
  far: ["farther", "further", "farthest", "furthest"],
};

/** 비교급을 붙이면 다른 말이 되거나, 형용사가 아닌 짧은 기능어 */
const SKIP_COMPARATIVE = new Set([
  ...SKIP_ING,
  "the",
  "and",
  "for",
  "but",
  "not",
  "you",
  "she",
  "his",
  "her",
  "its",
  "our",
  "who",
  "how",
  "why",
  "all",
  "any",
  "own",
  "this",
  "that",
  "these",
  "those",
  "with",
  "from",
  "into",
  "onto",
  "than",
  "then",
  "also",
  "just",
  "only",
  "very",
  "much",
  "many",
  "such",
  "some",
  "more",
  "most",
  "less",
  "least",
  "been",
  "being",
]);

function irregularFormsOf(base: string): string[] {
  return IRREGULAR_BY_BASE.get(base.toLowerCase()) ?? [];
}

function isCvc(word: string): boolean {
  return (
    /[^aeiou][aeiou][^aeiou]$/i.test(word) &&
    !/[wxy]$/i.test(word) &&
    word.length >= 3
  );
}

function vowelGroupCount(word: string): number {
  return word.toLowerCase().match(/[aeiouy]+/g)?.length ?? 0;
}

function regularInflections(base: string): string[] {
  const b = base.toLowerCase();
  if (b === "be" || b.length < 2) return [];
  const out: string[] = [];
  const push = (form: string) => {
    if (form && form !== b) out.push(form);
  };

  if (/[^aeiou]y$/i.test(b) && b.length > 2) {
    push(`${b.slice(0, -1)}ies`);
    push(`${b.slice(0, -1)}ied`);
  } else if (/(?:s|x|z|ch|sh)$/i.test(b)) {
    push(`${b}es`);
  } else {
    push(`${b}s`);
  }

  if (b.endsWith("e")) {
    push(`${b}d`);
    if (!SKIP_ING.has(b)) push(`${b.slice(0, -1)}ing`);
  } else {
    push(`${b}ed`);
    if (!SKIP_ING.has(b) && b.length >= 3) push(`${b}ing`);
    if (isCvc(b)) {
      const last = b.at(-1)!;
      push(`${b}${last}ed`);
      if (!SKIP_ING.has(b)) push(`${b}${last}ing`);
    }
  }

  // 비교급·최상급: `big` → bigger/biggest, `nice` → nicer/nicest, `happy` → happier/happiest
  if (
    !SKIP_COMPARATIVE.has(b) &&
    !IRREGULAR_COMPARATIVE[b] &&
    !/(?:er|est)$/i.test(b)
  ) {
    if (/[^aeiou]y$/i.test(b) && b.length > 2) {
      push(`${b.slice(0, -1)}ier`);
      push(`${b.slice(0, -1)}iest`);
    } else if (b.endsWith("e")) {
      push(`${b}r`);
      push(`${b}st`);
    } else if (isCvc(b)) {
      const last = b.at(-1)!;
      push(`${b}${last}er`);
      push(`${b}${last}est`);
    } else if (vowelGroupCount(b) === 1) {
      push(`${b}er`);
      push(`${b}est`);
    }
  }
  return out;
}

function formsOfOneWord(word: string): string[] {
  const raw = word.trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const out = new Set<string>([raw, lower]);
  for (const form of irregularFormsOf(lower)) out.add(form);
  for (const form of IRREGULAR_COMPARATIVE[lower] ?? []) out.add(form);
  for (const form of regularInflections(lower)) out.add(form);
  if (lower.length >= 3 && !lower.includes("'")) {
    out.add(`${lower}'s`);
  }
  return [...out];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 표제어 자리 표시.
 * - `~` : 아무 단어나, **없어도 됨** (`draw ~ attention to` → `draw attention to` / `drew my attention to`)
 * - `…` / `...` : 맨 앞·맨 뒤면 `~`와 같다 (`take ~ out of …` → `took some eggs out of`)
 * - `A` / `B` / `'A'` : 그 자리에 단어가 있어야 함 (`keep A from B` → `keep kids from playing`)
 *   자리는 **쉼표로 나열한 말**도 한 덩어리로 본다 (`Put A and B` → `Put plastic, paper, food waste, and glass`)
 * - `one's` : 소유격 하나 (`brush one's teeth` → `brush your teeth` / `brushed his teeth`)
 */
const TILDE_CHARS = "[~～〜∼˜]";
const APOSTROPHE = "[''`’´ʼ]";

function slotKind(token: string): "tilde" | "named" | "possessive" | null {
  const t = token.trim();
  if (new RegExp(`^${TILDE_CHARS}+(?:-?ing)?$`, "i").test(t)) return "tilde";
  // 교과서 표제어의 `…` / `...` 는 뒤따르는 말 자리 (`take ~ out of …`)
  if (/^(?:\.{2,}|…|‥)$/.test(t)) return "tilde";
  if (new RegExp(`^one${APOSTROPHE}s$`, "i").test(t)) return "possessive";
  if (/^(?:sb\.?|sth\.?)$/i.test(t)) return "named";
  if (/^(?:[''"‘’“”])?[A-DXYZ](?:[''’]s)?(?:[''"‘’“”])?$/.test(t)) return "named";
  return null;
}

/** `draw~ attention`처럼 붙인 ~도 자리로 본다 */
function lemmaTokens(lemma: string): string[] {
  return lemma
    .replace(new RegExp(`([A-Za-z0-9])(${TILDE_CHARS}+)`, "g"), "$1 $2")
    .replace(new RegExp(`(${TILDE_CHARS}+)([A-Za-z0-9])`, "g"), "$1 $2")
    .replace(/([A-Za-z0-9])(\.{2,}|…|‥)/g, "$1 $2")
    .replace(/(\.{2,}|…|‥)([A-Za-z0-9])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function isLemmaSlotToken(token: string): boolean {
  return slotKind(token) !== null;
}

export function lemmaHasSlots(lemma: string): boolean {
  return lemmaTokens(lemma).some(isLemmaSlotToken);
}

/** 수량 표현은 관사를 빼고 복수로 바꾸지 않는다 (`a couple of` → `couples of`는 틀림). */
const KEEP_ARTICLE_NOUNS = new Set([
  "lot",
  "couple",
  "number",
  "bit",
  "amount",
  "plenty",
  "majority",
  "variety",
  "deal",
  "few",
  "little",
]);

/** 마지막 단어를 복수로 바꾸면 안 되는 닫힌 말·불가산 (`look at` → `look ats`, `each other` → `each others`). */
const NO_PLURAL_LAST = new Set([
  "a",
  "an",
  "the",
  "at",
  "to",
  "of",
  "for",
  "in",
  "on",
  "up",
  "out",
  "off",
  "about",
  "from",
  "by",
  "as",
  "with",
  "into",
  "onto",
  "upon",
  "over",
  "under",
  "after",
  "before",
  "between",
  "among",
  "through",
  "around",
  "across",
  "against",
  "without",
  "within",
  "along",
  "during",
  "until",
  "than",
  "so",
  "too",
  "not",
  "and",
  "or",
  "but",
  "down",
  "away",
  "back",
  "forth",
  "together",
  "apart",
  "aside",
  "home",
  "well",
  "true",
  "ready",
  "sorry",
  "sure",
  "other",
  "another",
  "own",
  "one",
  "ones",
  "all",
  "much",
  "many",
  "more",
  "most",
  "such",
  "same",
  "care",
  "fun",
  "sense",
  "attention",
  "homework",
  "information",
  "news",
  "this",
  "that",
  "these",
  "those",
  "there",
  "here",
]);

const ALREADY_PLURAL = new Set([
  "people",
  "children",
  "men",
  "women",
  "teeth",
  "feet",
  "mice",
  "geese",
  "fish",
  "sheep",
  "clothes",
  "police",
]);

function isArticle(token: string): boolean {
  const fold = token.toLowerCase();
  return fold === "a" || fold === "an";
}

/** 규칙 복수만 (`picture` → `pictures`). 불규칙은 넣지 않는다. */
function nounPlurals(word: string): string[] {
  const b = word.toLowerCase();
  if (KEEP_ARTICLE_NOUNS.has(b)) return [];
  if (NO_PLURAL_LAST.has(b) || ALREADY_PLURAL.has(b)) return [];
  let plural: string;
  if (/[^aeiou]y$/i.test(b) && b.length > 2) {
    plural = `${b.slice(0, -1)}ies`;
  } else if (/(?:s|x|z|ch|sh)$/i.test(b)) {
    plural = `${b}es`;
  } else {
    plural = `${b}s`;
  }
  return plural === b ? [] : [plural];
}

function lastContentIndex(words: string[]): number {
  for (let i = words.length - 1; i >= 0; i -= 1) {
    if (!isLemmaSlotToken(words[i]!)) return i;
  }
  return -1;
}

function canPluralizeLast(word: string): boolean {
  if (isLemmaSlotToken(word) || isArticle(word)) return false;
  const b = word.toLowerCase();
  if (NO_PLURAL_LAST.has(b) || ALREADY_PLURAL.has(b)) return false;
  // `friends`처럼 이미 복수로 보이는 말은 건너뛴다. `bus`/`class`는 살린다.
  if (/s$/i.test(b) && !/(?:ss|us|ch|sh|x|z)$/i.test(b)) return false;
  return nounPlurals(word).length > 0;
}

function sequenceKey(words: string[]): string {
  return words.join("\0");
}

/** `take a picture of` → `take pictures of` */
function expandArticleNounOf(words: string[]): string[][] {
  const sequences: string[][] = [words];
  const seen = new Set([sequenceKey(words)]);
  for (let i = 0; i < words.length - 2; i += 1) {
    if (!isArticle(words[i]!)) continue;
    if (words[i + 2]!.toLowerCase() !== "of") continue;
    if (isLemmaSlotToken(words[i + 1]!)) continue;
    for (const plural of nounPlurals(words[i + 1]!)) {
      const next = [...words.slice(0, i), plural, ...words.slice(i + 2)];
      const key = sequenceKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      sequences.push(next);
    }
  }
  return sequences;
}

/** `best friend` → `best friends` */
function expandLastNounPlural(sequences: string[][]): string[][] {
  const out = [...sequences];
  const seen = new Set(sequences.map(sequenceKey));
  for (const seq of sequences) {
    const lastIdx = lastContentIndex(seq);
    if (lastIdx < 1) continue;
    const contentCount = seq.filter((token) => !isLemmaSlotToken(token)).length;
    if (contentCount < 2) continue;
    const last = seq[lastIdx]!;
    if (!canPluralizeLast(last)) continue;
    for (const plural of nounPlurals(last)) {
      const next = [...seq.slice(0, lastIdx), plural, ...seq.slice(lastIdx + 1)];
      const key = sequenceKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(next);
    }
  }
  return out;
}

function expandLemmaSequences(words: string[]): string[][] {
  return expandLastNounPlural(expandArticleNounOf(words));
}

/**
 * 의문문에서 be가 주어 앞으로 나갈 때 가운데 올 수 있는 말.
 * `Are you ready for` / `Is the class ready for`.
 * 동사(`getting`)는 넣지 않는다 — `are getting ready for`는 get ready for다.
 */
const BE_INVERSION_SUBJECT =
  "(?:I|you|he|she|it|we|they|this|that|these|those|there|one|who|what|everyone|everybody|someone|somebody|anyone|anybody|nobody|(?:the|a|an|this|that|these|those|my|your|his|her|its|our|their)\\s+[A-Za-z][A-Za-z0-9'-]*)";

/** `I'm interested` / `she's ready` — 주어가 이미 축약에 들어 있다. */
const BE_CONTRACTION = `(?:I|you|he|she|it|we|they|who|that|there|here|what|one)(?:${APOSTROPHE}(?:m|re|s))`;
const BE_NEGATED = `(?:isn|aren|wasn|weren)${APOSTROPHE}t`;

/**
 * be·숙어 토큰 사이에 올 수 있는 정도·부정 부사.
 * 빈칸에는 넣지 않는다 (`I'm very interested in` → `[I'm] very [interested in]`,
 * `was very happy with` → `[was] very [happy with]`).
 * `very, very`처럼 쉼표로 겹친 것도 본다.
 */
const BE_DEGREE =
  "(?:not|never|always|still|already|even|also|almost|completely|totally|super|very|really|so|quite|pretty|extremely|too|rather|fairly|highly|especially|particularly|deeply|truly|just|most|more)";
const DEGREE_GAP = `(?:\\s*,?\\s+${BE_DEGREE})*`;

const BE_TRAILING_PREP = /^(?:in|at|on|to|of|for|from|with|about|into)$/i;

function patternFromTokens(tokens: string[]): string | null {
  const fill = "[A-Za-z0-9][A-Za-z0-9'-]*";
  // 자리 안 단어는 공백뿐 아니라 `plastic, paper`처럼 쉼표로도 이어진다
  const fillSep = "(?:\\s*,\\s*|\\s+)";
  const optionalFill = `(?:${fillSep}${fill}(?:${fillSep}${fill})*?)?`;
  const requiredFill = `\\s+${fill}(?:${fillSep}${fill})*?`;
  const possessiveFill = `(?:my|your|his|her|its|our|their|whose|one${APOSTROPHE}s|[A-Za-z][A-Za-z0-9-]*(?:${APOSTROPHE}s|s${APOSTROPHE}))`;
  const chunks: string[] = [];
  let inflectedLiteral = false;
  const beLemma = tokens[0]?.toLowerCase() === "be";
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const last = index === tokens.length - 1;
    const atStart = chunks.length === 0;
    const kind = slotKind(token);

    if (kind) {
      if (kind === "tilde" && (last || atStart)) {
        continue;
      }
      if (kind === "possessive") {
        chunks.push(atStart ? possessiveFill : `\\s+${possessiveFill}`);
        continue;
      }
      if (last) {
        chunks.push(`(?:\\s+${fill})?`);
      } else if (atStart) {
        chunks.push(fill);
      } else {
        chunks.push(kind === "tilde" ? optionalFill : requiredFill);
      }
      continue;
    }

    const forms = inflectedLiteral ? [token] : formsOfOneWord(token);
    inflectedLiteral = true;
    const alt = [...new Set(forms.map((form) => escapeRegExp(form)))].join("|");
    const body = forms.length > 1 ? `(?:${alt})` : alt;
    if (atStart && token.toLowerCase() === "be") {
      chunks.push(`\\b(${body}|${BE_CONTRACTION}|${BE_NEGATED})`);
      chunks.push(`(?:\\s+${BE_INVERSION_SUBJECT})?`);
      chunks.push(DEGREE_GAP);
      continue;
    }
    // `I'm very interested` / `be interested in ~` 처럼 맨 뒤 전치사는 없어도 된다
    const trailingPrep =
      index === lastContentIndex(tokens) &&
      beLemma &&
      BE_TRAILING_PREP.test(token);
    if (trailingPrep) {
      chunks.push(`(?:${DEGREE_GAP}\\s*,?\\s+(${body}))?`);
    } else if (atStart) {
      chunks.push(`\\b(${body})`);
    } else {
      // `was very happy with` / `food waste, and glass` — 정도 부사·옥스포드 쉼표
      chunks.push(`${DEGREE_GAP}\\s*,?\\s+(${body})`);
    }
  }
  if (chunks.length === 0) return null;
  chunks.push("\\b");
  return chunks.join("");
}

/** 표제어 토큰 → 본문 검색 패턴. 자리·be 도치 규칙을 `patternFromTokens`에 맡긴다. */
function phrasePatternFromLemma(lemma: string): string | null {
  const tokens = lemmaTokens(lemma);
  if (tokens.length === 0) return null;
  if (!tokens.some((token) => !isLemmaSlotToken(token))) return null;

  const parts = expandLemmaSequences(tokens)
    .map((sequence) => patternFromTokens(sequence))
    .filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  return `(?:${parts.join("|")})`;
}

/**
 * 자리 표시가 있는 표제어를 본문에서 찾기 위한 패턴.
 * 가운데 `~`는 없어도 되고, `A`/`B`는 한 단어 이상(쉼표 나열 포함).
 * `one's`는 소유격 하나 (`your` / `his` / `Tom's`).
 * 맨 앞·맨 뒤 `~`는 빈칸에 넣지 않는다 (`look at ~` → `Look at my`에서 `Look at`만).
 */
export function lemmaSlotPattern(lemma: string): string | null {
  const tokens = lemmaTokens(lemma);
  if (tokens.length === 0 || !tokens.some(isLemmaSlotToken)) return null;
  return phrasePatternFromLemma(lemma);
}

/**
 * 자리 없는 `be ready for`도 의문문 도치(`Are you ready for`)·축약(`I'm ready for`)을 찾는다.
 * 자리 있는 표제어는 `lemmaSlotPattern`이 같은 규칙을 이미 쓴다.
 */
export function lemmaSearchPattern(lemma: string): string | null {
  const slotted = lemmaSlotPattern(lemma);
  if (slotted) return slotted;
  const tokens = lemmaTokens(lemma);
  if (tokens.length < 2 || tokens[0]!.toLowerCase() !== "be") return null;
  return phrasePatternFromLemma(lemma);
}

function mergeAdjacentHits(
  sentence: string,
  hits: { start: number; end: number; surface: string }[],
): { start: number; end: number; surface: string }[] {
  if (hits.length <= 1) return hits;
  const merged: { start: number; end: number; surface: string }[] = [];
  let current = { ...hits[0]! };
  for (let i = 1; i < hits.length; i += 1) {
    const next = hits[i]!;
    const between = sentence.slice(current.end, next.start);
    if (/^\s*$/.test(between)) {
      current = {
        start: current.start,
        end: next.end,
        surface: sentence.slice(current.start, next.end),
      };
      continue;
    }
    merged.push(current);
    current = { ...next };
  }
  merged.push(current);
  return merged;
}

/**
 * 자리 있는 표제어가 본문에 나온 뒤, 빈칸으로 잠글 **실제 단어**만 돌려준다.
 * `take A to B` + `takes … to them` → `takes`, `to` (`A`/`B`는 잠그지 않음).
 */
export function findSlotLiteralHits(
  sentence: string,
  lemma: string,
): { start: number; end: number; surface: string }[] | null {
  const pattern = lemmaSearchPattern(lemma);
  if (!pattern) return null;
  const match = new RegExp(pattern, "id").exec(sentence) as
    | (RegExpExecArray & {
        indices?: Array<[number, number] | undefined>;
      })
    | null;
  if (!match?.[0] || match.index == null) return null;

  const span = match[0];
  const spanStart = match.index;
  const hits: { start: number; end: number; surface: string }[] = [];
  if (match.indices) {
    for (let i = 1; i < match.indices.length; i += 1) {
      const span = match.indices[i];
      if (!span) continue;
      hits.push({
        start: span[0],
        end: span[1],
        surface: sentence.slice(span[0], span[1]),
      });
    }
  } else {
    let cursor = 0;
    for (let i = 1; i < match.length; i += 1) {
      const group = match[i];
      if (!group) continue;
      const at = span.toLowerCase().indexOf(group.toLowerCase(), cursor);
      if (at < 0) continue;
      hits.push({
        start: spanStart + at,
        end: spanStart + at + group.length,
        surface: sentence.slice(spanStart + at, spanStart + at + group.length),
      });
      cursor = at + group.length;
    }
  }
  if (hits.length === 0) {
    return [
      {
        start: spanStart,
        end: spanStart + span.length,
        surface: span,
      },
    ];
  }
  return mergeAdjacentHits(sentence, hits);
}

/** 표제어와 그 활용형. 여러 단어면 앞 단어만 굴절한다 (`be related to` → `was related to`). `a/an + 명사 + of`는 관사 없이 명사 복수도 넣는다 (`take a picture of` → `take pictures of`). 마지막 명사도 복수로 본다 (`best friend` → `best friends`). */
export function englishSurfaceForms(lemma: string): string[] {
  const words = lemmaTokens(lemma).filter((token) => !isLemmaSlotToken(token));
  if (words.length === 0) return [];
  const forms = new Set<string>();
  for (const sequence of expandLemmaSequences(words)) {
    const heads = formsOfOneWord(sequence[0]!);
    if (sequence.length === 1) {
      for (const head of heads) forms.add(head);
      continue;
    }
    const tail = sequence.slice(1).join(" ");
    for (const head of heads) forms.add(`${head} ${tail}`);
  }
  return [...forms].sort((a, b) => b.length - a.length);
}

export function isInflectedFormOf(surface: string, lemma: string): boolean {
  const token = surface.trim().replace(/\s+/g, " ");
  if (!token || !lemma.trim()) return false;
  const search = lemmaSearchPattern(lemma);
  if (search) {
    return new RegExp(`^(?:${search})$`, "i").test(token);
  }
  const folded = token.toLowerCase();
  return englishSurfaceForms(lemma).some(
    (form) => form.replace(/\s+/g, " ").toLowerCase() === folded,
  );
}
