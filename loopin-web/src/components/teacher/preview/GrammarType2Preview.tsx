"use client";

import { useState, type ReactNode } from "react";
import { figmaRectStyle } from "./figma-rect";
import { PreviewFrame } from "./PreviewFrame";
import {
  COLOR_CORRECT_BG,
  COLOR_WRONG_BG,
  EXERCISE_CTA_CLASS,
  EXERCISE_PASSAGE_EN_CLASS,
  exerciseFeedbackTitleClass,
  exerciseOptionEnStateClass,
  exerciseOxLabelClass,
} from "./exercise-typography";

const ASSET = "/assets/student-preview/유형2.svg";
const X_ASSET = "/assets/student-preview/유형2정답X.svg";
/** Figma — 지문 박스 (`유형2.svg`) */
const PASSAGE = { x: 21, y: 253, w: 350, h: 160 };
/** Figma — 지문 박스 (`유형2정답X.svg`) — OX와 y가 다름 */
const X_PASSAGE = { x: 22, y: 202, w: 350, h: 160 };
const OX_OPTION_BOXES = [
  { x: 21, y: 435, w: 164, h: 126 },
  { x: 207, y: 435, w: 164, h: 126 },
] as const;
const OX_OPTIONS: { id: "o" | "x"; label: string }[] = [
  { id: "o", label: "O" },
  { id: "x", label: "X" },
];
const X_OPTION_BOXES = [
  { x: 26, y: 391, w: 343, h: 76 },
  { x: 26, y: 483, w: 343, h: 76 },
  { x: 26, y: 575, w: 343, h: 76 },
] as const;
const FEEDBACK_SHEET = { x: 0, y: 648, w: 393, h: 204 };

export type GrammarType2WordOption = { id: string; label: string };

export type GrammarType2OxStep = {
  kind: "ox";
  id: string;
  maskPassage: boolean;
  passageLines?: string[];
  correctOptionId: "o" | "x";
};

export type GrammarType2WordChoiceStep = {
  kind: "word-choice";
  id: string;
  options: GrammarType2WordOption[];
  correctOptionId: string;
  maskPassage?: boolean;
  passageBefore?: string;
  wrongPart?: string;
  passageAfter?: string;
};

export type GrammarType2Step = GrammarType2OxStep | GrammarType2WordChoiceStep;

type OptionVisualState = "idle" | "correct" | "wrong";

function oxOptionFrameClass(state: OptionVisualState) {
  const base = "box-border rounded-[9px] border-2";
  switch (state) {
    case "correct":
      return `${base} border-[#22C55E] bg-[#F0FDF4] shadow-[0_0_14px_rgba(34,197,94,0.75)]`;
    case "wrong":
      return `${base} border-[#EF4444] bg-[#FEF2F2]`;
    default:
      /* Figma 박스가 보이도록 idle은 테두리 없음 — loopin-webapp GrammarType2Screen */
      return `${base} border-transparent bg-[#F9FBFB]`;
  }
}
function wordOptionFrameClass(state: OptionVisualState) {
  const base = "box-border rounded-[16px] border-2";
  switch (state) {
    case "correct":
      return `${base} border-[#22C55E] bg-[#F0FDF4] shadow-[0_0_14px_rgba(34,197,94,0.75)]`;
    case "wrong":
      return `${base} border-[#EF4444] bg-[#FEF2F2]`;
    default:
      return `${base} border-transparent bg-[#FEFEFE]`;
  }
}

function PassageMask({
  children,
  passageRect = PASSAGE,
}: {
  children: ReactNode;
  passageRect?: { x: number; y: number; w: number; h: number };
}) {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-[19px] bg-white"
        style={figmaRectStyle(passageRect)}
      />
      <div
        className="pointer-events-none absolute flex items-center justify-center px-6"
        style={figmaRectStyle(passageRect)}
      >
        {children}
      </div>
    </>
  );
}

/**
 * Single grammar item preview (OX, optionally followed by its correction step
 * when the answer is X) — trimmed port of GrammarType2Screen.
 */
export function GrammarType2Preview({ steps }: { steps: GrammarType2Step[] }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);

  const step = steps[stepIndex];
  if (!step) return null;
  const locked = result !== null;
  const isLastStep = stepIndex + 1 >= steps.length;

  const handleClick = (optionId: string) => {
    if (locked) return;
    setSelectedOptionId(optionId);
    setResult(optionId === step.correctOptionId ? "correct" : "wrong");
  };

  const handleContinue = () => {
    if (!isLastStep) {
      setStepIndex((index) => index + 1);
      setSelectedOptionId(null);
      setResult(null);
      return;
    }
    setStepIndex(0);
    setSelectedOptionId(null);
    setResult(null);
  };

  const getState = (optionId: string): OptionVisualState => {
    if (!selectedOptionId || selectedOptionId !== optionId) return "idle";
    return result === "correct" ? "correct" : "wrong";
  };

  return (
    <PreviewFrame
      key={step.id}
      src={step.kind === "word-choice" ? X_ASSET : ASSET}
      alt={step.kind === "word-choice" ? "문법 유형 2 정답 X" : "문법 유형 2"}
    >
      <div className={`absolute inset-0 ${result ? "pointer-events-none" : ""}`}>
        {step.kind === "ox" ? (
          <>
            {step.maskPassage && step.passageLines?.length ? (
              <PassageMask passageRect={PASSAGE}>
                <p className={`text-center ${EXERCISE_PASSAGE_EN_CLASS}`}>
                  {step.passageLines.join(" ")}
                </p>
              </PassageMask>
            ) : null}
            {OX_OPTIONS.map((option, index) => {
              const state = getState(option.id);
              const box = OX_OPTION_BOXES[index];
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={locked}
                  className={`absolute flex cursor-pointer items-center justify-center ${oxOptionFrameClass(state)}`}
                  style={figmaRectStyle(box)}
                  onClick={() => handleClick(option.id)}
                >
                  <span className={exerciseOxLabelClass(state, option.id)}>{option.label}</span>
                </button>
              );
            })}
          </>
        ) : (
          <>
            {step.maskPassage && step.wrongPart ? (
              <PassageMask passageRect={X_PASSAGE}>
                <p className={`text-center ${EXERCISE_PASSAGE_EN_CLASS}`}>
                  {step.passageBefore ? `${step.passageBefore} ` : null}
                  <span className="font-semibold text-[#EF4444] underline decoration-2 underline-offset-[3px]">
                    {step.wrongPart}
                  </span>
                  {step.passageAfter ? ` ${step.passageAfter}` : null}
                </p>
              </PassageMask>
            ) : null}
            {step.options.map((option, index) => {
              const state = getState(option.id);
              const box = X_OPTION_BOXES[index];
              if (!box) return null;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={locked}
                  className={`absolute flex cursor-pointer items-center justify-center px-4 ${wordOptionFrameClass(state)}`}
                  style={figmaRectStyle(box)}
                  onClick={() => handleClick(option.id)}
                >
                  <span className={exerciseOptionEnStateClass(state)}>{option.label}</span>
                </button>
              );
            })}
          </>
        )}
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
              onClick={handleContinue}
            >
              {isLastStep ? "다시 풀어보기" : "계속하기"}
            </button>
          </div>
        </div>
      )}
    </PreviewFrame>
  );
}
