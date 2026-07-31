/**
 * Ported (trimmed) from loopin-webapp's `src/components/exercise/exercise-typography.ts`
 * for the teacher-side student-preview modal. Kept verbatim so the preview reads
 * identically to the student app.
 */

export const COLOR_TEXT_MUTED = "text-[#9E9FA7]";
export const COLOR_CORRECT = "text-[#22C55E]";
export const COLOR_WRONG = "text-[#FF4B4B]";
export const COLOR_CORRECT_BG = "bg-[#22C55E]";
export const COLOR_WRONG_BG = "bg-[#FF4B4B]";

const EXERCISE_EN_BASE =
  "text-[17px] font-semibold leading-snug tracking-[-0.01em] text-[#1E1E1E] antialiased";

const EXERCISE_KO_BASE = "text-[13px] font-medium leading-snug text-[#1E293B]";

export function exerciseFeedbackTitleClass(isCorrect: boolean) {
  return `text-center text-[22px] font-bold leading-none ${
    isCorrect ? COLOR_CORRECT : COLOR_WRONG
  }`;
}

export const EXERCISE_FEEDBACK_HINT_CLASS =
  "mt-4 text-center text-[15px] font-semibold leading-snug text-[#374151]";

export const EXERCISE_CTA_CLASS = "text-[17px] font-bold text-white";

export const EXERCISE_PASSAGE_KO_CLASS = EXERCISE_KO_BASE;
export const EXERCISE_HINT_KO_CLASS = EXERCISE_KO_BASE;
export const EXERCISE_PASSAGE_EN_CLASS = EXERCISE_EN_BASE;
export const EXERCISE_OPTION_EN_CLASS = EXERCISE_EN_BASE;

export const EXERCISE_HEADWORD_CLASS =
  "text-[28px] font-bold leading-none tracking-[-0.02em] text-[#1E1E1E] antialiased";

export const EXERCISE_INPUT_EN_CLASS = `${EXERCISE_EN_BASE} w-full outline-none placeholder:font-normal placeholder:text-[#9AA4B4]`;

export const EXERCISE_EMPTY_HINT_CLASS =
  "text-[17px] font-medium leading-snug text-[#9AA4B4] antialiased";

export const EXERCISE_GRAMMAR_BLANK_CLASS = `inline-flex h-[29px] min-w-[48px] shrink-0 items-center justify-center rounded-[10.5px] border-[3px] border-[#3C86FF] bg-[#EFF1FE] px-2 ${EXERCISE_EN_BASE} leading-none`;

export const EXERCISE_OX_LABEL_CLASS =
  "text-[52px] font-bold leading-none antialiased";

export const EXERCISE_MATCH_TILE_EN_CLASS = EXERCISE_EN_BASE;
export const EXERCISE_MATCH_TILE_KO_CLASS = `text-[17px] font-semibold leading-snug tracking-[-0.02em] text-[#1E1E1E]`;

export const EXERCISE_PASSAGE_KO_MUTED_CLASS =
  "text-[13px] font-medium leading-snug text-[#6B7280]";

export function exerciseOptionEnStateClass(state: "idle" | "correct" | "wrong") {
  switch (state) {
    case "correct":
      return `${EXERCISE_OPTION_EN_CLASS} text-[#22C55E]`;
    case "wrong":
      return `${EXERCISE_OPTION_EN_CLASS} text-[#EF4444]`;
    default:
      return EXERCISE_OPTION_EN_CLASS;
  }
}

export function exerciseOxLabelClass(
  state: "idle" | "correct" | "wrong",
  optionId: "o" | "x",
) {
  if (state === "correct") return `${EXERCISE_OX_LABEL_CLASS} text-[#22C55E]`;
  if (state === "wrong") return `${EXERCISE_OX_LABEL_CLASS} text-[#EF4444]`;
  return optionId === "o"
    ? `${EXERCISE_OX_LABEL_CLASS} text-[#11C882]`
    : `${EXERCISE_OX_LABEL_CLASS} text-[#FF414E]`;
}

export const GRAMMAR_PASSAGE_BLANK_CLASS = EXERCISE_GRAMMAR_BLANK_CLASS;
export const GRAMMAR_PASSAGE_TEXT_CLASS = EXERCISE_PASSAGE_EN_CLASS;
export const GRAMMAR_OPTION_TEXT_CLASS = EXERCISE_OPTION_EN_CLASS;
