"use client";

import { useMemo, useRef, useState } from "react";
import { figmaRectStyle } from "./figma-rect";
import { PreviewFrame } from "./PreviewFrame";
import {
  EXERCISE_HEADWORD_CLASS,
  exerciseOptionEnStateClass,
} from "./exercise-typography";

const ASSET = "/assets/student-preview/단어B_시작.svg";
const FEEDBACK_MS = 500;

const PROMPT_WORD = { x: 130, y: 238, w: 140, h: 36 };
const OPTIONS = [
  { x: 20, y: 325, w: 354, h: 76 },
  { x: 20, y: 417, w: 354, h: 76 },
  { x: 20, y: 509, w: 354, h: 76 },
] as const;

export type WordQuizQuestion = {
  id: string;
  word: string;
  correctAnswer: string;
  options: string[];
};

type OptionVisualState = "idle" | "correct" | "wrong";

function optionFrameClass(state: OptionVisualState) {
  const base = "box-border border-[3px]";
  switch (state) {
    case "correct":
      return `${base} rounded-2xl border-[#22C55E] bg-[#F0FDF4]`;
    case "wrong":
      return `${base} rounded-2xl border-[#EF4444] bg-[#FEF2F2]`;
    default:
      return `${base} rounded-2xl border-transparent bg-[#FEFEFE]`;
  }
}

/** Single 3-choice word-quiz preview — trimmed port of WordQuizScreen. */
export function WordQuizPreview({ question }: { question: WordQuizQuestion }) {
  const options = useMemo(() => question.options, [question]);
  const [feedback, setFeedback] = useState<{
    kind: "correct" | "wrong";
    option: string;
  } | null>(null);
  const [locked, setLocked] = useState(false);
  const timerRef = useRef<number | null>(null);

  const getState = (option: string): OptionVisualState => {
    if (!feedback || feedback.option !== option) return "idle";
    return feedback.kind;
  };

  const handleClick = (option: string) => {
    if (locked) return;
    const isCorrect = option === question.correctAnswer;
    setLocked(true);
    setFeedback({ kind: isCorrect ? "correct" : "wrong", option });
    timerRef.current = window.setTimeout(() => {
      setFeedback(null);
      setLocked(false);
    }, FEEDBACK_MS);
  };

  return (
    <PreviewFrame src={ASSET} alt="단어 퀴즈">
      <div className="absolute inset-0">
        <div
          className="pointer-events-none absolute flex items-center justify-center bg-white"
          style={figmaRectStyle(PROMPT_WORD)}
        >
          <span className={EXERCISE_HEADWORD_CLASS}>{question.word}</span>
        </div>

        {options.map((option, index) => {
          const state = getState(option);
          const layout = OPTIONS[index];
          if (!layout) return null;
          return (
            <button
              key={`${question.id}-${option}`}
              type="button"
              aria-label={option}
              disabled={locked}
              className={`absolute flex items-center justify-center px-6 text-center ${optionFrameClass(state)}`}
              style={figmaRectStyle(layout)}
              onClick={() => handleClick(option)}
            >
              <span className={exerciseOptionEnStateClass(state)}>
                {option}
              </span>
            </button>
          );
        })}
      </div>
    </PreviewFrame>
  );
}
