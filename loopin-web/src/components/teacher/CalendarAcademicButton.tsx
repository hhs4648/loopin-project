"use client";

/**
 * 주간·월간 공통 「학사일정 관리」.
 * SVG 데모 버튼을 가리고 동일 위치에 표시.
 */
const BTN = {
  left: 1010,
  top: 43,
  width: 106,
  height: 40,
} as const;

type CalendarAcademicButtonProps = {
  onClick: () => void;
};

export function CalendarAcademicButton({ onClick }: CalendarAcademicButtonProps) {
  return (
    <button
      type="button"
      aria-label="학사일정 관리"
      title="학사일정 관리"
      onClick={onClick}
      className="absolute z-30 rounded-full border border-[#E1E2E4] bg-white text-[12px] font-bold text-[#15171A] outline-none hover:bg-[#F7F7F7] focus-visible:ring-2 focus-visible:ring-[#1AA7F2]"
      style={{
        left: BTN.left,
        top: BTN.top,
        width: BTN.width,
        height: BTN.height,
      }}
    >
      학사일정 관리
    </button>
  );
}
