/**
 * 문제은행 문장 청크 스타일에 가깝게 구나 단위로 나눔.
 * 예: "The pets / you raise / show / what kind of / person / you are."
 * (단어마다 쪼개지 않음)
 *
 * ⚠️ 이 파일은 의도적으로 **의존성이 없습니다.**
 * `../scripts/import-problem-bank.mjs`가 이 파일을 그대로 `import`해서
 * 엑셀 → problem-bank.json 변환 때 같은 규칙으로 청크를 만듭니다.
 * (Node의 타입 스트리핑으로 .ts를 직접 읽음 — `@/…` 별칭을 쓰면 깨집니다.)
 */

/** `problem-bank.ts`의 동명 함수와 같은 동작 — 의존성을 없애려 여기 둠 */
function stripBrackets(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, "$1").replace(/\s+/g, " ").trim();
}

/**
 * 대화 문장부호는 청크에 남기고, 화살표·이모티콘 같은 장식 기호는 뺀다.
 * `! ? ' " ~ …` 와 마침표·쉼표·따옴표는 두고, `↳ → ★ 😊` 는 조각으로 두지 않는다.
 * `given-chunks.ts` 의 같은 정규식과 맞춰 둔다.
 */
export function stripDecorativeMarks(text: string): string {
  return text
    .replace(/[^\s\p{L}\p{N}.,!?;:'"‘’“”…~\-–—()[\]。？！、，「」『』·]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeChunkParts(parts: string[]): string[] {
  return parts
    .map((part) => stripDecorativeMarks(part.trim()))
    .filter((part) => /[\p{L}\p{N}]/u.test(part));
}

export function sanitizeChunkLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  const parts = trimmed.includes("/") ? trimmed.split("/") : [trimmed];
  return sanitizeChunkParts(parts).join(" / ");
}

const MULTIWORD_PHRASES = [
  "what kind of",
  "related to",
  "have been",
  "has been",
  "had been",
  "woke up",
  "get up",
  "a little",
  "a few",
  "a lot of",
  "as much as",
  "instead of",
  "because of",
  "in front of",
  "best friend",
  "my best",
  "after school",
  "during the",
  "as soon as",
  "so that",
  "in order to",
  // 아래는 자동 나눔이 어색하게 쪼개던 표현들
  "on the other hand",
  "there is",
  "there are",
  "there was",
  "there were",
  "one day",
  "for example",
  "at first",
  "at last",
  "these days",
  "each other",
  "such as",
  "as well",
  "more than",
  "a kind of",
  "kind of",
  // 전치사 숙어
  "thanks to",
  "according to",
  "in spite of",
  "as well as",
  "a lot",
  "plenty of",
  "a couple of",
  "next to",
  "out of",
  "far from",
  "close to",
  // 부사구·접속 표현
  "at the same time",
  "at last",
  "at least",
  "at once",
  "right now",
  "right away",
  "of course",
  "after all",
  "in fact",
  "so far",
  "once again",
  "more and more",
  "one another",
  "as long as",
  "no longer",
  "not only",
  "as if",
  // 조동사 상당어구
  "have to",
  "has to",
  "had to",
  "used to",
  "had better",
  "would like to",
  "a number of",
  "the number of",
  // 수량 표현
  "a piece of",
  "a cup of",
  "a glass of",
  "a pair of",
  "a slice of",
  "a bottle of",
  "a bit of",
  "quite a few",
  "too much",
  "too many",
  "not at all",
  "at all",
  // 시간·장소 부사구
  "all the time",
  "all day",
  "all night",
  "all over",
  "over there",
  "over here",
  "in the end",
  "in the past",
  "in the future",
  "in time",
  "on time",
  "at night",
  "in the morning",
  "in the afternoon",
  "in the evening",
  "every day",
  "some day",
  "from now on",
  "as usual",
  "as a result",
  "for the first time",
  // 반복·순서 표현
  "little by little",
  "step by step",
  "side by side",
  "one by one",
  "again and again",
  "over and over",
  // 의문·비교 표현
  "how about",
  "what about",
  "how many",
  "how much",
  "how long",
  "how often",
  "how far",
  "what time",
  "the same as",
  "no one",
  "look forward to",
  "thank you for",
  "above all",
  "across from",
  "all of a sudden",
  "and so on",
  "by the way",
  "even if",
  "even though",
  "first of all",
  "for a while",
  "from time to time",
  "in a hurry",
  "in addition",
  "in common",
  "in danger",
  "in general",
  "in other words",
  "in particular",
  "in trouble",
  "no matter what",
  "on the way to",
  "how to",
  "less than",
  "most of",
  "one of",
  "enough to",
].sort((a, b) => b.length - a.length);

/**
 * 구동사 — 기본형만 적어 두고 굴절형(-s/-ed/-ing)은 아래에서 자동 생성한다.
 * 고정 문자열 목록으로는 `look at`은 잡아도 `looked at`을 놓친다.
 */
const PHRASAL_VERBS: Record<string, string[]> = {
  look: ["at", "for", "after", "like", "up", "into", "around"],
  listen: ["to"],
  wait: ["for"],
  wake: ["up"],
  give: ["up", "back", "away"],
  turn: ["on", "off", "down", "up", "into", "around"],
  find: ["out"],
  grow: ["up"],
  pick: ["up"],
  run: ["away", "into"],
  sit: ["down"],
  stand: ["up", "for"],
  throw: ["away"],
  try: ["on", "out"],
  write: ["down"],
  hand: ["in", "out"],
  hang: ["out", "up"],
  work: ["out", "on"],
  check: ["out", "in"],
  bring: ["up", "back"],
  call: ["back", "off"],
  clean: ["up"],
  cut: ["down", "off"],
  fill: ["in", "out"],
  move: ["on"],
  point: ["out"],
  set: ["up"],
  show: ["up"],
  think: ["about", "of"],
  worry: ["about"],
  talk: ["about", "to", "with"],
  belong: ["to"],
  depend: ["on"],
  agree: ["with"],
  ask: ["for"],
  care: ["about", "for"],
  laugh: ["at"],
  arrive: ["at", "in"],
  // 아래는 숙어 사전(`idiom-meanings.ts`) 표제어 — 굴절형까지 한 덩어리로 잡히게 한다
  pay: ["for"],
  prepare: ["for"],
  break: ["down"],
  carry: ["on", "out"],
  figure: ["out"],
  hurry: ["up"],
  deal: ["with"],
  hear: ["from"],
  leave: ["for"],
  learn: ["about"],
  catch: ["a cold"],
  have: ["a good time"],
  keep: ["on", "in touch", "a promise"],
  take: ["care of", "part in", "a look at", "a break", "a picture", "a walk", "place", "turns", "off", "out", "away"],
  make: ["up", "friends with", "sure", "a mistake"],
  come: ["from", "back", "in", "out", "along", "across", "true"],
  get: ["up", "off", "on", "along", "back", "together", "along with", "rid of", "well"],
  put: ["on", "off", "up", "away", "down", "up with"],
  go: ["out", "on", "back", "away", "through", "to bed"],
};

/** be동사 뒤에 붙어 한 덩어리가 되는 숙어 꼬리 */
const BE_IDIOM_TAILS = [
  "going to",
  "about to",
  "ready for",
  "used to",
  "related to",
  "interested in",
  "good at",
  "bad at",
  "able to",
  "afraid of",
  "full of",
  "proud of",
  "ready to",
  "tired of",
  "worried about",
  "famous for",
  "different from",
  "similar to",
  "covered with",
  "filled with",
  "made of",
  "made from",
  "late for",
  "sorry for",
  "surprised at",
  "excited about",
  "known for",
  "based on",
  "busy with",
  "kind to",
  "angry with",
];

/** 불규칙 과거·과거분사 → 기본형. `-ed` 규칙으로는 `made up`을 못 잡는다. */
const IRREGULAR_FORMS: Record<string, string> = {
  made: "make",
  took: "take",
  taken: "take",
  gave: "give",
  given: "give",
  went: "go",
  gone: "go",
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
  hung: "hang",
  heard: "hear",
  put: "put",
  cut: "cut",
  set: "set",
  did: "do",
  done: "do",
  lost: "lose",
  spent: "spend",
  left: "leave",
  felt: "feel",
  told: "tell",
  said: "say",
  // 아래는 숙어 사전(`idiom-meanings.ts`) 표제어의 동사들 — `broke down` 같은
  // 과거형이 표제어(`break down`)로 되돌아가야 조회된다
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
};

/**
 * `one's`(소유격) · `oneself`(재귀대명사) 자리가 사람마다 바뀌는 숙어.
 * "do my best" / "do your best"를 고정 문자열로는 못 잡아서 템플릿으로 둔다.
 * 맨 앞이 동사면 굴절형(made up his mind)까지 함께 매칭된다.
 */
const SLOT_IDIOMS = [
  "do one's best",
  "make up one's mind",
  "change one's mind",
  "take one's time",
  "keep one's word",
  "lose one's temper",
  "lose one's way",
  "on one's way",
  "in one's opinion",
  "help oneself",
  "by oneself",
  "enjoy oneself",
  "make oneself at home",
];

const POSSESSIVE_ALT = "(?:my|your|his|her|its|our|their|one's)";
const REFLEXIVE_ALT =
  "(?:myself|yourself|himself|herself|itself|ourselves|yourselves|themselves|oneself)";

/**
 * 정규식 대안(`a|b`)은 **먼저 적힌 것이 이긴다.**
 * `along|along with` 순서면 `get along with`가 `get along`에서 잘리므로
 * 항상 긴 것부터 세운다.
 */
function escapeAlt(items: string[]): string {
  return [...items]
    .sort((a, b) => b.length - a.length)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

/**
 * 동사 하나의 굴절형 대안. `-y`로 끝나면 `hurry → hurried/hurries`처럼
 * y가 i로 바뀌므로 따로 만들어 준다 (`hurryed`는 없는 형태).
 */
function verbFormsAlt(verb: string): string {
  const forms = [verb, `${verb}s`, `${verb}es`, `${verb}ed`, `${verb}d`, `${verb}ing`];
  if (/[^aeiou]y$/.test(verb)) {
    const stem = verb.slice(0, -1);
    forms.push(`${stem}ied`, `${stem}ies`);
  }
  return escapeAlt(forms);
}

/** look/looks/looked/looking + at 처럼 굴절형까지 하나로 묶는 정규식 */
const PHRASAL_RE = (() => {
  const parts = Object.entries(PHRASAL_VERBS).map(
    ([verb, particles]) =>
      `(?:${verbFormsAlt(verb)})\\s+(?:${escapeAlt(particles)})`,
  );
  for (const [form, base] of Object.entries(IRREGULAR_FORMS)) {
    const particles = PHRASAL_VERBS[base];
    if (particles) parts.push(`${form}\\s+(?:${escapeAlt(particles)})`);
  }
  // 긴 쪽이 먼저 매치되도록 (take care of > take)
  parts.sort((a, b) => b.length - a.length);
  // `\b`가 없으면 "welcome from"의 뒷부분을 "come from"으로 잘못 잡는다
  return new RegExp(`\\b(?:${parts.join("|")})\\b`, "gi");
})();

const BE_IDIOM_RE = new RegExp(
  `\\b(?:am|is|are|was|were|be|been|being)\\s+(?:${escapeAlt(BE_IDIOM_TAILS)})\\b`,
  "gi",
);

/** 기본형 → 불규칙 활용형들 (IRREGULAR_FORMS를 뒤집은 것) */
const IRREGULAR_BY_BASE = (() => {
  const map = new Map<string, string[]>();
  for (const [form, base] of Object.entries(IRREGULAR_FORMS)) {
    if (form === base) continue;
    map.set(base, [...(map.get(base) ?? []), form]);
  }
  return map;
})();

/** 동사 하나를 굴절형까지 포함하는 정규식 조각으로 */
function verbAlt(base: string): string {
  const irregular = IRREGULAR_BY_BASE.get(base) ?? [];
  const regular = `${base}(?:e?s|ed|d|ing)?`;
  return irregular.length
    ? `(?:${escapeAlt(irregular)}|${regular})`
    : `(?:${regular})`;
}

const VERB_BASES = new Set([
  ...Object.keys(PHRASAL_VERBS),
  ...Object.values(IRREGULAR_FORMS),
  "do",
  "change",
  "lose",
  "help",
  "enjoy",
  "spend",
]);

const SLOT_IDIOM_RE = new RegExp(
  `\\b(?:${SLOT_IDIOMS.map((template) =>
    template
      .split(/\s+/)
      .map((token, index) => {
        if (token === "one's") return POSSESSIVE_ALT;
        if (token === "oneself") return REFLEXIVE_ALT;
        if (index === 0 && VERB_BASES.has(token)) return verbAlt(token);
        return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("\\s+"),
  ).join("|")})\\b`,
  "gi",
);

const DET =
  /^(a|an|the|my|your|his|her|their|our|its|this|that|these|those)$/i;
const AUX =
  /^(am|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|can|could|should|may|might|must)$/i;
const PREP =
  /^(in|on|at|to|for|with|from|by|about|during|into|onto|of|as|over|under|after|before)$/i;
const PRON = /^(I|you|he|she|we|they|it)$/i;
const CONJ_SPLIT =
  /\s+(?=(?:and|but|or|because|although|when|whenever|while|if|so|after|before)\b)/i;
const PARTICLE = /^(up|out|off|away|down|back)$/i;
const LOOKS_ADJ = /(?:ous|ful|ive|less|ish|ical|able|ible|ent|ant)$/i;

/** 접미사로는 안 잡히는 흔한 중학 형용사 — 뒤 명사와 붙여 둠 */
const COMMON_ADJ =
  /^(heavy|light|big|small|large|little|old|new|young|good|bad|great|nice|long|short|hard|easy|simple|happy|sad|hot|cold|warm|cool|fast|slow|high|low|deep|same|other|many|much|few|next|last|first|second|real|true|free|full|empty|clean|dirty|safe|busy|quiet|loud|strong|weak|rich|poor|early|late|smart|funny|pretty|lovely|healthy|hungry|thirsty|tired|angry|lucky|dry|wet|sunny|rainy|cloudy|windy|snowy|favorite|special|main)$/i;

/** 소유격(friends' / Minji's)은 뒤 명사와 한 덩어리 */
const POSSESSIVE = /(?:['’]s|s['’])$/;

/**
 * 형용사로 보이는 단어인지. 청크를 나눌 때 쓰던 판별을 밖에서도 쓴다 —
 * `guessPos`는 `heavy`·`light`를 못 잡지만 여기 목록엔 들어 있다.
 */
export function looksLikeAdjective(word: string): boolean {
  const w = word.trim();
  if (!w) return false;
  return COMMON_ADJ.test(w) || LOOKS_ADJ.test(w);
}

function isModifier(word: string): boolean {
  return (
    (LOOKS_ADJ.test(word) || COMMON_ADJ.test(word) || POSSESSIVE.test(word)) &&
    !DET.test(word)
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function restorePlaceholders(text: string, stored: string[]): string {
  return text.replace(/__P(\d+)__/g, (_, n) => stored[Number(n)] ?? "");
}

/**
 * 숙어 인식 규칙을 **우선순위 순서대로** 돌려준다.
 * 앞쪽이 이긴다 — 단원 어휘 > 긴 템플릿 > be동사/구동사 > 정적 목록.
 * ("make up one's mind"가 "make up"에게 잘리면 안 된다)
 */
function idiomMatchers(extraPhrases: string[]): RegExp[] {
  const extras = [
    ...new Set(extraPhrases.map((p) => p.trim()).filter((p) => /\s/.test(p))),
  ].sort((a, b) => b.length - a.length);

  return [
    ...extras.map((p) => new RegExp(`\\b${escapeRegExp(p)}\\b`, "gi")),
    SLOT_IDIOM_RE,
    BE_IDIOM_RE,
    PHRASAL_RE,
    ...MULTIWORD_PHRASES.map((p) => new RegExp(`\\b${escapeRegExp(p)}\\b`, "gi")),
  ];
}

export type IdiomSpan = { start: number; end: number; text: string };

/**
 * 문장 안에서 **쪼개면 안 되는 숙어**의 위치를 찾는다.
 * 청크 나눔과 단어 클릭 토큰화가 같은 함수를 쓰게 해서, 둘이 서로 다른
 * 숙어를 보고 어긋나는 일이 없도록 한다.
 */
export function findIdiomSpans(
  sentence: string,
  extraPhrases: string[] = [],
): IdiomSpan[] {
  const taken: IdiomSpan[] = [];
  const overlaps = (start: number, end: number) =>
    taken.some((span) => start < span.end && end > span.start);

  for (const re of idiomMatchers(extraPhrases)) {
    re.lastIndex = 0; // 공유 정규식이라 이전 호출의 위치가 남아 있다
    let match: RegExpExecArray | null;
    while ((match = re.exec(sentence)) !== null) {
      if (match[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      const start = match.index;
      const end = start + match[0].length;
      if (!overlaps(start, end)) taken.push({ start, end, text: match[0] });
    }
  }

  return taken.sort((a, b) => a.start - b.start);
}

function protectPhrases(
  sentence: string,
  extraPhrases: string[] = [],
): { text: string; stored: string[] } {
  const stored: string[] = [];
  let text = "";
  let cursor = 0;

  for (const span of findIdiomSpans(sentence, extraPhrases)) {
    text += `${sentence.slice(cursor, span.start)}__P${stored.length}__`;
    stored.push(span.text);
    cursor = span.end;
  }
  text += sentence.slice(cursor);

  return { text, stored };
}

/**
 * 마침표는 단어에 붙여 두는 설계라 토큰이 `__P0__.` 형태로 올 수 있다.
 * 정확히 일치로만 보면 문장 끝 숙어를 놓친다.
 */
const isPlaceholder = (word: string | undefined): boolean =>
  !!word && /^__P\d+__[.!?,;:]*$/.test(word);

/**
 * 보호된 숙어가 **동사구**인지 판별한다.
 * "She" + "looked at"는 붙여야 하지만 "it" + "all the time"은 붙이면 안 된다.
 */
function phraseStartsWithVerb(phrase: string): boolean {
  const first = phrase.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!first) return false;
  if (AUX.test(first)) return true;
  if (IRREGULAR_FORMS[first]) return true;
  if (VERB_BASES.has(first)) return true;
  return ["s", "es", "ed", "d", "ing"].some((suffix) =>
    first.endsWith(suffix) && VERB_BASES.has(first.slice(0, -suffix.length)),
  );
}

/** 앞 단어가 이 덩어리를 흡수해도 되는가 */
function canAbsorb(next: string | undefined, stored: string[]): boolean {
  if (!next) return false;
  if (!isPlaceholder(next)) return true;
  return phraseStartsWithVerb(restorePlaceholders(next, stored));
}

function chunkWords(words: string[], stored: string[]): string[] {
  const out: string[] = [];
  let i = 0;

  while (i < words.length) {
    const w = words[i]!;

    if (isPlaceholder(w)) {
      out.push(restorePlaceholders(w, stored));
      i += 1;
      continue;
    }

    // 관사/소유격 + (형용사) + 명사
    if (DET.test(w) && i + 1 < words.length) {
      let j = i + 1;
      while (j < words.length - 1 && isModifier(words[j]!)) {
        j += 1;
      }
      if (j < words.length) {
        out.push(
          restorePlaceholders(words.slice(i, j + 1).join(" "), stored),
        );
        i = j + 1;
        continue;
      }
    }

    // 조동사/be + 본동사 (+ 부사 파티클)
    // 보호된 숙어(__P0__)는 이미 완결된 덩어리라 삼키지 않는다
    if (AUX.test(w) && i + 1 < words.length && canAbsorb(words[i + 1], stored)) {
      let j = i + 1;
      j += 1;
      if (j < words.length && PARTICLE.test(words[j]!)) j += 1;
      out.push(restorePlaceholders(words.slice(i, j).join(" "), stored));
      i = j;
      continue;
    }

    // 전치사 + (관사) + 명사구
    if (PREP.test(w) && i + 1 < words.length && !CONJ_SPLIT.test(` ${w}`)) {
      let j = i + 1;
      if (DET.test(words[j]!)) j += 1;
      while (j < words.length - 1 && isModifier(words[j]!)) {
        j += 1;
      }
      if (j < words.length && !/^[,.!?;:]$/.test(words[j]!)) {
        out.push(
          restorePlaceholders(words.slice(i, j + 1).join(" "), stored),
        );
        i = j + 1;
        continue;
      }
    }

    // 대명사 + 동사 (I woke, you are)
    if (PRON.test(w) && i + 1 < words.length && canAbsorb(words[i + 1], stored)) {
      let j = i + 1;
      j += 1;
      if (j < words.length && PARTICLE.test(words[j]!)) j += 1;
      out.push(restorePlaceholders(words.slice(i, j).join(" "), stored));
      i = j;
      continue;
    }

    // 관사 없는 형용사 + 명사 (heavy rain, various ways)
    if (
      isModifier(w) &&
      i + 1 < words.length &&
      !/^[,.!?;:]$/.test(words[i + 1]!) &&
      !isPlaceholder(words[i + 1])
    ) {
      out.push(restorePlaceholders(words.slice(i, i + 2).join(" "), stored));
      i += 2;
      continue;
    }

    // 쉼표 등은 앞 청크에 붙임
    if (/^[,.!?;:]$/.test(w) && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]}${w}`;
      i += 1;
      continue;
    }

    out.push(restorePlaceholders(w, stored));
    i += 1;
  }

  return out.filter(Boolean);
}

/**
 * 영어 문장 → 구나 단위 청크.
 *
 * @param extraPhrases 쪼개면 안 되는 숙어를 추가로 넘긴다. 문제은행/직접 추가 단어 중
 *   여러 단어짜리 항목(`be related to`, `On the other hand`)을 그대로 넘기면
 *   해당 단원에서만 쓰는 숙어까지 보호된다. 한 단어짜리는 무시된다.
 */
export function splitEnglishChunksPhrase(
  sentence: string,
  extraPhrases: string[] = [],
): string[] {
  const trimmed = sentence.trim();
  if (!trimmed) return [];
  if (trimmed.includes("/")) {
    return sanitizeChunkParts(
      trimmed
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  const plain = stripDecorativeMarks(stripBrackets(trimmed))
    .replace(/([,;:])/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();

  const { text, stored } = protectPhrases(plain, extraPhrases);
  // 접속사 앞에서 절 단위로 먼저 가름
  const clauses = text
    .split(CONJ_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const clause of clauses) {
    // 접속사로 시작하는 절이면 접속사는 단독 청크
    const conjMatch = clause.match(
      /^(and|but|or|because|although|when|whenever|while|if|so|after|before)\b(.*)$/i,
    );
    if (conjMatch) {
      chunks.push(conjMatch[1]!);
      const rest = conjMatch[2]!.trim();
      if (rest) {
        chunks.push(...chunkWords(rest.split(/\s+/).filter(Boolean), stored));
      }
      continue;
    }
    chunks.push(...chunkWords(clause.split(/\s+/).filter(Boolean), stored));
  }

  return sanitizeChunkParts(
    chunks.map((c) => c.replace(/\s+/g, " ").trim()).filter(Boolean),
  );
}

/* ------------------------------------------------------------------ */
/* 한글 청크                                                            */
/* ------------------------------------------------------------------ */

/**
 * 한글은 어순이 영어와 달라서 어절을 기계적으로 2개씩 묶으면
 * "그녀는 친구들에 / 대해 알아볼" 처럼 의미 단위 한가운데가 끊긴다.
 * 그래서 어절 사이 경계마다 점수를 매기고, 점수가 높은 곳에서만 끊는다.
 */

/**
 * 조사로 끝나면 뒤에서 끊는다. 은/는/이/가/의/에/에서가 여기 포함된다.
 * (`의`는 관형격이지만 "그들의 / 대답이"처럼 끊는 게 문제은행 스타일)
 */
const KO_PARTICLE_END =
  /(?:은|는|을|를|이|가|의|에|에서|에게|한테|께|으로|로|와|과|랑|도|만|까지|부터|보다|처럼|마다|조차|밖에)$/;

/** 연결어미로 끝나면 절 경계라 끊기 좋음 */
const KO_CONNECTIVE_END =
  /(?:고|며|면서|지만|아서|어서|여서|니까|으니|면|때|데|다고|라고|는지|은지|거나|든지|려고|도록|자마자)$/;

/** 관형형으로 끝나면 뒤 명사에 붙어야 함 (다양한 / 가벼운 / 지났던) */
const KO_ADNOMINAL_END = /(?:한|운|던|린|난|든)$/;

/**
 * `-는`/`-은`은 조사(그녀는)와 관형형 어미(기르는)의 형태가 같다.
 * 조사 쪽을 끊기로 한 이상, 관형형인 용언은 여기서 되돌려 준다.
 */
const KO_ADNOMINAL_VERB =
  /(?:하는|되는|있는|없는|가는|오는|보는|주는|사는|먹는|읽는|쓰는|타는|자는|웃는|우는|듣는|찾는|받는|넣는|아는|모르는|만드는|기르는|그리는|나오는|들어가는|좋아하는|싫어하는)$/;

/**
 * `-은`으로 끝나는 관형형은 주제 보조사 `은`과 형태가 같아 정규식으로 못 가른다
 * ("많은 책" vs "책은"). 자주 쓰는 것만 따로 적어 둔다.
 */
const KO_ADNOMINAL_WORD =
  /^(많은|적은|좋은|나쁜|작은|큰|긴|짧은|같은|다른|어린|늙은|높은|낮은|깊은|얕은|밝은|넓은|좁은|둥근|붉은|이런|그런|저런|어떤)$/;

/** 뒤 명사를 반드시 꾸미는 관형사 */
const KO_DETERMINER =
  /^(그|이|저|어느|어떤|무슨|웬|뭔|아무|모든|온|온갖|각|몇|몇몇|여러|새|헌|딴|다른|같은|첫|첫째|두|세)$/;

/** `-해`, `-여`, `-서` 같은 부사형 어미 — 절 경계이긴 하나 조사보다는 약함 */
const KO_CONNECTIVE_WEAK = /(?:해|여|서|게|도록)$/;

/** 앞 어절과 떨어질 수 없는 의존명사·후치 표현 (위치명사 포함 — "그림 아래에는") */
const KO_DEPENDENT =
  /^(대해|대한|대하여|위해|위한|위하여|때문에|때문|통해|통한|수|것|것을|것이|것은|것도|때|중|후|전|뿐|만큼|채|줄|편|따름|아래|위|앞|뒤|옆|안|밖|사이|가운데|근처|주위|동안)/;

/** 앞 용언에 붙는 보조용언 ("연구해 보고", "알고 싶었다") */
const KO_AUXILIARY =
  /^(싶|보고|보는|본다|보았|봤|버렸|드렸|주었|줬|말았|않|못하|있다|있었|있습|있어|있는|있을|옵니|오고 있)/;

/** 뒤 말을 꾸미는 부사 — 뒤에서 끊으면 어색 */
const KO_ADVERB = /^(더|아주|매우|잘|안|못|너무|가장|바로|꼭|좀|훨씬|정말)$/;

/** 어절 사이 경계 점수 — 높을수록 끊기 좋은 자리 */
function boundaryScore(before: string, after: string): number {
  let score = 0;
  let hasEnding = true;

  if (/[.!?]$/.test(before)) score += 4;
  else if (/,$/.test(before)) score += 2;
  else if (KO_PARTICLE_END.test(before)) score += 3;
  else if (KO_CONNECTIVE_END.test(before)) score += 3;
  else if (KO_CONNECTIVE_WEAK.test(before)) score += 1;
  else hasEnding = false;

  // 조사도 어미도 없는 맨 어절은 대개 뒤 말을 꾸미거나 복합어의 앞부분이다
  // ("집 그림이", "거센 비가") — 여기서 끊으면 조각이 말이 안 된다.
  if (!hasEnding) score -= 2;

  if (KO_ADNOMINAL_END.test(before)) score -= 5;
  if (KO_ADNOMINAL_WORD.test(before)) score -= 5;
  if (KO_ADNOMINAL_VERB.test(before)) score -= 5;
  if (KO_DETERMINER.test(before)) score -= 8;
  if (KO_ADVERB.test(before)) score -= 3;

  // 의존명사·보조용언은 앞말과 절대 떨어지면 안 되므로, 조사 가점(+3)을 확실히 덮는다
  if (KO_DEPENDENT.test(after)) score -= 8;
  if (KO_AUXILIARY.test(after)) score -= 8;

  return score;
}

/**
 * 점수가 높은 순서(동점이면 앞쪽)로 경계 `count`개를 고름.
 * 0점 이하는 아예 후보에서 뺀다 — 조각을 더 만들자고 어색한 자리를 끊느니
 * 조각 수가 적은 편이 낫다.
 */
function pickBoundaries(scores: number[], count: number): number[] {
  return scores
    .map((score, index) => ({ score, index }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, count)
    .map((entry) => entry.index)
    .sort((a, b) => a - b);
}

/** 한 청크가 이보다 길면 남은 경계 중 가장 나은 자리에서 한 번 더 나눔 */
const KO_MAX_WORDS_PER_CHUNK = 2;

/**
 * 점수가 높은 경계만 고르면 "민지는 책을 / 좋아했다. / 반면에 / 그녀의 친구는 동물을 좋아했다."
 * 처럼 청크 길이가 들쭉날쭉해진다. 너무 긴 청크는 안쪽에서 한 번 더 가른다.
 */
function rebalance(cuts: number[], scores: number[], total: number): number[] {
  const set = new Set(cuts);

  for (let guard = 0; guard < total; guard += 1) {
    const bounds = [-1, ...[...set].sort((a, b) => a - b), total - 1];
    let longestStart = -1;
    let longestLength = KO_MAX_WORDS_PER_CHUNK;

    for (let i = 0; i < bounds.length - 1; i += 1) {
      const length = bounds[i + 1]! - bounds[i]!;
      if (length > longestLength) {
        longestLength = length;
        longestStart = bounds[i]!;
      }
    }
    if (longestStart < 0) break;

    const end = longestStart + longestLength;
    let best = -1;
    let bestScore = 0;
    for (let index = longestStart + 1; index < end - 1; index += 1) {
      if (set.has(index)) continue;
      if (scores[index]! > bestScore) {
        bestScore = scores[index]!;
        best = index;
      }
    }
    if (best < 0) break;
    set.add(best);
  }

  return [...set].sort((a, b) => a - b);
}

/**
 * 한글 뜻 → 구나 단위 청크.
 * 이미 `/`가 있으면 교사가 직접 나눈 것으로 보되, 화살표·이모티콘은 뺀다.
 */
export function splitKoreanChunksPhrase(sentence: string): string[] {
  const trimmed = sentence.trim();
  if (!trimmed) return [];
  if (trimmed.includes("/")) {
    return sanitizeChunkParts(
      trimmed
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  const parts = stripDecorativeMarks(stripBrackets(trimmed))
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length <= 3) return parts;

  // 조사·어미로 끝나는 자리는 **전부** 끊는다.
  // 관형어·의존명사·보조용언 앞은 점수가 0 이하로 떨어져 후보에서 빠지므로,
  // 제한을 두지 않아도 "집 그림이" 같은 덩어리는 갈라지지 않는다.
  const scores = parts
    .slice(0, -1)
    .map((word, index) => boundaryScore(word, parts[index + 1]!));

  let cuts = pickBoundaries(scores, parts.length);

  // 끊을 자리를 못 찾으면 기존처럼 어절 2개씩 묶어 최소한의 청크는 만든다
  if (cuts.length === 0) {
    cuts = parts
      .slice(0, -1)
      .map((_, index) => index)
      .filter((index) => index % 2 === 1);
  }

  cuts = rebalance(cuts, scores, parts.length);

  const chunks: string[] = [];
  let start = 0;
  for (const cut of cuts) {
    chunks.push(parts.slice(start, cut + 1).join(" "));
    start = cut + 1;
  }
  if (start < parts.length) chunks.push(parts.slice(start).join(" "));

  return sanitizeChunkParts(chunks.filter(Boolean));
}

export function formatChunkLine(parts: string[]): string {
  return sanitizeChunkParts(parts).join(" / ");
}

/* ------------------------------------------------------------------ */
/* 숙어 표제어 정규화                                                   */
/* ------------------------------------------------------------------ */

const POSSESSIVE_WORDS = /^(?:my|your|his|her|its|our|their)$/i;
const REFLEXIVE_WORDS =
  /^(?:myself|yourself|himself|herself|itself|ourselves|yourselves|themselves)$/i;

/** be동사 활용형 → `be` (`is related to` → `be related to`) */
const BE_FORMS = /^(?:am|is|are|was|were|been|being)$/i;

/** `looked` → `look`. 불규칙형은 표에서, 규칙형은 접미사를 벗겨서 */
function deinflect(word: string): string[] {
  const w = word.toLowerCase();
  const out = [w];
  if (BE_FORMS.test(w)) out.push("be");
  const irregular = IRREGULAR_FORMS[w];
  if (irregular) out.push(irregular);
  for (const [suffix, replacement] of [
    ["ied", "y"], // hurried → hurry
    ["ies", "y"],
    ["ing", ""],
    ["ed", ""],
    ["es", ""],
    ["s", ""],
    ["d", ""],
  ] as const) {
    if (w.length > suffix.length + 1 && w.endsWith(suffix)) {
      const stem = w.slice(0, -suffix.length);
      out.push(stem + replacement);
      // 묵음 e가 떨어진 형태 복원 — `giving` → `giv` → `give`
      if (suffix === "ing" || suffix === "ed") out.push(`${stem}e`);
    }
  }
  // `stopped` → `stop`, `running` → `run` (자음 중복)
  for (const base of [...out]) {
    if (/(.)\1$/.test(base) && base.length > 2) out.push(base.slice(0, -1));
  }
  return [...new Set(out)];
}

/**
 * 문장에 나타난 숙어를 **사전 표제어 형태**로 되돌린다.
 * `looked at` → `look at`, `did her best` → `do one's best`.
 *
 * 굴절과 소유격 때문에 표면형을 그대로 키로 쓸 수 없다.
 * 반환값은 후보 목록 — 앞쪽이 더 그럴듯한 형태다.
 */
export function idiomLookupKeys(phrase: string): string[] {
  const words = phrase
    .toLowerCase()
    .replace(/[.,!?;:"']+$/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return [];

  // 소유격·재귀대명사를 슬롯 표기로 되돌린다
  const slotted = words.map((w) =>
    POSSESSIVE_WORDS.test(w)
      ? "one's"
      : REFLEXIVE_WORDS.test(w)
        ? "oneself"
        : w,
  );

  const keys = new Set<string>([words.join(" "), slotted.join(" ")]);
  // 첫 단어(대개 동사)의 굴절을 벗긴 형태도 후보에 넣는다
  for (const form of [words, slotted]) {
    for (const base of deinflect(form[0]!)) {
      keys.add([base, ...form.slice(1)].join(" "));
    }
  }
  return [...keys];
}
