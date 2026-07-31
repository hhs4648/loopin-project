"use client";

import { useMemo, useRef, useState } from "react";
import { figmaRectStyle } from "./figma-rect";
import { PreviewFrame } from "./PreviewFrame";
import {
  EXERCISE_MATCH_TILE_EN_CLASS,
  EXERCISE_MATCH_TILE_KO_CLASS,
} from "./exercise-typography";

const ASSET = "/assets/student-preview/단어A_시작.svg";
const FEEDBACK_MS = 500;

export type WordMatchPair = {
  id: string;
  english: string;
  korean: string;
};

type WordTile = {
  id: string;
  pairId: string;
  label: string;
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
  const english = limited.map((pair, index) => ({
    id: `${pair.id}:en`,
    pairId: pair.id,
    label: pair.english,
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

function tileLabelClass(state: TileVisualState, side: WordTile["side"]) {
  const baseClass =
    side === "en" ? EXERCISE_MATCH_TILE_EN_CLASS : EXERCISE_MATCH_TILE_KO_CLASS;
  switch (state) {
    case "selected":
      return `${baseClass} text-[#4177FF]`;
    case "correct":
      return `${baseClass} text-[#22C55E]`;
    case "wrong":
      return `${baseClass} text-[#EF4444]`;
    case "disabled":
      return `${baseClass} text-[#9E9FA7]`;
    default:
      return `${baseClass} text-[#1E1E1E]`;
  }
}

/** Single-page word-matching preview (up to 4 pairs) — trimmed port of WordMatchScreen. */
export function WordMatchPreview({ pairs }: { pairs: WordMatchPair[] }) {
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
    <PreviewFrame src={ASSET} alt="단어 매칭">
      <div className="absolute inset-0">
        {tiles.map((tile) => {
          const state = getTileState(tile);
          return (
            <button
              key={tile.id}
              type="button"
              aria-label={tile.label}
              className={`absolute flex items-center justify-center px-3 text-center ${tileFrameClass(state)}`}
              style={figmaRectStyle(tile)}
              onClick={() => handleClick(tile)}
            >
              <span className={tileLabelClass(state, tile.side)}>
                {tile.label}
              </span>
            </button>
          );
        })}
      </div>
    </PreviewFrame>
  );
}
