"use client";

import { useEffect, useId } from "react";
import { AlertBadgeIcon } from "@/components/teacher/AlertBadgeIcon";
import { ModalCloseButton } from "@/components/teacher/ModalCloseButton";

type DeleteClassModalProps = {
  open: boolean;
  classLabel: string;
  onClose: () => void;
  onConfirm: () => void;
};

/**
 * 반 삭제 확인 — 브라우저 confirm 대신 앱 모달.
 */
export function DeleteClassModal({
  open,
  classLabel,
  onClose,
  onConfirm,
}: DeleteClassModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="닫기"
        className="absolute inset-0 bg-black/35"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-[400px] overflow-hidden rounded-2xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
      >
        <div className="flex items-start justify-between gap-3 px-7 pt-6 pb-2">
          <div className="min-w-0">
            <AlertBadgeIcon className="mb-4" />
            <h2
              id={titleId}
              className="text-[18px] font-bold tracking-tight text-[#15171A]"
            >
              이 반을 삭제할까요?
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-[#6B7280]">
              <span className="font-semibold text-[#15171A]">
                「{classLabel}」
              </span>
              반이 담당 반 목록에서 사라져요. 삭제 후에는 되돌릴 수 없습니다.
            </p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="flex justify-end gap-2 px-7 py-5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-[10px] border border-[#E1E2E4] px-4 text-[14px] font-bold text-[#3D4148] hover:bg-[#F3F4F5]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-10 rounded-[10px] bg-[#C52B2B] px-5 text-[14px] font-bold text-white hover:brightness-95"
          >
            삭제하기
          </button>
        </div>
      </div>
    </div>
  );
}
