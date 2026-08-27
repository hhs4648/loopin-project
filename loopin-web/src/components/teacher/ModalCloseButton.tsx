"use client";

/** 팝업 우상단 × — 작성 중에도 닫을 수 있게 한다. */
export function ModalCloseButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="닫기"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#8B8F96] outline-none hover:bg-[#F3F4F5] hover:text-[#15171A] focus-visible:ring-2 focus-visible:ring-[#1AA7F2] disabled:cursor-default disabled:opacity-40"
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
  );
}
