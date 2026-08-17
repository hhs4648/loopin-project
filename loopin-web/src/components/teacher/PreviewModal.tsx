"use client";

import { useEffect, useId } from "react";
import type {
  ProblemGrammar,
  ProblemSentence,
  ProblemWord,
} from "@/lib/problem-bank";
import {
  buildGrammarPreviewSections,
  buildSentencePreviewSections,
  buildWordPreviewSections,
  type PreviewSection,
} from "@/lib/student-preview/build-preview-sections";
import { WordMatchPreview } from "@/components/teacher/preview/WordMatchPreview";
import { WordListenMatchPreview } from "@/components/teacher/preview/WordListenMatchPreview";
import { WordQuizPreview } from "@/components/teacher/preview/WordQuizPreview";
import { WordSpellPreview } from "@/components/teacher/preview/WordSpellPreview";
import { BodyTextAPreview } from "@/components/teacher/preview/BodyTextAPreview";
import { BodyTextBPreview } from "@/components/teacher/preview/BodyTextBPreview";
import { BodyTextCPreview } from "@/components/teacher/preview/BodyTextCPreview";
import { GrammarType1Preview } from "@/components/teacher/preview/GrammarType1Preview";
import { GrammarType2Preview } from "@/components/teacher/preview/GrammarType2Preview";
import { PREVIEW_PHONE_HEIGHT_CLASS } from "@/components/teacher/preview/PreviewFrame";

export type PreviewTarget =
  | {
      kind: "word";
      title: string;
      item: ProblemWord;
      pool: ProblemWord[];
      checkedTypes: string[];
    }
  | {
      kind: "sentence";
      title: string;
      item: ProblemSentence;
      checkedTypes: string[];
    }
  | {
      kind: "grammar";
      title: string;
      item: ProblemGrammar;
      checkedTypes: string[];
    };

function buildSections(target: PreviewTarget): PreviewSection[] {
  switch (target.kind) {
    case "word":
      return buildWordPreviewSections(target.item, target.pool, target.checkedTypes);
    case "sentence":
      return buildSentencePreviewSections(target.item, target.checkedTypes);
    case "grammar":
      return buildGrammarPreviewSections(target.item, target.checkedTypes);
  }
}

function SectionCard({ section }: { section: PreviewSection }) {
  return (
    <div className="flex shrink-0 flex-col">
      <p className="mb-2 text-center text-[12px] font-bold text-[#6B7280]">
        {section.label}
      </p>
      {section.kind === "unavailable" ? (
        <div
          className={`flex ${PREVIEW_PHONE_HEIGHT_CLASS} aspect-[393/852] w-auto shrink-0 items-center justify-center rounded-[24px] border border-dashed border-[#E1E2E4] bg-white px-4 text-center`}
        >
          <div>
            <p className="text-[13px] font-semibold text-[#6E6A63]">
              이 항목엔 &ldquo;{section.label}&rdquo; 유형을 만들 수 없어요
            </p>
            <p className="mt-1 text-[12px] font-medium text-[#9CA3AF]">
              {section.reason}
            </p>
          </div>
        </div>
      ) : section.kind === "word-match" ? (
        <WordMatchPreview pairs={section.pairs} />
      ) : section.kind === "word-listen-match" ? (
        <WordListenMatchPreview pairs={section.pairs} />
      ) : section.kind === "word-quiz" ? (
        <WordQuizPreview question={section.question} />
      ) : section.kind === "word-spell" ? (
        <WordSpellPreview question={section.question} />
      ) : section.kind === "body-text-a" ? (
        <BodyTextAPreview question={section.question} />
      ) : section.kind === "body-text-b" ? (
        <BodyTextBPreview question={section.question} />
      ) : section.kind === "body-text-c" ? (
        <BodyTextCPreview question={section.question} />
      ) : section.kind === "grammar-choice-1" ? (
        <GrammarType1Preview question={section.question} />
      ) : (
        <GrammarType2Preview steps={section.steps} />
      )}
    </div>
  );
}

export function PreviewModal({
  target,
  onClose,
}: {
  target: PreviewTarget | null;
  onClose: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!target) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  if (!target) return null;

  const sections = buildSections(target);
  /** 단어 여러 유형 · 문법 X(OX+교정)처럼 폰이 둘 이상이면 가로로 나란히 */
  const horizontalScroll = sections.length > 1;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-fit max-h-[97vh] max-w-[min(1400px,98vw)] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#F0F1F3] px-5 py-2.5">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="truncate text-[15px] font-bold tracking-[-0.02em] text-[#15171A]"
            >
              {target.title}
            </h2>
            <p className="mt-0.5 text-[11px] font-medium text-[#8B8F96]">
              학생 앱에서 이렇게 보여요
              {horizontalScroll ? " · 좌우로 밀어 유형을 넘길 수 있어요" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#8B8F96] hover:bg-[#F3F4F5] hover:text-[#15171A]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M4 4L12 12M12 4L4 12"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div
          className={`shrink-0 bg-[#F7F8FA] px-4 py-3 ${
            horizontalScroll
              ? "no-scrollbar overflow-x-auto overflow-y-hidden overscroll-x-contain"
              : "overflow-hidden"
          }`}
        >
          {sections.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-[#E5E7EB] bg-white px-4 py-10 text-center">
              <p className="text-[13px] font-semibold text-[#6E6A63]">
                선택된 유형이 없어요
              </p>
              <p className="mt-1 text-[12px] font-medium text-[#9CA3AF]">
                위에서 문제 유형을 하나 이상 체크해 주세요.
              </p>
            </div>
          ) : (
            <div className="flex w-max flex-nowrap items-start justify-center gap-3">
              {sections.map((section, index) => (
                <SectionCard key={`${section.kind}-${index}`} section={section} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
