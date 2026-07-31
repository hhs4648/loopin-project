"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  appendCustomGrammar,
  appendCustomSentence,
  appendCustomWord,
  upsertCustomGrammar,
  upsertCustomSentence,
  upsertCustomWord,
} from "@/lib/custom-problem-bank";
import type {
  ProblemGrammar,
  ProblemSentence,
  ProblemWord,
} from "@/lib/problem-bank";
import {
  splitEnglishChunks,
  splitKoreanChunks,
} from "@/lib/problem-bank";
import { validateProblemItemInput } from "@/lib/validate-problem-item";

export type AddProblemKind = "word" | "sentence" | "grammar";

export type EditingProblemItem =
  | { kind: "word"; item: ProblemWord }
  | { kind: "sentence"; item: ProblemSentence }
  | { kind: "grammar"; item: ProblemGrammar };

type Scope = {
  grade: string;
  textbook: string;
  unit: string;
};

type AddProblemItemModalProps = {
  open: boolean;
  kind: AddProblemKind | null;
  scope: Scope | null;
  editing?: EditingProblemItem | null;
  onClose: () => void;
  onCreated: (kind: AddProblemKind, id: string) => void;
};

const KIND_META: Record<
  AddProblemKind,
  {
    title: string;
    editTitle: string;
    submit: string;
    editSubmit: string;
    hint: string;
    editHint: string;
  }
> = {
  word: {
    title: "단어 추가",
    editTitle: "단어 수정",
    submit: "단어 추가",
    editSubmit: "저장",
    hint: "선택한 단원에 새 단어를 넣어요.",
    editHint: "교과서·직접 추가 단어를 수정해요. 원본 JSON은 바뀌지 않아요.",
  },
  sentence: {
    title: "본문 추가",
    editTitle: "본문 수정",
    submit: "본문 추가",
    editSubmit: "저장",
    hint: "영어·한글 예문을 넣고, 청크는 `/`로 나눌 수 있어요.",
    editHint: "교과서·직접 추가 본문을 수정해요. 원본 JSON은 바뀌지 않아요.",
  },
  grammar: {
    title: "문법 추가",
    editTitle: "문법 수정",
    submit: "문법 추가",
    editSubmit: "저장",
    hint: "O/X와 틀린 부분·선택지를 함께 적어 주세요.",
    editHint: "교과서·직접 추가 문법을 수정해요. 원본 JSON은 바뀌지 않아요.",
  },
};

function FieldLabel({
  htmlFor,
  children,
  optional,
  className = "",
}: {
  htmlFor: string;
  children: string;
  optional?: boolean;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={`block text-[12px] font-semibold text-[#4B5563] ${
        className.includes("mb-") ? className : `mb-1.5 ${className}`
      }`}
    >
      {children}
      {optional ? (
        <span className="ml-1 font-medium text-[#9CA3AF]">(선택)</span>
      ) : (
        <span className="ml-0.5 text-[#EF4444]">*</span>
      )}
    </label>
  );
}

const inputClass =
  "h-10 w-full rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#15171A] outline-none transition-colors placeholder:font-normal placeholder:text-[#9CA3AF] focus:border-[#1AA7F2] focus:ring-2 focus:ring-[#1AA7F2]/20";

const textareaClass =
  "min-h-[72px] w-full resize-y rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-2 text-[13px] font-medium text-[#15171A] outline-none transition-colors placeholder:font-normal placeholder:text-[#9CA3AF] focus:border-[#1AA7F2] focus:ring-2 focus:ring-[#1AA7F2]/20";

export function AddProblemItemModal({
  open,
  kind,
  scope,
  editing = null,
  onClose,
  onCreated,
}: AddProblemItemModalProps) {
  const titleId = useId();
  const firstRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const [english, setEnglish] = useState("");
  const [korean, setKorean] = useState("");
  const [exampleEn, setExampleEn] = useState("");
  const [exampleKo, setExampleKo] = useState("");
  const [chunksEn, setChunksEn] = useState("");
  const [chunksKo, setChunksKo] = useState("");
  const [hint, setHint] = useState("");
  const [ox, setOx] = useState<"O" | "X">("O");
  const [wrongPart, setWrongPart] = useState("");
  const [choices, setChoices] = useState("");
  const [explanation, setExplanation] = useState("");

  const isEdit = Boolean(editing && kind && editing.kind === kind);

  useEffect(() => {
    if (!open || !kind) return;
    setError("");

    if (editing && editing.kind === kind) {
      if (editing.kind === "word") {
        const item = editing.item;
        setEnglish(item.english);
        setKorean(item.korean);
        setExampleEn(item.exampleEn ?? "");
        setExampleKo(item.exampleKo ?? "");
        setChunksEn("");
        setChunksKo("");
        setHint("");
        setOx("O");
        setWrongPart("");
        setChoices("");
        setExplanation("");
      } else if (editing.kind === "sentence") {
        const item = editing.item;
        setEnglish(item.english);
        setKorean(item.korean);
        setExampleEn("");
        setExampleKo("");
        setChunksEn(item.chunksEn ?? "");
        setChunksKo(item.chunksKo ?? "");
        setHint(item.hint ?? "");
        setOx("O");
        setWrongPart("");
        setChoices("");
        setExplanation("");
      } else {
        const item = editing.item;
        setEnglish(item.english);
        setKorean(item.korean);
        setExampleEn("");
        setExampleKo("");
        setChunksEn("");
        setChunksKo("");
        setHint("");
        setOx(item.ox?.trim().toUpperCase() === "X" ? "X" : "O");
        setWrongPart(item.wrongPart === "-" ? "" : (item.wrongPart ?? ""));
        setChoices(item.choices === "-" ? "" : (item.choices ?? ""));
        setExplanation(item.explanation === "-" ? "" : (item.explanation ?? ""));
      }
    } else {
      setEnglish("");
      setKorean("");
      setExampleEn("");
      setExampleKo("");
      setChunksEn("");
      setChunksKo("");
      setHint("");
      setOx("O");
      setWrongPart("");
      setChoices("");
      setExplanation("");
    }

    const t = window.setTimeout(() => firstRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open, kind, editing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !kind || !scope) return null;

  const meta = KIND_META[kind];

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!scope || !kind) return;

    const reason = validateProblemItemInput({
      kind,
      english,
      korean,
      exampleEn,
      exampleKo,
      chunksEn,
      chunksKo,
      ox,
      wrongPart,
      choices,
    });
    if (reason) {
      setError(reason);
      return;
    }

    const en = english.trim();
    const ko = korean.trim();

    if (kind === "word") {
      const payload = {
        ...scope,
        english: en,
        korean: ko,
        exampleEn,
        exampleKo,
      };
      const saved =
        isEdit && editing?.kind === "word"
          ? upsertCustomWord(editing.item, payload)
          : appendCustomWord(payload);
      onCreated("word", saved.id);
      onClose();
      return;
    }

    if (kind === "sentence") {
      const payload = {
        ...scope,
        english: en,
        korean: ko,
        chunksEn,
        chunksKo,
        hint,
      };
      const saved =
        isEdit && editing?.kind === "sentence"
          ? upsertCustomSentence(editing.item, payload)
          : appendCustomSentence(payload);
      onCreated("sentence", saved.id);
      onClose();
      return;
    }

    const payload = {
      ...scope,
      english: en,
      korean: ko,
      ox,
      wrongPart: ox === "X" ? wrongPart : "",
      choices: ox === "X" ? choices : "",
      explanation,
      major: isEdit && editing?.kind === "grammar" ? editing.item.major : undefined,
      minor: isEdit && editing?.kind === "grammar" ? editing.item.minor : undefined,
    };
    const saved =
      isEdit && editing?.kind === "grammar"
        ? upsertCustomGrammar(editing.item, payload)
        : appendCustomGrammar(payload);
    onCreated("grammar", saved.id);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/35 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92vh] w-full max-w-[480px] flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#F0F1F3] px-5 py-4">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-[16px] font-bold tracking-[-0.02em] text-[#15171A]"
            >
              {isEdit ? meta.editTitle : meta.title}
            </h2>
            <p className="mt-0.5 text-[12px] font-medium text-[#8B8F96]">
              {scope.grade} · {scope.textbook} · {scope.unit}
            </p>
            <p className="mt-1 text-[12px] text-[#6B7280]">
              {isEdit ? meta.editHint : meta.hint}
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

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
            <div>
              <FieldLabel htmlFor="add-en">영어</FieldLabel>
              <input
                ref={firstRef}
                id="add-en"
                value={english}
                onChange={(event) => {
                  setEnglish(event.target.value);
                  if (error) setError("");
                }}
                className={inputClass}
                placeholder={
                  kind === "word"
                    ? "예: raise"
                    : kind === "sentence"
                      ? "예: The pets you raise show..."
                      : "예: What he need is money."
                }
              />
            </div>

            <div>
              <FieldLabel htmlFor="add-ko">한글 뜻</FieldLabel>
              <input
                id="add-ko"
                value={korean}
                onChange={(event) => {
                  setKorean(event.target.value);
                  if (error) setError("");
                }}
                className={inputClass}
                placeholder={
                  kind === "word"
                    ? "예: 기르다"
                    : "예: 당신이 기르는 애완동물들은..."
                }
              />
            </div>

            {kind === "word" ? (
              <>
                <div>
                  <FieldLabel htmlFor="add-ex-en">
                    예문 (영어)
                  </FieldLabel>
                  <textarea
                    id="add-ex-en"
                    value={exampleEn}
                    onChange={(event) => setExampleEn(event.target.value)}
                    className={textareaClass}
                    placeholder="빈칸은 [단어] 형태로 적어 주세요"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="add-ex-ko">
                    예문 뜻 (한글)
                  </FieldLabel>
                  <textarea
                    id="add-ex-ko"
                    value={exampleKo}
                    onChange={(event) => setExampleKo(event.target.value)}
                    className={textareaClass}
                    placeholder="예문 한글 뜻"
                  />
                </div>
              </>
            ) : null}

            {kind === "sentence" ? (
              <>
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <FieldLabel htmlFor="add-chunks-en" optional className="mb-0">
                      영어 청크
                    </FieldLabel>
                    <button
                      type="button"
                      onClick={() => {
                        const source = english.trim();
                        if (!source) {
                          setError("영어 예문을 먼저 입력해 주세요.");
                          return;
                        }
                        setChunksEn(splitEnglishChunks(source).join(" / "));
                        if (error) setError("");
                      }}
                      className="shrink-0 rounded-[7px] border border-[#BAE6FD] bg-[#F0F9FF] px-2 py-0.5 text-[11px] font-semibold text-[#1274A9] hover:border-[#1AA7F2] hover:bg-[#E0F2FE]"
                    >
                      자동 나눔
                    </button>
                  </div>
                  <textarea
                    id="add-chunks-en"
                    value={chunksEn}
                    onChange={(event) => setChunksEn(event.target.value)}
                    className={textareaClass}
                    placeholder="예: The pets / you raise / show..."
                  />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <FieldLabel htmlFor="add-chunks-ko" optional className="mb-0">
                      한글 청크
                    </FieldLabel>
                    <button
                      type="button"
                      onClick={() => {
                        const source = korean.trim();
                        if (!source) {
                          setError("한글 뜻을 먼저 입력해 주세요.");
                          return;
                        }
                        setChunksKo(splitKoreanChunks(source).join(" / "));
                        if (error) setError("");
                      }}
                      className="shrink-0 rounded-[7px] border border-[#BAE6FD] bg-[#F0F9FF] px-2 py-0.5 text-[11px] font-semibold text-[#1274A9] hover:border-[#1AA7F2] hover:bg-[#E0F2FE]"
                    >
                      자동 나눔
                    </button>
                  </div>
                  <textarea
                    id="add-chunks-ko"
                    value={chunksKo}
                    onChange={(event) => setChunksKo(event.target.value)}
                    className={textareaClass}
                    placeholder="예: 당신이 기르는 / 애완동물들은 / ..."
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="add-hint" optional>
                    영작 힌트
                  </FieldLabel>
                  <input
                    id="add-hint"
                    value={hint}
                    onChange={(event) => setHint(event.target.value)}
                    className={inputClass}
                    placeholder="예: raise, pets, person"
                  />
                </div>
              </>
            ) : null}

            {kind === "grammar" ? (
              <>
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold text-[#4B5563]">
                    O / X 정답 <span className="text-[#EF4444]">*</span>
                  </p>
                  <div className="flex gap-2">
                    {(["O", "X"] as const).map((value) => {
                      const on = ox === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setOx(value);
                            if (value === "O") {
                              setWrongPart("");
                              setChoices("");
                            }
                            if (error) setError("");
                          }}
                          className={`flex h-10 flex-1 items-center justify-center rounded-[10px] border text-[14px] font-bold transition-colors ${
                            on
                              ? "border-[#1AA7F2] bg-[#EAF6FE] text-[#1274A9]"
                              : "border-[#E5E7EB] bg-white text-[#6B7280] hover:border-[#9DD9F8]"
                          }`}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {ox === "X" ? (
                  <>
                    <div>
                      <FieldLabel htmlFor="add-wrong">틀린 부분</FieldLabel>
                      <input
                        id="add-wrong"
                        value={wrongPart}
                        onChange={(event) => {
                          setWrongPart(event.target.value);
                          if (error) setError("");
                        }}
                        className={inputClass}
                        placeholder="영어 문장 안의 틀린 단어"
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="add-choices">선택지</FieldLabel>
                      <input
                        id="add-choices"
                        value={choices}
                        onChange={(event) => {
                          setChoices(event.target.value);
                          if (error) setError("");
                        }}
                        className={inputClass}
                        placeholder="정답을 맨 앞에 · that / which / what"
                      />
                      <p className="mt-1 text-[11px] font-medium text-[#9CA3AF]">
                        첫 항목이 정답 · `/`로 구분
                      </p>
                    </div>
                  </>
                ) : null}
                <div>
                  <FieldLabel htmlFor="add-explain" optional>
                    해설
                  </FieldLabel>
                  <textarea
                    id="add-explain"
                    value={explanation}
                    onChange={(event) => setExplanation(event.target.value)}
                    className={textareaClass}
                    placeholder="간단한 해설"
                  />
                </div>
              </>
            ) : null}

            {error ? (
              <div
                role="alert"
                className="rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-3 py-2.5"
              >
                <p className="text-[12px] font-bold text-[#B91C1C]">
                  형식이 올바르지 않아 추가할 수 없어요
                </p>
                <p className="mt-1 text-[12px] font-medium leading-snug text-[#C52B2B]">
                  {error}
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-[#F0F1F3] px-5 py-3.5">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-[10px] border border-[#E5E7EB] bg-white px-4 text-[13px] font-semibold text-[#4B5563] hover:bg-[#F9FAFB]"
            >
              취소
            </button>
            <button
              type="submit"
              className="h-10 rounded-[10px] bg-[#1AA7F2] px-4 text-[13px] font-bold text-white hover:bg-[#1596DA]"
            >
              {isEdit ? meta.editSubmit : meta.submit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
