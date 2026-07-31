"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  buildWorksheetsDocumentHtml,
  downloadWorksheetsAsHwpx,
  openWorksheetsPrintWindow,
  suggestExportFilename,
} from "@/lib/wrong-answer-export";
import type { WrongAnswerWorksheet } from "@/lib/wrong-answer-worksheet";

export type WrongAnswerExportFormat = "pdf" | "hwpx";

type WrongAnswerPrintModalProps = {
  title: string;
  sheets: WrongAnswerWorksheet[] | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
};

/** 열릴 때마다 새로 마운트되는 것을 전제로 한다 (형식 선택 초기화) */
export function WrongAnswerPrintModal({
  title,
  sheets,
  loading,
  error,
  onClose,
}: WrongAnswerPrintModalProps) {
  const titleId = useId();
  const [format, setFormat] = useState<WrongAnswerExportFormat>("pdf");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const previewHtml = useMemo(() => {
    if (!sheets || sheets.length === 0) return "";
    return buildWorksheetsDocumentHtml(sheets);
  }, [sheets]);

  if (typeof document === "undefined") return null;

  async function handleExport() {
    if (!sheets || sheets.length === 0) return;
    setExportError(null);
    setExporting(true);
    try {
      if (format === "pdf") {
        openWorksheetsPrintWindow(sheets);
      } else {
        await downloadWorksheetsAsHwpx(
          sheets,
          suggestExportFilename(sheets, "hwpx"),
        );
      }
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "내보내기에 실패했어요.",
      );
    } finally {
      setExporting(false);
    }
  }

  const canExport = !loading && !error && !!sheets && sheets.length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/35 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(920px,94vh)] w-full max-w-[920px] flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#F0F1F3] px-6 py-4">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="truncate text-[18px] font-bold tracking-[-0.02em] text-[#15171A]"
            >
              {title}
            </h2>
            <p className="mt-1 text-[12px] font-medium text-[#8B8F96]">
              미리보기 후 PDF 인쇄 또는 HWPX로 저장할 수 있어요.
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
                d="M3.5 3.5l9 9M12.5 3.5l-9 9"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#F0F1F3] px-6 py-3">
          <span className="text-[12px] font-bold text-[#6B7280]">형식</span>
          <div className="inline-flex rounded-full border border-[#E5E7EB] bg-[#F7F8F9] p-1">
            {(
              [
                { id: "pdf", label: "PDF (인쇄)" },
                { id: "hwpx", label: "HWPX (한글)" },
              ] as const
            ).map((opt) => {
              const active = format === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFormat(opt.id)}
                  className={`rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-colors ${
                    active
                      ? "bg-white text-[#15171A] shadow-sm"
                      : "text-[#6B7280] hover:text-[#15171A]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {sheets ? (
            <span className="ml-auto text-[12px] font-medium text-[#9CA3AF]">
              {sheets.length}명 · 오답{" "}
              {sheets.reduce((sum, s) => sum + s.items.length, 0)}문항
            </span>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#F3F4F6] px-4 py-4">
          {loading ? (
            <div className="flex h-[360px] items-center justify-center text-[14px] font-medium text-[#6B7280]">
              오답 시험지를 준비하는 중…
            </div>
          ) : error ? (
            <div className="flex h-[360px] flex-col items-center justify-center px-6 text-center">
              <p className="text-[14px] font-bold text-[#D40924]">{error}</p>
              <p className="mt-2 text-[12px] text-[#9CA3AF]">
                잠시 후 다시 시도해 주세요.
              </p>
            </div>
          ) : previewHtml ? (
            <iframe
              title="오답 시험지 미리보기"
              srcDoc={previewHtml}
              className="h-[min(560px,58vh)] w-full rounded-[12px] border border-[#E5E7EB] bg-white"
            />
          ) : (
            <div className="flex h-[360px] items-center justify-center text-[14px] font-medium text-[#6B7280]">
              표시할 시험지가 없어요.
            </div>
          )}
        </div>

        {(exportError || format === "pdf") && canExport ? (
          <p className="shrink-0 px-6 pt-3 text-[12px] text-[#6B7280]">
            {exportError ? (
              <span className="font-medium text-[#D40924]">{exportError}</span>
            ) : (
              "PDF는 인쇄 창에서 「PDF로 저장」을 선택하세요."
            )}
          </p>
        ) : exportError ? (
          <p className="shrink-0 px-6 pt-3 text-[12px] font-medium text-[#D40924]">
            {exportError}
          </p>
        ) : null}

        <div className="flex shrink-0 gap-3 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-[48px] flex-1 rounded-[14px] border border-[#D5D7DB] bg-white text-[14px] font-bold text-[#2B2E33] transition-colors hover:bg-[#F7F8F9]"
          >
            닫기
          </button>
          <button
            type="button"
            disabled={!canExport || exporting}
            onClick={() => void handleExport()}
            className="h-[48px] flex-1 rounded-[14px] bg-[#2F80ED] text-[14px] font-bold text-white transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting
              ? "내보내는 중…"
              : format === "pdf"
                ? "인쇄 / PDF로 저장"
                : "HWPX 다운로드"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
