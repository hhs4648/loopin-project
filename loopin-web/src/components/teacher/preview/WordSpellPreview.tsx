"use client";

import { useMemo, useState } from "react";
import { figmaRectStyle } from "./figma-rect";
import { useShrinkToFit } from "./use-shrink-to-fit";
import { PreviewFrame } from "./PreviewFrame";
import {
  COLOR_CORRECT_BG,
  COLOR_WRONG_BG,
  EXERCISE_CTA_CLASS,
  EXERCISE_FEEDBACK_HINT_CLASS,
  EXERCISE_OPTION_EN_CLASS,
  EXERCISE_PASSAGE_EN_CLASS,
  EXERCISE_PASSAGE_KO_MUTED_CLASS,
  exerciseFeedbackTitleClass,
} from "./exercise-typography";

import type { ClozePart } from "@/lib/word-cloze";

const ASSET = "/assets/student-preview/단어C.svg";

const CARD = { x: 24, y: 200, w: 345, h: 176 };
const CARD_TEXT = { x: 40, y: 220, w: 313, h: 148 };
const SLOTS_MASK = { x: 12, y: 400, w: 369, h: 120 };
const TRAY_MASK = { x: 12, y: 548, w: 369, h: 160 };
const SUBMIT_BTN = { x: 30, y: 751, w: 333, h: 60 };
const FEEDBACK_SHEET = { x: 0, y: 648, w: 393, h: 204 };

const SLOT_AREA = { x: 20, y: 408, w: 353, h: 44 };
const SLOT_ROW_GAP = 8;
const SLOT_TWO_ROW_THRESHOLD = 9;
const TRAY_AREA = { x: 20, w: 353 };
const TRAY_TILE = { w: 44, h: 52, row1Y: 568, row2Y: 630, row1Max: 6 };
const SLOT_GAP = 6;
const WORD_GAP = 12;
const PREFILLED_PREFIX = "prefill:";

export type WordSpellQuestion = {
  id: string;
  korean: string;
  englishBefore: string;
  englishAfter: string;
  answer: string;
  answerHint: string;
  parts?: ClozePart[];
};

type Tile = { id: string; letter: string; x: number; y: number; w: number; h: number };

function shuffleLetters(letters: string[]): string[] {
  const next = [...letters];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

function centerRowLayouts(count: number, y: number) {
  if (count <= 0) return [];
  const { w, h } = TRAY_TILE;
  const gap = count > 1 ? Math.min(12, (TRAY_AREA.w - count * w) / (count - 1)) : 0;
  const totalWidth = count * w + (count - 1) * gap;
  const startX = TRAY_AREA.x + (TRAY_AREA.w - totalWidth) / 2;
  return Array.from({ length: count }, (_, index) => ({
    x: startX + index * (w + gap),
    y,
    w,
    h,
  }));
}

function getSpellingLetters(answer: string): string[] {
  return answer.replace(/\s/g, "").split("");
}
function getSpaceAfterSlotIndices(answer: string): number[] {
  const indices: number[] = [];
  let letterIndex = 0;
  for (const char of answer) {
    if (char === " ") {
      indices.push(letterIndex - 1);
      continue;
    }
    letterIndex += 1;
  }
  return indices;
}

function buildQuestionTiles(question: WordSpellQuestion): Tile[] {
  const shuffled = shuffleLetters(getSpellingLetters(question.answer).slice(1));
  const positions = getTrayPositions(shuffled.length);
  return shuffled.map((letter, index) => ({
    id: `${question.id}-tile-${index}`,
    letter,
    ...positions[index]!,
  }));
}

function getTrayPositions(count: number) {
  const { row1Y, row2Y, row1Max } = TRAY_TILE;
  if (count <= row1Max) return centerRowLayouts(count, row1Y);
  return [
    ...centerRowLayouts(row1Max, row1Y),
    ...centerRowLayouts(count - row1Max, row2Y),
  ];
}

function buildQuestionState(question: WordSpellQuestion) {
  const letters = getSpellingLetters(question.answer);
  const prefilled: Tile = {
    id: `${PREFILLED_PREFIX}${question.id}:0`,
    letter: letters[0] ?? "",
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
  const trayTiles = buildQuestionTiles(question);
  const slots = Array.from({ length: letters.length }, () => null) as (
    | string
    | null
  )[];
  if (letters.length > 0) slots[0] = prefilled.id;
  return { tiles: [prefilled, ...trayTiles], slots };
}

function isPrefilledTileId(tileId: string | null): boolean {
  return tileId?.startsWith(PREFILLED_PREFIX) ?? false;
}
function isPrefilledSlotIndex(slotIndex: number, slots: (string | null)[]): boolean {
  return slotIndex === 0 && isPrefilledTileId(slots[0] ?? null);
}
function getTile(tiles: Tile[], id: string): Tile | undefined {
  return tiles.find((tile) => tile.id === id);
}
function buildWordFromSlots(slots: (string | null)[], tiles: Tile[]): string {
  return slots.map((tileId) => (tileId ? (getTile(tiles, tileId)?.letter ?? "") : "")).join("");
}
function matchesSpellAnswer(built: string, answer: string): boolean {
  return built === answer.replace(/\s/g, "");
}

function getAnswerWordGroups(slotCount: number, spaceAfterSlotIndices: number[]): number[][] {
  if (slotCount <= 0) return [];
  const groups: number[][] = [];
  let current: number[] = [];
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    current.push(slotIndex);
    if (spaceAfterSlotIndices.includes(slotIndex) || slotIndex === slotCount - 1) {
      groups.push(current);
      current = [];
    }
  }
  return groups;
}

function layoutSlotRow(
  startIndex: number,
  endIndex: number,
  rowY: number,
  spaceAfterSlotIndices: number[],
) {
  const count = endIndex - startIndex;
  if (count <= 0) return [];
  const { x, w: areaW, h } = SLOT_AREA;
  const maxSlotW = 37.13;
  const minSlotW = 26;
  const rowSpaces = spaceAfterSlotIndices.filter(
    (index) => index >= startIndex && index < endIndex - 1,
  );
  const wordGapCount = rowSpaces.length;
  const normalGapCount = Math.max(0, count - 1 - wordGapCount);
  const totalGapWidth = wordGapCount * WORD_GAP + normalGapCount * SLOT_GAP;
  const slotW = Math.max(minSlotW, Math.min(maxSlotW, (areaW - totalGapWidth) / count));
  const totalWidth = count * slotW + totalGapWidth;
  let currentX = x + (areaW - totalWidth) / 2;
  return Array.from({ length: count }, (_, offset) => {
    const slotIndex = startIndex + offset;
    const layout = { x: currentX, y: rowY, w: slotW, h };
    if (offset < count - 1) {
      const gap = spaceAfterSlotIndices.includes(slotIndex) ? WORD_GAP : SLOT_GAP;
      currentX += slotW + gap;
    }
    return layout;
  });
}

function pickTwoRowSplitIndex(count: number, spaceAfterSlotIndices: number[]): number {
  const ideal = Math.ceil(count / 2);
  const spacesNearMiddle = spaceAfterSlotIndices
    .map((index) => index + 1)
    .filter((split) => split > 0 && split < count)
    .sort((left, right) => Math.abs(left - ideal) - Math.abs(right - ideal));
  return spacesNearMiddle[0] ?? ideal;
}

function getSlotLayouts(count: number, spaceAfterSlotIndices: number[]) {
  if (count <= 0) return [];
  const { y } = SLOT_AREA;
  if (count <= SLOT_TWO_ROW_THRESHOLD) return layoutSlotRow(0, count, y, spaceAfterSlotIndices);
  const splitAt = pickTwoRowSplitIndex(count, spaceAfterSlotIndices);
  return [
    ...layoutSlotRow(0, splitAt, y, spaceAfterSlotIndices),
    ...layoutSlotRow(splitAt, count, y + SLOT_AREA.h + SLOT_ROW_GAP, spaceAfterSlotIndices),
  ];
}

function trayTileClass() {
  return "box-border rounded-[14px] border-[3px] border-transparent bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)]";
}
function emptySlotClass() {
  return "box-border rounded-2xl border border-[#E2E8F2] bg-[#F4F7FB]";
}
function filledSlotClass(prefilled = false) {
  if (prefilled) return "box-border rounded-2xl border-[3px] border-[#CBD5E1] bg-[#F1F5F9]";
  return "box-border rounded-2xl border-[3px] border-[#3C86FF] bg-white";
}

function InlineAnswerLine({
  slotStart = 0,
  slotEnd,
  slots,
  tiles,
  spaceAfterSlotIndices,
  disabled,
  onSlotClick,
}: {
  slotStart?: number;
  slotEnd: number;
  slots: (string | null)[];
  tiles: Tile[];
  spaceAfterSlotIndices: number[];
  disabled: boolean;
  onSlotClick: (slotIndex: number) => void;
}) {
  const slotCount = slotEnd - slotStart;
  const slotWidthClass =
    slotCount >= 12 ? "min-w-[9px]" : slotCount >= 9 ? "min-w-[10px]" : "min-w-[12px]";
  const localSpaces = spaceAfterSlotIndices
    .filter((index) => index >= slotStart && index < slotEnd - 1)
    .map((index) => index - slotStart);
  const wordGroups = getAnswerWordGroups(slotCount, localSpaces);

  return (
    <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-[0.35em] gap-y-1 align-baseline">
      {wordGroups.map((group, groupIndex) => (
        <span
          key={`blank-word-${slotStart}-${groupIndex}`}
          className="inline-flex shrink items-baseline border-b-2 border-[#1E1E1E] pb-px"
        >
          {group.map((localIndex) => {
            const slotIndex = slotStart + localIndex;
            const tileId = slots[slotIndex];
            const letter = tileId ? getTile(tiles, tileId)?.letter : null;
            const isFilled = Boolean(letter);
            const isPrefilled = isPrefilledSlotIndex(slotIndex, slots);
            return (
              <button
                key={`inline-${slotIndex}`}
                type="button"
                disabled={disabled || !isFilled || isPrefilled}
                className={`${slotWidthClass} px-px text-center ${EXERCISE_OPTION_EN_CLASS} leading-none ${
                  isPrefilled
                    ? "cursor-default text-[#64748B]"
                    : isFilled
                      ? "cursor-pointer"
                      : "cursor-default text-[#9CA3AF]"
                }`}
                onClick={() => {
                  if (isFilled && !isPrefilled) onSlotClick(slotIndex);
                }}
              >
                {isFilled ? letter : "_"}
              </button>
            );
          })}
        </span>
      ))}
    </span>
  );
}

/** Single-question spelling-fill preview — trimmed port of WordSpellScreen. */
export function WordSpellPreview({ question }: { question: WordSpellQuestion }) {
  const spellingLength = getSpellingLetters(question.answer).length;
  const spaceAfterSlotIndices = useMemo(
    () => getSpaceAfterSlotIndices(question.answer),
    [question.answer],
  );
  const [{ tiles, slots }, setSpellState] = useState(() => buildQuestionState(question));
  const [result, setResult] = useState<"playing" | "correct" | "wrong">("playing");

  const slotLayouts = useMemo(
    () => getSlotLayouts(spellingLength, spaceAfterSlotIndices),
    [spellingLength, spaceAfterSlotIndices],
  );

  const tilesInTray = useMemo(() => {
    const usedIds = new Set(slots.filter((tileId): tileId is string => tileId !== null));
    return tiles.filter((tile) => !usedIds.has(tile.id) && !isPrefilledTileId(tile.id));
  }, [slots, tiles]);

  const allFilled = slots.every((tileId) => tileId !== null);
  const isPlaying = result === "playing";
  const showFeedback = result === "correct" || result === "wrong";

  const handleTrayTileClick = (tile: Tile) => {
    if (!isPlaying) return;
    const firstEmpty = slots.findIndex((tileId) => tileId === null);
    if (firstEmpty === -1) return;
    setSpellState((prev) => ({
      ...prev,
      slots: (() => {
        const next = [...prev.slots];
        next[firstEmpty] = tile.id;
        return next;
      })(),
    }));
  };

  const handleSlotClick = (slotIndex: number) => {
    if (!isPlaying || slots[slotIndex] === null || isPrefilledSlotIndex(slotIndex, slots)) return;
    setSpellState((prev) => ({
      ...prev,
      slots: (() => {
        const next = [...prev.slots];
        next[slotIndex] = null;
        return next;
      })(),
    }));
  };

  const handleSubmit = () => {
    if (!isPlaying || !allFilled) return;
    if (matchesSpellAnswer(buildWordFromSlots(slots, tiles), question.answer)) {
      setResult("correct");
      return;
    }
    setResult("wrong");
  };

  const handleRetry = () => {
    setSpellState(buildQuestionState(question));
    setResult("playing");
  };

  return (
    <PreviewFrame src={ASSET} alt="단어 스펠링">
      <div className={`absolute inset-0 ${showFeedback ? "pointer-events-none" : ""}`}>
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[22px] bg-[#F7FAFF]"
          style={figmaRectStyle(CARD)}
        />
        <div className="absolute overflow-hidden" style={figmaRectStyle(CARD_TEXT)}>
          <div className="flex h-full flex-col gap-2.5">
            <p className={`${EXERCISE_PASSAGE_KO_MUTED_CLASS} shrink-0 leading-[1.35]`}>
              {question.korean}
            </p>
            <p className={`${EXERCISE_PASSAGE_EN_CLASS} min-h-0 overflow-hidden leading-[1.45]`}>
              {(() => {
                const parts = question.parts;
                if (!parts || parts.length === 0) {
                  return (
                    <>
                      {question.englishBefore}
                      <InlineAnswerLine
                        slotEnd={spellingLength}
                        slots={slots}
                        tiles={tiles}
                        spaceAfterSlotIndices={spaceAfterSlotIndices}
                        disabled={!isPlaying}
                        onSlotClick={handleSlotClick}
                      />
                      {question.englishAfter}
                    </>
                  );
                }
                let letterOffset = 0;
                return parts.map((part, index) => {
                  if (part.kind === "text") {
                    return <span key={`text-${index}`}>{part.text}</span>;
                  }
                  const letterCount = part.text.replace(/\s/g, "").length;
                  const slotStart = letterOffset;
                  letterOffset += letterCount;
                  return (
                    <InlineAnswerLine
                      key={`blank-${index}`}
                      slotStart={slotStart}
                      slotEnd={slotStart + letterCount}
                      slots={slots}
                      tiles={tiles}
                      spaceAfterSlotIndices={spaceAfterSlotIndices}
                      disabled={!isPlaying}
                      onSlotClick={handleSlotClick}
                    />
                  );
                });
              })()}
            </p>
          </div>
        </div>

        <div aria-hidden className="pointer-events-none absolute bg-white" style={figmaRectStyle(SLOTS_MASK)} />

        {slotLayouts.map((layout, slotIndex) => {
          const tileId = slots[slotIndex];
          const tile = tileId ? getTile(tiles, tileId) : null;
          const isPrefilled = isPrefilledSlotIndex(slotIndex, slots);

          if (!tile) {
            return (
              <div
                key={`slot-empty-${slotIndex}`}
                aria-hidden
                className={`absolute ${emptySlotClass()}`}
                style={figmaRectStyle(layout)}
              />
            );
          }
          if (isPrefilled) {
            return (
              <div
                key={`slot-prefill-${slotIndex}`}
                className={`absolute flex items-center justify-center ${filledSlotClass(true)}`}
                style={figmaRectStyle(layout)}
              >
                <span className={`${EXERCISE_OPTION_EN_CLASS} text-[#64748B]`}>{tile.letter}</span>
              </div>
            );
          }
          return (
            <button
              key={`slot-${slotIndex}`}
              type="button"
              className={`absolute flex cursor-pointer items-center justify-center ${filledSlotClass()}`}
              style={figmaRectStyle(layout)}
              onClick={() => handleSlotClick(slotIndex)}
            >
              <span className={EXERCISE_OPTION_EN_CLASS}>{tile.letter}</span>
            </button>
          );
        })}

        <div aria-hidden className="pointer-events-none absolute bg-white" style={figmaRectStyle(TRAY_MASK)} />
        {tilesInTray.map((tile) => (
          <button
            key={tile.id}
            type="button"
            className={`absolute flex cursor-pointer items-center justify-center ${trayTileClass()}`}
            style={figmaRectStyle(tile)}
            onClick={() => handleTrayTileClick(tile)}
          >
            <span className={EXERCISE_OPTION_EN_CLASS}>{tile.letter}</span>
          </button>
        ))}

        <button
          type="button"
          disabled={!allFilled}
          className={`absolute flex items-center justify-center rounded-2xl ${EXERCISE_CTA_CLASS} ${
            allFilled ? "cursor-pointer border border-white bg-[#3C86FF]" : "cursor-default bg-transparent"
          }`}
          style={figmaRectStyle(SUBMIT_BTN)}
          onClick={handleSubmit}
        >
          {allFilled && "제출하기"}
        </button>
      </div>

      {showFeedback && (
        <div className="absolute z-20" style={figmaRectStyle(FEEDBACK_SHEET)}>
          <div className="flex h-full flex-col rounded-t-[24px] border-t border-[#E4E7EA] bg-white px-[30px] pb-[41px] pt-[30px] shadow-[0_-10px_24px_rgba(0,0,0,0.06)]">
            <p className={exerciseFeedbackTitleClass(result === "correct")}>
              {result === "correct" ? "정답입니다." : "오답입니다."}
            </p>
            {question.answerHint && (
              <p className={EXERCISE_FEEDBACK_HINT_CLASS}>정답은 {question.answerHint}에요</p>
            )}
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
