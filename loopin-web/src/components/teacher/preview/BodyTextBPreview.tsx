"use client";

import { useMemo, useRef, useState } from "react";
import { figmaRectStyle } from "./figma-rect";
import { useShrinkToFit } from "./use-shrink-to-fit";
import { useScaleToFit } from "./use-scale-to-fit";
import { PreviewFrame } from "./PreviewFrame";
import {
  BODY_PREVIEW_EMPTY_HINT_CLASS,
  BODY_PREVIEW_GIVEN_CLASS,
  BODY_PREVIEW_OPTION_CLASS,
  BODY_PREVIEW_PLACED_CLASS,
  BODY_PREVIEW_TILE_CLASS,
} from "./body-preview-compact";
import {
  COLOR_CORRECT_BG,
  COLOR_WRONG_BG,
  EXERCISE_CTA_CLASS,
  EXERCISE_FEEDBACK_HINT_CLASS,
  EXERCISE_PASSAGE_KO_CLASS,
  exerciseFeedbackTitleClass,
} from "./exercise-typography";
import type { ChunkSlot } from "@/lib/ai/given-chunks";

const ASSET = "/assets/student-preview/본문A.svg";
const PASSAGE = { x: 69, y: 211, w: 306, h: 56 };
const SPEAKER_MASK = { x: 16, y: 208, w: 52, h: 54 };
const SENTENCE_BOX = { x: 24, y: 344, w: 345, h: 137 };
const TILES_MASK = { x: 18, y: 500, w: 355, h: 245 };
const SUBMIT_BTN = { x: 30, y: 751, w: 333, h: 60 };
const FEEDBACK_SHEET = { x: 0, y: 648, w: 393, h: 204 };

export type BodyTextBQuestion = {
  id: string;
  promptKo: string;
  exampleEn: string;
  slots: ChunkSlot[];
};

type Tile = { id: string; playableIndex: number; label: string };

/** 본문 B 청크 — 힌트가 되지 않게 소문자·마침표 제거 (loopin-webapp) */
export function normalizeBodyTextBChunk(label: string): string {
  return label.replace(/\./g, "").toLowerCase().trim();
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

function buildTiles(question: BodyTextBQuestion): Tile[] {
  const indexed = question.slots
    .filter((slot) => slot.kind === "playable")
    .map((slot, playableIndex) => ({
      label: slot.label,
      playableIndex,
    }));
  return shuffle(indexed).map((item, index) => ({
    id: `${question.id}-segment-${index}`,
    playableIndex: item.playableIndex,
    label: item.label,
  }));
}

/** Single-question 청크배열 preview — trimmed port of BodyTextBScreen. */
export function BodyTextBPreview({ question }: { question: BodyTextBQuestion }) {
  const [tiles] = useState(() => buildTiles(question));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [result, setResult] = useState<"playing" | "correct" | "wrong">("playing");

  const selectedTiles = useMemo(
    () => selectedIds.map((id) => tiles.find((tile) => tile.id === id)!).filter(Boolean),
    [selectedIds, tiles],
  );
  const allFilled = selectedIds.length === tiles.length;
  const isPlaying = result === "playing";
  const showFeedback = result !== "playing";

  const handleTileClick = (tile: Tile) => {
    if (!isPlaying || selectedIds.includes(tile.id)) return;
    setSelectedIds((prev) => [...prev, tile.id]);
  };
  /** 드래그 없이, 놓인 조각을 누르면 그 조각부터 뒤를 다시 고른다 */
  const handlePlacedClick = (index: number) => {
    if (!isPlaying) return;
    setSelectedIds((prev) => prev.slice(0, index));
  };

  const handleSubmit = () => {
    if (!isPlaying || !allFilled) return;
    const isCorrect = selectedTiles.every(
      (tile, index) => tile.playableIndex === index,
    );
    setResult(isCorrect ? "correct" : "wrong");
  };

  const handleRetry = () => {
    setSelectedIds([]);
    setResult("playing");
  };

  /* 지문을 자르지 않고 글씨를 줄여 전부 보이게 한다 (본문 A와 같은 이유) */
  const passageBoxRef = useRef<HTMLDivElement>(null);
  const passageTextRef = useRef<HTMLParagraphElement>(null);
  useShrinkToFit(passageBoxRef, passageTextRef, [question.promptKo]);

  const sentenceBoxRef = useRef<HTMLDivElement>(null);
  const sentenceContentRef = useRef<HTMLDivElement>(null);
  const tilesBoxRef = useRef<HTMLDivElement>(null);
  const tilesContentRef = useRef<HTMLDivElement>(null);
  useScaleToFit(sentenceBoxRef, sentenceContentRef, [selectedIds.length, question.id]);
  useScaleToFit(tilesBoxRef, tilesContentRef, [question.id, tiles.length]);

  return (
    <PreviewFrame src={ASSET} alt="본문 B">
      <div className={`absolute inset-0 ${showFeedback ? "pointer-events-none" : ""}`}>
        {/* 본문A 에셋의 스피커 아이콘 숨김 — 제시문이 한글이라 듣기 버튼 불필요 */}
        <div
          aria-hidden
          className="pointer-events-none absolute z-[2] bg-white"
          style={figmaRectStyle(SPEAKER_MASK)}
        />
        <div aria-hidden className="pointer-events-none absolute bg-white" style={figmaRectStyle(PASSAGE)} />
        <div
          ref={passageBoxRef}
          className="pointer-events-none absolute flex items-center overflow-hidden px-5 py-1"
          style={figmaRectStyle(PASSAGE)}
        >
          <p ref={passageTextRef} className={EXERCISE_PASSAGE_KO_CLASS}>
            {question.promptKo}
          </p>
        </div>

        <div aria-hidden className="pointer-events-none absolute bg-[#F6F9FD]" style={figmaRectStyle(SENTENCE_BOX)} />
        <div
          ref={sentenceBoxRef}
          className="absolute overflow-hidden px-2 py-2"
          style={figmaRectStyle(SENTENCE_BOX)}
        >
          <div
            ref={sentenceContentRef}
            className="flex w-full flex-wrap items-center justify-center gap-1"
          >
            {(() => {
              const lastGivenIndex = question.slots.reduce(
                (acc, slot, index) => (slot.kind === "given" ? index : acc),
                -1,
              );
              const hasGiven = lastGivenIndex >= 0;
              if (selectedTiles.length === 0 && !hasGiven) {
                return (
                  <p className={`text-center ${BODY_PREVIEW_EMPTY_HINT_CLASS}`}>
                    예문 조각을 순서대로 눌러 문장을 완성하세요
                  </p>
                );
              }
              let playableCursor = 0;
              return question.slots.map((slot, index) => {
                if (slot.kind === "given") {
                  return (
                    <span
                      key={`given-${index}`}
                      className={`whitespace-nowrap ${BODY_PREVIEW_GIVEN_CLASS}`}
                    >
                      <span className={BODY_PREVIEW_OPTION_CLASS}>{slot.label}</span>
                    </span>
                  );
                }
                const placed = selectedTiles[playableCursor];
                const placedIndex = playableCursor;
                playableCursor += 1;
                if (placed) {
                  return (
                    <button
                      key={`placed-${placed.id}-${placedIndex}`}
                      type="button"
                      className={`whitespace-nowrap ${BODY_PREVIEW_PLACED_CLASS}`}
                      onClick={() => handlePlacedClick(placedIndex)}
                    >
                      <span className={BODY_PREVIEW_OPTION_CLASS}>{placed.label}</span>
                    </button>
                  );
                }
                if (index < lastGivenIndex) {
                  return <span key={`gap-${index}`} className="inline-block w-2" />;
                }
                return null;
              });
            })()}
          </div>
        </div>

        <div aria-hidden className="pointer-events-none absolute bg-white" style={figmaRectStyle(TILES_MASK)} />
        <div
          ref={tilesBoxRef}
          className="absolute overflow-hidden px-1.5 py-1"
          style={figmaRectStyle(TILES_MASK)}
        >
          <div
            ref={tilesContentRef}
            className="flex w-full flex-wrap items-center justify-center gap-1"
          >
            {tiles.map((tile) => {
              const isSelected = selectedIds.includes(tile.id);
              return (
                <button
                  key={tile.id}
                  type="button"
                  disabled={isSelected}
                  className={`whitespace-nowrap ${BODY_PREVIEW_TILE_CLASS} ${
                    isSelected ? "invisible pointer-events-none" : "cursor-pointer"
                  }`}
                  onClick={() => handleTileClick(tile)}
                >
                  <span className={BODY_PREVIEW_OPTION_CLASS}>{tile.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          disabled={!allFilled}
          className={`absolute flex items-center justify-center rounded-2xl ${EXERCISE_CTA_CLASS} text-white ${
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
            <p className={EXERCISE_FEEDBACK_HINT_CLASS}>예문은 {question.exampleEn}</p>
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
