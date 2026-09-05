"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { overlayRoot } from "@/lib/frame-scale";

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 권한 거부 시 아래 폴백 */
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/** 복사 성공 시 화면 하단 안내 */
export function CopyToast({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !visible) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 rounded-[10px] bg-[#16150F] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(22,21,15,0.18)]"
    >
      클립보드에 복사되었습니다
    </div>,
    overlayRoot(),
  );
}
