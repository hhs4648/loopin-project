"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { figmaRectStyle } from "./figma-rect";
import { PreviewFrame } from "./PreviewFrame";
import {
  COLOR_CORRECT_BG,
  COLOR_WRONG_BG,
  EXERCISE_CTA_CLASS,
  EXERCISE_FEEDBACK_HINT_CLASS,
  EXERCISE_INPUT_EN_CLASS,
  EXERCISE_OPTION_EN_CLASS,
  EXERCISE_PASSAGE_KO_CLASS,
  exerciseFeedbackTitleClass,
} from "./exercise-typography";

const ASSET = "/assets/student-preview/본문C.svg";
const PASSAGE = { x: 17, y: 252, w: 306, h: 84 };
const SENTENCE_BOX = { x: 24, y: 344, w: 345, h: 137 };
const SUBMIT_BTN = { x: 30, y: 751, w: 333, h: 60 };
const SUBMIT_BTN_MASK = { x: 26, y: 747, w: 341, h: 68 };
const FEEDBACK_SHEET = { x: 0, y: 648, w: 393, h: 204 };

export type BodyTextCQuestion = {
  id: string;
  promptKo: string;
  keywords: string[];
  exampleEn: string;
};

type BodyTextCDisplayChar =
  | { kind: "hint" | "filled" | "blank"; char: string; typeIndex: number }
  | { kind: "punct"; char: string }
  | { kind: "gap" };

function countBodyTextCTypeableLetters(exampleEn: string): number {
  return exampleEn.trim().split("").filter((ch) => /[A-Za-z]/.test(ch)).length;
}

function reconstructBodyTextCAnswer(
  exampleEn: string,
  typedLetters: string,
): string {
  const target = exampleEn.trim();
  let letterIndex = 0;
  let out = "";

  for (let i = 0; i < target.length; i += 1) {
    const ch = target[i]!;
    if (/[A-Za-z]/.test(ch)) {
      out += typedLetters[letterIndex] ?? "";
      letterIndex += 1;
    } else {
      out += ch;
    }
  }

  return out;
}

function buildBodyTextCDisplayChars(
  exampleEn: string,
  typedLetters: string,
): BodyTextCDisplayChar[] {
  const target = exampleEn.trim();
  const chars: BodyTextCDisplayChar[] = [];
  let letterIndex = 0;

  for (let i = 0; i < target.length; i += 1) {
    const ch = target[i]!;

    if (/\s/.test(ch)) {
      chars.push({ kind: "gap" });
      continue;
    }

    if (/[^A-Za-z]/.test(ch)) {
      chars.push({ kind: "punct", char: ch });
      continue;
    }

    const isWordStart =
      i === 0 ||
      /\s/.test(target[i - 1]!) ||
      /[^A-Za-z\s]/.test(target[i - 1]!);

    const typed = typedLetters[letterIndex];
    if (typed !== undefined && typed !== "") {
      chars.push({ kind: "filled", char: typed, typeIndex: letterIndex });
    } else if (isWordStart) {
      chars.push({ kind: "hint", char: ch, typeIndex: letterIndex });
    } else {
      chars.push({ kind: "blank", char: "_", typeIndex: letterIndex });
    }
    letterIndex += 1;
  }

  return chars;
}

function groupBodyTextCDisplayWords(
  chars: BodyTextCDisplayChar[],
): BodyTextCDisplayChar[][] {
  const words: BodyTextCDisplayChar[][] = [];
  let current: BodyTextCDisplayChar[] = [];

  for (const ch of chars) {
    if (ch.kind === "gap") {
      if (current.length > 0) {
        words.push(current);
        current = [];
      }
      continue;
    }
    current.push(ch);
  }
  if (current.length > 0) words.push(current);
  return words;
}

function normalizeBodyTextCAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\./g, "");
}

function matchesBodyTextCAnswer(
  answer: string,
  question: BodyTextCQuestion,
): boolean {
  return (
    normalizeBodyTextCAnswer(answer) ===
    normalizeBodyTextCAnswer(question.exampleEn)
  );
}

function displayCharClass(ch: BodyTextCDisplayChar): string {
  if (ch.kind === "filled") return "text-[#1F242E]";
  if (ch.kind === "hint") return "text-[#64748B]";
  if (ch.kind === "punct") return "text-[#1F242E]";
  return "text-[#9AA4B4]";
}

function displayCharText(ch: BodyTextCDisplayChar): string {
  if (ch.kind === "blank") return "_";
  if (ch.kind === "gap") return "";
  return ch.char;
}

/** Single-question 영작 preview — port of latest BodyTextCScreen (letter slots). */
export function BodyTextCPreview({ question }: { question: BodyTextCQuestion }) {
  const [typedLetters, setTypedLetters] = useState("");
  const [result, setResult] = useState<"playing" | "correct" | "wrong">(
    "playing",
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const typeableCount = useMemo(
    () => countBodyTextCTypeableLetters(question.exampleEn),
    [question.exampleEn],
  );
  const reconstructedAnswer = useMemo(
    () => reconstructBodyTextCAnswer(question.exampleEn, typedLetters),
    [question.exampleEn, typedLetters],
  );
  const displayWords = useMemo(
    () =>
      groupBodyTextCDisplayWords(
        buildBodyTextCDisplayChars(question.exampleEn, typedLetters),
      ),
    [question.exampleEn, typedLetters],
  );

  const hasAnswer = typedLetters.length > 0;
  const isPlaying = result === "playing";
  const showFeedback = result !== "playing";

  useEffect(() => {
    setTypedLetters("");
    setResult("playing");
  }, [question.id]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [isPlaying, question.id]);

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!isPlaying || !hasAnswer) return;
    const isCorrect = matchesBodyTextCAnswer(reconstructedAnswer, question);
    setResult(isCorrect ? "correct" : "wrong");
  };

  const handleRetry = () => {
    setTypedLetters("");
    setResult("playing");
  };

  const handleLetterInput = (raw: string) => {
    const lettersOnly = raw.replace(/[^A-Za-z]/g, "").slice(0, typeableCount);
    setTypedLetters(lettersOnly);
  };

  const focusInput = () => {
    if (!isPlaying) return;
    inputRef.current?.focus();
  };

  return (
    <PreviewFrame src={ASSET} alt="본문 C">
      <div
        className={`absolute inset-0 ${showFeedback ? "pointer-events-none" : ""}`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute bg-white"
          style={figmaRectStyle(PASSAGE)}
        />
        <div
          className="pointer-events-none absolute flex items-center justify-center px-5"
          style={figmaRectStyle(PASSAGE)}
        >
          {question.promptKo ? (
            <p
              className={`line-clamp-3 w-full ${EXERCISE_PASSAGE_KO_CLASS} text-[15px] leading-snug text-[#1F242E]`}
            >
              {question.promptKo}
            </p>
          ) : null}
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[12px] bg-[#F6F9FD]"
          style={figmaRectStyle(SENTENCE_BOX)}
        />
        <form
          id="body-text-c-preview-form"
          className="absolute z-[2] flex cursor-text flex-col overflow-hidden px-4 py-4"
          style={figmaRectStyle(SENTENCE_BOX)}
          onSubmit={handleSubmit}
          onClick={focusInput}
        >
          <div
            aria-hidden
            className="pointer-events-none flex min-h-0 flex-1 flex-wrap content-center justify-center gap-x-6 gap-y-3"
          >
            {displayWords.map((word, wordIndex) => (
              <span
                key={`word-${wordIndex}`}
                className={`inline-flex items-center gap-[6px] leading-none ${EXERCISE_OPTION_EN_CLASS}`}
              >
                {word.map((ch, charIndex) => {
                  const isTypeable =
                    ch.kind === "hint" ||
                    ch.kind === "blank" ||
                    ch.kind === "filled";
                  const isCaret =
                    isPlaying &&
                    isTypeable &&
                    ch.typeIndex === typedLetters.length;
                  const isHint = ch.kind === "hint";
                  const showUnderline =
                    ch.kind === "hint" ||
                    ch.kind === "blank" ||
                    ch.kind === "filled";

                  return (
                    <span
                      key={`ch-${wordIndex}-${charIndex}`}
                      className={`relative inline-flex w-[0.85em] flex-col items-center justify-end rounded-sm pb-[2px] ${displayCharClass(ch)} ${
                        isHint ? "bg-[#E2E8F0]" : ""
                      } ${isCaret ? "bg-[#DCEBFF] text-[#1F242E]" : ""} ${
                        showUnderline ? "border-b-2 border-current" : ""
                      }`}
                    >
                      {ch.kind === "blank" ? "\u00A0" : displayCharText(ch)}
                    </span>
                  );
                })}
              </span>
            ))}
          </div>

          <input
            ref={inputRef}
            type="text"
            lang="en"
            inputMode="text"
            enterKeyHint="done"
            value={typedLetters}
            maxLength={typeableCount}
            onChange={(event) => handleLetterInput(event.target.value)}
            disabled={!isPlaying}
            aria-label="영어 예문 입력"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            pattern="[A-Za-z]*"
            className={`absolute inset-0 z-[1] h-full w-full cursor-text opacity-0 ${EXERCISE_INPUT_EN_CLASS}`}
          />
        </form>

        {hasAnswer ? (
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-[20px] bg-white"
            style={figmaRectStyle(SUBMIT_BTN_MASK)}
          />
        ) : null}

        <button
          type="submit"
          form="body-text-c-preview-form"
          disabled={!hasAnswer || !isPlaying}
          className={`absolute flex items-center justify-center rounded-2xl ${EXERCISE_CTA_CLASS} text-white ${
            hasAnswer
              ? "z-[1] cursor-pointer border border-white bg-[#3C86FF]"
              : "cursor-default bg-transparent"
          }`}
          style={figmaRectStyle(SUBMIT_BTN)}
          onClick={() => handleSubmit()}
        >
          {hasAnswer ? "제출하기" : null}
        </button>
      </div>

      {showFeedback ? (
        <div className="absolute z-20" style={figmaRectStyle(FEEDBACK_SHEET)}>
          <div className="flex h-full flex-col rounded-t-[24px] border-t border-[#E4E7EA] bg-white px-[30px] pb-[41px] pt-[30px] shadow-[0_-10px_24px_rgba(0,0,0,0.06)]">
            <p className={exerciseFeedbackTitleClass(result === "correct")}>
              {result === "correct" ? "정답입니다." : "오답입니다."}
            </p>
            <p className={EXERCISE_FEEDBACK_HINT_CLASS}>
              예문은 {question.exampleEn}
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
      ) : null}
    </PreviewFrame>
  );
}
