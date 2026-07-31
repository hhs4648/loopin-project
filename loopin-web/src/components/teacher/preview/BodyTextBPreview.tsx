"use client";

import { useMemo, useState } from "react";
import { figmaRectStyle } from "./figma-rect";
import { PreviewFrame } from "./PreviewFrame";
import {
  COLOR_CORRECT_BG,
  COLOR_WRONG_BG,
  EXERCISE_CTA_CLASS,
  EXERCISE_EMPTY_HINT_CLASS,
  EXERCISE_FEEDBACK_HINT_CLASS,
  EXERCISE_OPTION_EN_CLASS,
  EXERCISE_PASSAGE_KO_CLASS,
  exerciseFeedbackTitleClass,
} from "./exercise-typography";

const ASSET = "/assets/student-preview/본문A.svg";
const PASSAGE = { x: 69, y: 211, w: 306, h: 56 };
const SPEAKER_MASK = { x: 16, y: 208, w: 52, h: 54 };
const SENTENCE_BOX = { x: 24, y: 344, w: 345, h: 137 };
const TILES_MASK = { x: 18, y: 527, w: 355, h: 218 };
const SUBMIT_BTN = { x: 30, y: 751, w: 333, h: 60 };
const FEEDBACK_SHEET = { x: 0, y: 648, w: 393, h: 204 };

export type BodyTextBQuestion = {
  id: string;
  promptKo: string;
  exampleEn: string;
  segments: string[];
};

type Tile = { id: string; segmentIndex: number; label: string };

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
  const indexed = question.segments.map((label, segmentIndex) => ({
    label: normalizeBodyTextBChunk(label),
    segmentIndex,
  }));
  return shuffle(indexed).map((item, index) => ({
    id: `${question.id}-segment-${index}`,
    segmentIndex: item.segmentIndex,
    label: item.label,
  }));
}

function segmentTileClass() {
  return "rounded-[12px] border-[1.5px] border-[#C9D9EE] bg-white px-3 py-2 shadow-[0_2px_6px_rgba(80,120,180,0.08)]";
}
function placedSegmentClass() {
  return "cursor-pointer rounded-lg border border-[#3C86FF] bg-white px-2 py-1 shadow-[0_1px_4px_rgba(60,134,255,0.1)]";
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
    const isCorrect = selectedTiles.every((tile, index) => tile.segmentIndex === index);
    setResult(isCorrect ? "correct" : "wrong");
  };

  const handleRetry = () => {
    setSelectedIds([]);
    setResult("playing");
  };

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
        <div className="pointer-events-none absolute flex items-center px-5" style={figmaRectStyle(PASSAGE)}>
          <p className={`line-clamp-2 ${EXERCISE_PASSAGE_KO_CLASS}`}>{question.promptKo}</p>
        </div>

        <div aria-hidden className="pointer-events-none absolute bg-[#F6F9FD]" style={figmaRectStyle(SENTENCE_BOX)} />
        <div className="absolute overflow-y-auto px-4 py-3" style={figmaRectStyle(SENTENCE_BOX)}>
          {selectedTiles.length > 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {selectedTiles.map((tile, index) => (
                <button
                  key={`placed-${tile.id}-${index}`}
                  type="button"
                  className={`whitespace-nowrap ${placedSegmentClass()}`}
                  onClick={() => handlePlacedClick(index)}
                >
                  <span className={EXERCISE_OPTION_EN_CLASS}>{tile.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className={`text-center ${EXERCISE_EMPTY_HINT_CLASS}`}>
              예문 조각을 순서대로 눌러 문장을 완성하세요
            </p>
          )}
        </div>

        <div aria-hidden className="pointer-events-none absolute bg-white" style={figmaRectStyle(TILES_MASK)} />
        <div className="absolute overflow-y-auto px-3 py-2" style={figmaRectStyle(TILES_MASK)}>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {tiles.map((tile) => {
              const isSelected = selectedIds.includes(tile.id);
              return (
                <button
                  key={tile.id}
                  type="button"
                  disabled={isSelected}
                  className={`whitespace-nowrap ${segmentTileClass()} ${
                    isSelected ? "invisible pointer-events-none" : "cursor-pointer"
                  }`}
                  onClick={() => handleTileClick(tile)}
                >
                  <span className={EXERCISE_OPTION_EN_CLASS}>{tile.label}</span>
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
