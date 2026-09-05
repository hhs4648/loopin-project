"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildMatchPairs,
  buildMeaningQuizzes,
  buildWordQuizzes,
  shuffleVocabItems,
  type VocabEntry,
  type VocabMatchPair,
  type VocabQuizItem,
} from "@/lib/vocab-workbook";

export type VocabPracticeMode = "match" | "meaning-quiz" | "word-quiz";

type VocabPracticeSessionProps = {
  entries: VocabEntry[];
  mode: VocabPracticeMode;
  onClose: () => void;
};

const MODE_LABEL: Record<VocabPracticeMode, string> = {
  match: "짝맞추기",
  "meaning-quiz": "뜻 고르기",
  "word-quiz": "단어 고르기",
};

export function VocabPracticeSession({
  entries,
  mode,
  onClose,
}: VocabPracticeSessionProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${MODE_LABEL[mode]} 연습`}
        className="flex max-h-[min(860px,94%)] w-full max-w-[720px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#F0F1F3] px-5 py-4">
          <div>
            <p className="text-[12px] font-semibold text-[#1AA7F2]">단어 연습</p>
            <h2 className="mt-0.5 text-[18px] font-bold tracking-[-0.02em] text-[#15171A]">
              {MODE_LABEL[mode]}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#8B8F96] hover:bg-[#F3F4F5] hover:text-[#15171A]"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {mode === "match" ? (
            <MatchPractice entries={entries} />
          ) : (
            <QuizPractice
              entries={entries}
              mode={mode === "meaning-quiz" ? "meaning" : "word"}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MatchPractice({ entries }: { entries: VocabEntry[] }) {
  const allPairs = useMemo(() => buildMatchPairs(entries), [entries]);
  const pages = useMemo(() => {
    const chunks: VocabMatchPair[][] = [];
    for (let i = 0; i < allPairs.length; i += 4) {
      chunks.push(allPairs.slice(i, i + 4));
    }
    return chunks;
  }, [allPairs]);

  const [pageIndex, setPageIndex] = useState(0);
  const page = pages[pageIndex] ?? [];
  const pageKey = page.map((p) => p.id).join(",");

  const [leftOrder, setLeftOrder] = useState<VocabMatchPair[]>([]);
  const [rightOrder, setRightOrder] = useState<VocabMatchPair[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(() => new Set());
  const [wrong, setWrong] = useState<[string, string] | null>(null);

  useEffect(() => {
    const current = pages[pageIndex] ?? [];
    setLeftOrder(shuffleVocabItems(current));
    setRightOrder(shuffleVocabItems(current));
    setSelectedLeft(null);
    setSelectedRight(null);
    setMatched(new Set());
    setWrong(null);
  }, [pageIndex, pageKey, pages]);

  useEffect(() => {
    if (!selectedLeft || !selectedRight) return;
    if (selectedLeft === selectedRight) {
      setMatched((prev) => new Set(prev).add(selectedLeft));
      setSelectedLeft(null);
      setSelectedRight(null);
      setWrong(null);
      return;
    }
    setWrong([selectedLeft, selectedRight]);
    const timer = window.setTimeout(() => {
      setWrong(null);
      setSelectedLeft(null);
      setSelectedRight(null);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [selectedLeft, selectedRight]);

  if (allPairs.length === 0) {
    return (
      <p className="py-12 text-center text-[14px] font-medium text-[#9CA3AF]">
        연습할 단어·뜻이 없어요. 단어와 단어 뜻을 채워 주세요.
      </p>
    );
  }

  const done = matched.size === page.length && page.length > 0;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-[12px] font-semibold text-[#8B8F96]">
        <span>
          {pageIndex + 1} / {pages.length} 세트 · {matched.size}/{page.length} 맞춤
        </span>
        {done && pageIndex < pages.length - 1 ? (
          <button
            type="button"
            onClick={() => setPageIndex((n) => n + 1)}
            className="rounded-[8px] bg-[#1AA7F2] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[#1596d9]"
          >
            다음 세트
          </button>
        ) : null}
        {done && pageIndex >= pages.length - 1 ? (
          <span className="font-bold text-[#059669]">모두 맞췄어요!</span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-bold tracking-[0.06em] text-[#9CA3AF]">
            단어
          </p>
          {leftOrder.map((pair) => {
            const isMatched = matched.has(pair.id);
            const isSelected = selectedLeft === pair.id;
            const isWrong = wrong?.[0] === pair.id;
            return (
              <button
                key={`L-${pair.id}`}
                type="button"
                disabled={isMatched}
                onClick={() => setSelectedLeft(pair.id)}
                className={`min-h-[56px] rounded-[12px] border px-3 py-2.5 text-left text-[15px] font-semibold tracking-[-0.01em] transition-colors ${
                  isMatched
                    ? "border-transparent bg-[#E8F8EF] text-[#047857]"
                    : isWrong
                      ? "border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]"
                      : isSelected
                        ? "border-[#93C5FD] bg-[#EFF6FF] text-[#1D4ED8]"
                        : "border-[#E8EAED] bg-[#FAFBFC] text-[#15171A] hover:border-[#D1D5DB]"
                }`}
              >
                {pair.left}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-bold tracking-[0.06em] text-[#9CA3AF]">
            단어 뜻
          </p>
          {rightOrder.map((pair) => {
            const isMatched = matched.has(pair.id);
            const isSelected = selectedRight === pair.id;
            const isWrong = wrong?.[1] === pair.id;
            return (
              <button
                key={`R-${pair.id}`}
                type="button"
                disabled={isMatched}
                onClick={() => setSelectedRight(pair.id)}
                className={`min-h-[56px] rounded-[12px] border px-3 py-2.5 text-left text-[15px] font-semibold tracking-[-0.01em] transition-colors ${
                  isMatched
                    ? "border-transparent bg-[#E8F8EF] text-[#047857]"
                    : isWrong
                      ? "border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]"
                      : isSelected
                        ? "border-[#93C5FD] bg-[#EFF6FF] text-[#1D4ED8]"
                        : "border-[#E8EAED] bg-[#FAFBFC] text-[#15171A] hover:border-[#D1D5DB]"
                }`}
              >
                {pair.right}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function QuizPractice({
  entries,
  mode,
}: {
  entries: VocabEntry[];
  mode: "meaning" | "word";
}) {
  const items = useMemo(
    () =>
      shuffleVocabItems(
        mode === "meaning"
          ? buildMeaningQuizzes(entries)
          : buildWordQuizzes(entries),
      ),
    [entries, mode],
  );

  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const current: VocabQuizItem | undefined = items[index];

  const pick = (option: string) => {
    if (!current || feedback || finished) return;
    const ok = option === current.answer;
    setPicked(option);
    setFeedback(ok ? "correct" : "wrong");
    if (ok) setCorrectCount((n) => n + 1);
    window.setTimeout(() => {
      setFeedback(null);
      setPicked(null);
      if (index >= items.length - 1) {
        setFinished(true);
      } else {
        setIndex((n) => n + 1);
      }
    }, 550);
  };

  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-[14px] font-medium text-[#9CA3AF]">
        연습할 단어·뜻이 없어요. 단어와 단어 뜻을 채워 주세요.
      </p>
    );
  }

  if (finished) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <p className="text-[20px] font-bold tracking-[-0.02em] text-[#15171A]">
          연습 완료
        </p>
        <p className="mt-2 text-[14px] font-medium text-[#6B7280]">
          {items.length}문항 중 {correctCount}개 맞췄어요
        </p>
        <button
          type="button"
          onClick={() => {
            setIndex(0);
            setCorrectCount(0);
            setFinished(false);
          }}
          className="mt-6 h-10 rounded-[10px] bg-[#1AA7F2] px-4 text-[13px] font-bold text-white hover:bg-[#1596d9]"
        >
          다시 풀기
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-[12px] font-semibold text-[#8B8F96]">
        <span>
          {index + 1} / {items.length}
        </span>
        <span>정답 {correctCount}</span>
      </div>

      <div className="rounded-[16px] border border-[#E8EAED] bg-[#FAFBFC] px-5 py-8 text-center">
        <p className="text-[12px] font-semibold text-[#9CA3AF]">
          {mode === "meaning" ? "이 단어의 뜻은?" : "이 뜻의 단어는?"}
        </p>
        <p className="mt-3 text-[28px] font-bold tracking-[-0.03em] text-[#15171A]">
          {current?.prompt}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {current?.options.map((option) => {
          let tone =
            "border-[#E8EAED] bg-white text-[#15171A] hover:border-[#D1D5DB]";
          if (picked === option && feedback === "correct") {
            tone = "border-[#86EFAC] bg-[#F0FDF4] text-[#047857]";
          } else if (picked === option && feedback === "wrong") {
            tone = "border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]";
          } else if (
            feedback === "wrong" &&
            option === current.answer &&
            picked !== option
          ) {
            tone = "border-[#86EFAC] bg-[#F0FDF4] text-[#047857]";
          }
          return (
            <button
              key={option}
              type="button"
              disabled={Boolean(feedback)}
              onClick={() => pick(option)}
              className={`min-h-[52px] rounded-[12px] border px-4 py-3 text-left text-[15px] font-semibold tracking-[-0.01em] transition-colors ${tone}`}
            >
              {option}
            </button>
          );
        })}
      </div>

      {current && entries.find((e) => e.id === current.id)?.example ? (
        <p className="mt-5 text-[12px] font-medium leading-[1.5] text-[#9CA3AF]">
          예문: {entries.find((e) => e.id === current.id)?.example}
          {entries.find((e) => e.id === current.id)?.exampleMeaning
            ? ` · ${entries.find((e) => e.id === current.id)?.exampleMeaning}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
