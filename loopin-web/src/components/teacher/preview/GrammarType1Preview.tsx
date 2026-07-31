"use client";

import { useState } from "react";
import { figmaRectStyle } from "./figma-rect";
import { PreviewFrame } from "./PreviewFrame";
import {
  COLOR_CORRECT_BG,
  COLOR_WRONG_BG,
  EXERCISE_CTA_CLASS,
  EXERCISE_GRAMMAR_BLANK_CLASS,
  EXERCISE_PASSAGE_EN_CLASS,
  exerciseFeedbackTitleClass,
  exerciseOptionEnStateClass,
} from "./exercise-typography";

const ASSET = "/assets/student-preview/유형1.svg";
const PASSAGE = { x: 21, y: 253, w: 350, h: 179 };
const PASSAGE_ENGLISH = { x: 33, y: 329.5, w: 327, h: 64 };
const OPTION_BOXES = [
  { x: 21, y: 454, w: 164, h: 90 },
  { x: 207, y: 454, w: 164, h: 90 },
] as const;
const FEEDBACK_SHEET = { x: 0, y: 648, w: 393, h: 204 };

export type GrammarType1Option = { id: string; label: string };
export type GrammarType1Question = {
  id: string;
  maskPassage: boolean;
  passageBefore: string;
  passageAfter: string;
  options: GrammarType1Option[];
  correctOptionId: string;
};

type OptionVisualState = "idle" | "correct" | "wrong";

function optionFrameClass(state: OptionVisualState) {
  const base = "box-border rounded-[9px] border-2";
  switch (state) {
    case "correct":
      return `${base} border-[#22C55E] bg-[#F0FDF4] shadow-[0_0_14px_rgba(34,197,94,0.75)]`;
    case "wrong":
      return `${base} border-[#EF4444] bg-[#FEF2F2]`;
    default:
      /* Figma 박스가 보이도록 idle은 테두리 없음 — loopin-webapp GrammarType1Screen */
      return `${base} border-transparent bg-white`;
  }
}

/** Single 2-choice 선택형 문법 preview — trimmed port of GrammarType1Screen. */
export function GrammarType1Preview({ question }: { question: GrammarType1Question }) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const locked = result !== null;
  const selectedOption = question.options.find((option) => option.id === selectedOptionId);

  const getState = (optionId: string): OptionVisualState => {
    if (!selectedOptionId || selectedOptionId !== optionId) return "idle";
    return result === "correct" ? "correct" : "wrong";
  };

  const handleClick = (optionId: string) => {
    if (locked) return;
    setSelectedOptionId(optionId);
    setResult(optionId === question.correctOptionId ? "correct" : "wrong");
  };

  const handleRetry = () => {
    setSelectedOptionId(null);
    setResult(null);
  };

  return (
    <PreviewFrame src={ASSET} alt="문법 유형 1">
      <div className={`absolute inset-0 ${result ? "pointer-events-none" : ""}`}>
        {question.maskPassage && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute rounded-[19px] bg-white"
              style={figmaRectStyle(PASSAGE)}
            />
            <div
              className="pointer-events-none absolute flex flex-col items-center gap-y-1"
              style={figmaRectStyle(PASSAGE_ENGLISH)}
            >
              <div className="flex flex-wrap items-center justify-center gap-x-1.5">
                <span className={EXERCISE_PASSAGE_EN_CLASS}>{question.passageBefore}</span>
                <span className={EXERCISE_GRAMMAR_BLANK_CLASS}>
                  {locked ? (selectedOption?.label ?? "") : ""}
                </span>
              </div>
              <p className={`${EXERCISE_PASSAGE_EN_CLASS} text-center`}>{question.passageAfter}</p>
            </div>
          </>
        )}

        {question.options.map((option, index) => {
          const state = getState(option.id);
          const box = OPTION_BOXES[index];
          if (!box) return null;
          return (
            <button
              key={option.id}
              type="button"
              disabled={locked}
              className={`absolute flex cursor-pointer items-center justify-center ${optionFrameClass(state)}`}
              style={figmaRectStyle(box)}
              onClick={() => handleClick(option.id)}
            >
              <span className={exerciseOptionEnStateClass(state)}>{option.label}</span>
            </button>
          );
        })}
      </div>

      {result && (
        <div className="absolute z-20" style={figmaRectStyle(FEEDBACK_SHEET)}>
          <div className="flex h-full flex-col rounded-t-[24px] border-t border-[#E4E7EA] bg-white px-[30px] pb-[41px] pt-[30px] shadow-[0_-10px_24px_rgba(0,0,0,0.06)]">
            <p className={exerciseFeedbackTitleClass(result === "correct")}>
              {result === "correct" ? "정답입니다." : "오답입니다."}
            </p>
            <button
              type="button"
              className={`mt-auto flex h-[60px] w-full cursor-pointer items-center justify-center rounded-2xl border border-white ${EXERCISE_CTA_CLASS} ${
                result === "correct" ? COLOR_CORRECT_BG : COLOR_WRONG_BG
              }`}
              onClick={handleRetry}
            >
              다시 풀어보기
            </button>
          </div>
        </div>
      )}
    </PreviewFrame>
  );
}
