"use client";

import { useMemo, useRef, useState } from "react";
import { figmaRectStyle } from "./figma-rect";
import { PreviewFrame } from "./PreviewFrame";
import { EXERCISE_MATCH_TILE_KO_CLASS } from "./exercise-typography";
import type { WordMatchPair } from "./WordMatchPreview";

const ASSET = "/assets/student-preview/단어A_시작.svg";
const FEEDBACK_MS = 500;
const PROMPT = "의미가 일치하는 것을 고르세요";
const PROMPT_RECT = { x: 24, y: 118, w: 345, h: 72 };

type WordTile = {
  id: string;
  pairId: string;
  label: string;
  english: string;
  side: "en" | "ko";
  x: number;
  y: number;
  w: number;
  h: number;
};

const TILE_W = 168;
const TILE_H = 98;
const EN_X = 21;
const KO_X = 205;
const ROW_Y = [214, 328, 442, 556] as const;

const TILE_COVERS = ROW_Y.flatMap((y, row) => [
  { id: `cover-en-${row}`, x: EN_X, y, w: TILE_W, h: TILE_H },
  { id: `cover-ko-${row}`, x: KO_X, y, w: TILE_W, h: TILE_H },
]);

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

function buildTiles(pairs: WordMatchPair[]): WordTile[] {
  const limited = pairs.slice(0, ROW_Y.length);
  const english = shuffle(limited).map((pair, index) => ({
    id: `${pair.id}:en`,
    pairId: pair.id,
    label: pair.english,
    english: pair.english,
    side: "en" as const,
    x: EN_X,
    y: ROW_Y[index]!,
    w: TILE_W,
    h: TILE_H,
  }));
  const korean = shuffle(limited).map((pair, index) => ({
    id: `${pair.id}:ko`,
    pairId: pair.id,
    label: pair.korean,
    english: pair.english,
    side: "ko" as const,
    x: KO_X,
    y: ROW_Y[index]!,
    w: TILE_W,
    h: TILE_H,
  }));
  return [...english, ...korean];
}

function isMatchingPair(a: WordTile, b: WordTile) {
  return a.pairId === b.pairId && a.side !== b.side;
}

type TileVisualState = "idle" | "selected" | "correct" | "wrong" | "disabled";

function tileFrameClass(state: TileVisualState) {
  const base = "box-border border-[3px]";
  switch (state) {
    case "selected":
      return `${base} rounded-2xl border-[#4177FF] bg-[#EFF4FF]`;
    case "correct":
      return `${base} rounded-2xl border-[#22C55E] bg-[#F0FDF4]`;
    case "wrong":
      return `${base} rounded-2xl border-[#EF4444] bg-[#FEF2F2]`;
    case "disabled":
      return `${base} rounded-2xl border-transparent bg-[#EBEBEB]`;
    default:
      return `${base} rounded-2xl border-transparent bg-[#FEFEFE]`;
  }
}

function tileLabelClass(state: TileVisualState) {
  switch (state) {
    case "selected":
      return `${EXERCISE_MATCH_TILE_KO_CLASS} text-[#4177FF]`;
    case "correct":
      return `${EXERCISE_MATCH_TILE_KO_CLASS} text-[#22C55E]`;
    case "wrong":
      return `${EXERCISE_MATCH_TILE_KO_CLASS} text-[#EF4444]`;
    case "disabled":
      return `${EXERCISE_MATCH_TILE_KO_CLASS} text-[#9E9FA7]`;
    default:
      return `${EXERCISE_MATCH_TILE_KO_CLASS} text-[#1E1E1E]`;
  }
}

function audioIconColor(state: TileVisualState) {
  switch (state) {
    case "selected":
      return "#4177FF";
    case "correct":
      return "#22C55E";
    case "wrong":
      return "#EF4444";
    case "disabled":
      return "#C4C4C8";
    default:
      return "#7A7B83";
  }
}

/** Figma TTS 타일 — 스피커·파형 간격 넓게, 파형 버스트 */
function AudioTileGlyph({ color }: { color: string }) {
  const barHeights = [7, 14, 28, 12, 32, 18, 36, 10, 30, 16, 34, 11, 26, 8, 20];
  const barW = 2.2;
  const barGap = 2.8;
  const waveStartX = 46;
  const midY = 22;

  return (
    <svg
      aria-hidden
      viewBox="0 0 124 44"
      className="h-[44%] w-auto max-h-10"
    >
      <path
        fill={color}
        d="M6 16.5h5l8.2-7v25l-8.2-7H6c-1 0-1.8-.8-1.8-1.8v-7.4c0-1 .8-1.8 1.8-1.8z"
      />
      <path
        d="M23.5 15.5c2.2 1.7 3.5 4.4 3.5 7.3s-1.3 5.6-3.5 7.3"
        fill="none"
        stroke={color}
        strokeWidth="2.3"
        strokeLinecap="round"
      />
      <path
        d="M28.5 11.5c3.5 2.7 5.6 6.8 5.6 11.3s-2.1 8.6-5.6 11.3"
        fill="none"
        stroke={color}
        strokeWidth="2.3"
        strokeLinecap="round"
      />
      {barHeights.map((h, i) => (
        <rect
          key={i}
          x={waveStartX + i * (barW + barGap)}
          y={midY - h / 2}
          width={barW}
          height={h}
          rx={1.1}
          fill={color}
        />
      ))}
    </svg>
  );
}

function speakEnglish(word: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-US";
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

/** 음성 짝맞추기 미리보기 — 최신 WordListenMatchScreen 포트 */
export function WordListenMatchPreview({ pairs }: { pairs: WordMatchPair[] }) {
  const tiles = useMemo(() => buildTiles(pairs), [pairs]);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{
    kind: "correct" | "wrong";
    tileIds: string[];
  } | null>(null);
  const [locked, setLocked] = useState(false);
  const timerRef = useRef<number | null>(null);

  const getTileState = (tile: WordTile): TileVisualState => {
    if (matchedIds.has(tile.pairId)) return "disabled";
    if (feedback?.tileIds.includes(tile.id)) return feedback.kind;
    if (selectedIds.includes(tile.id)) return "selected";
    return "idle";
  };

  const handleClick = (tile: WordTile) => {
    if (locked || matchedIds.has(tile.pairId)) return;

    if (tile.side === "en") {
      speakEnglish(tile.english);
    }

    if (selectedIds.includes(tile.id)) {
      setSelectedIds((ids) => ids.filter((id) => id !== tile.id));
      return;
    }
    if (selectedIds.length === 0) {
      setSelectedIds([tile.id]);
      return;
    }
    const first = tiles.find((entry) => entry.id === selectedIds[0]);
    if (!first || first.side === tile.side) {
      setSelectedIds([tile.id]);
      return;
    }

    if (isMatchingPair(first, tile)) {
      setLocked(true);
      setFeedback({ kind: "correct", tileIds: [first.id, tile.id] });
      setSelectedIds([]);
      timerRef.current = window.setTimeout(() => {
        setMatchedIds((prev) => new Set(prev).add(tile.pairId));
        setFeedback(null);
        setLocked(false);
      }, FEEDBACK_MS);
      return;
    }

    setLocked(true);
    setFeedback({ kind: "wrong", tileIds: [first.id, tile.id] });
    setSelectedIds([]);
    timerRef.current = window.setTimeout(() => {
      setFeedback(null);
      setLocked(false);
    }, FEEDBACK_MS);
  };

  return (
    <PreviewFrame src={ASSET} alt="음성 짝맞추기">
      <div className="absolute inset-0">
        <div
          aria-hidden
          className="pointer-events-none absolute flex items-center justify-center bg-white px-4"
          style={figmaRectStyle(PROMPT_RECT)}
        >
          <p className="text-center font-sans text-[18px] font-semibold leading-snug tracking-[-0.01em] text-[#1E1E1E]">
            {PROMPT}
          </p>
        </div>

        {TILE_COVERS.map((cover) => (
          <div
            key={cover.id}
            aria-hidden
            className="pointer-events-none absolute rounded-2xl bg-[#FEFEFE]"
            style={figmaRectStyle(cover)}
          />
        ))}

        {tiles.map((tile) => {
          const state = getTileState(tile);
          const isAudio = tile.side === "en";
          return (
            <button
              key={tile.id}
              type="button"
              aria-label={isAudio ? "영어 발음 듣기" : tile.label}
              className={`absolute flex cursor-pointer items-center justify-center px-3 text-center ${tileFrameClass(state)}`}
              style={figmaRectStyle(tile)}
              onClick={() => handleClick(tile)}
            >
              {isAudio ? (
                <AudioTileGlyph color={audioIconColor(state)} />
              ) : (
                <span className={tileLabelClass(state)}>{tile.label}</span>
              )}
            </button>
          );
        })}
      </div>
    </PreviewFrame>
  );
}
