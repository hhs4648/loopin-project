/**
 * 중등 영어 표제어 → 예문에 나올 수 있는 표면형.
 * `hold` / `held`처럼 철자가 달라도 같은 단어로 본다.
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

function irregularFormsOf(base: string): string[] {
  return IRREGULAR_BY_BASE.get(base.toLowerCase()) ?? [];
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
    if (
      /[^aeiou][aeiou][^aeiou]$/i.test(b) &&
      !/[wxy]$/i.test(b) &&
      b.length >= 3
    ) {
      const last = b.at(-1)!;
      push(`${b}${last}ed`);
      if (!SKIP_ING.has(b)) push(`${b}${last}ing`);
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
 * - `A` / `B` / `'A'` : 그 자리에 단어가 있어야 함 (`keep A from B` → `keep kids from playing`)
 */
const TILDE_CHARS = "[~～〜∼˜]";

function slotKind(token: string): "tilde" | "named" | null {
  const t = token.trim();
  if (new RegExp(`^${TILDE_CHARS}+(?:-?ing)?$`, "i").test(t)) return "tilde";
  if (/^(?:sb\.?|sth\.?)$/i.test(t)) return "named";
  if (/^(?:[''"‘’“”])?[A-DXYZ](?:[''’]s)?(?:[''"‘’“”])?$/.test(t)) return "named";
  return null;
}

/** `draw~ attention`처럼 붙인 ~도 자리로 본다 */
function lemmaTokens(lemma: string): string[] {
  return lemma
    .replace(new RegExp(`([A-Za-z0-9])(${TILDE_CHARS}+)`, "g"), "$1 $2")
    .replace(new RegExp(`(${TILDE_CHARS}+)([A-Za-z0-9])`, "g"), "$1 $2")
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

/**
 * 자리 표시가 있는 표제어를 본문에서 찾기 위한 패턴.
 * 가운데 `~`는 없어도 되고, `A`/`B`는 한 단어 이상, 맨 뒤 자리는 없어도 된다.
 */
export function lemmaSlotPattern(lemma: string): string | null {
  const tokens = lemmaTokens(lemma);
  if (tokens.length === 0 || !tokens.some(isLemmaSlotToken)) return null;

  const fill = "[A-Za-z0-9][A-Za-z0-9'-]*";
  const optionalFill = `(?:\\s+${fill}(?:\\s+${fill})*)?`;
  const requiredFill = `\\s+${fill}(?:\\s+${fill})*?`;
  const chunks: string[] = [];
  let inflectedLiteral = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const last = index === tokens.length - 1;
    const atStart = chunks.length === 0;
    const kind = slotKind(token);

    if (kind) {
      if (last) {
        chunks.push(`(?:\\s+${fill})?`);
      } else if (atStart) {
        chunks.push(kind === "tilde" ? `(?:${fill}(?:\\s+${fill})*\\s+)?` : fill);
      } else {
        chunks.push(kind === "tilde" ? optionalFill : requiredFill);
      }
      continue;
    }

    const forms = inflectedLiteral ? [token] : formsOfOneWord(token);
    inflectedLiteral = true;
    const alt = [...new Set(forms.map((form) => escapeRegExp(form)))].join("|");
    const body = forms.length > 1 ? `(?:${alt})` : alt;
    chunks.push(atStart ? `\\b${body}` : `\\s+${body}`);
  }
  chunks.push("\\b");
  return chunks.join("");
}

/** 표제어와 그 활용형. 여러 단어면 앞 단어만 굴절한다 (`be related to` → `was related to`). */
export function englishSurfaceForms(lemma: string): string[] {
  const words = lemma.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const heads = formsOfOneWord(words[0]!);
  if (words.length === 1) {
    return [...new Set(heads)].sort((a, b) => b.length - a.length);
  }
  const tail = words.slice(1).join(" ");
  return [...new Set(heads.map((head) => `${head} ${tail}`))].sort(
    (a, b) => b.length - a.length,
  );
}

export function isInflectedFormOf(surface: string, lemma: string): boolean {
  const token = surface.trim().replace(/\s+/g, " ");
  if (!token || !lemma.trim()) return false;
  const slot = lemmaSlotPattern(lemma);
  if (slot) {
    return new RegExp(`^(?:${slot})$`, "i").test(token);
  }
  const folded = token.toLowerCase();
  return englishSurfaceForms(lemma).some(
    (form) => form.replace(/\s+/g, " ").toLowerCase() === folded,
  );
}
