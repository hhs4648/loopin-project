import type { ReactNode } from "react";

/**
 * 교사 사이드바 — 회색 바탕(#F8F8F7) 위 그룹 카드 스타일.
 * 섹션별 흰 카드로 칸을 나누고, 행은 hover/press 피드백으로 누르고 싶게.
 */
export const SIDEBAR_SURFACE_CLASS = "rounded-[14px]";

export const SIDEBAR_SURFACE_MUTED_CLASS = "rounded-[14px]";

/** 섹션 그룹 카드 (문제 관리 · 담당 반) */
export const SIDEBAR_GROUP_CARD_CLASS =
  "rounded-[14px] border border-[#ECEAE4] bg-white p-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]";

/** 독립 카드형 행 (캘린더 · 설정) — hover 시 살짝 떠오르고 누르면 들어감 */
export function sidebarCardRowClass(active?: boolean) {
  return `flex cursor-pointer items-center gap-2.5 rounded-[14px] border px-3.5 text-[14px] outline-none transition-all duration-150 active:scale-[0.98] focus:outline-none focus-visible:outline-none ${
    active
      ? "border-[#D6EDFB] bg-[#F2FAFF] font-bold text-[#15171A] shadow-[0_2px_8px_rgba(26,167,242,0.12)]"
      : "border-[#ECEAE4] bg-white font-medium text-[#4A4843] shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:-translate-y-[1px] hover:shadow-[0_3px_10px_rgba(15,23,42,0.07)] hover:text-[#15171A]"
  }`;
}

/** 그룹 카드 내부 행 */
export function sidebarNavItemClass(active?: boolean) {
  return `flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 text-[14px] outline-none transition-all duration-150 active:scale-[0.98] focus:outline-none focus-visible:outline-none ${
    active
      ? "bg-[#EAF6FE] font-bold text-[#127DB8]"
      : "font-medium text-[#4A4843] hover:bg-[#F5F4F0] hover:text-[#15171A]"
  }`;
}

/** 활성 시 아이콘에 줄 포인트 색 */
export function sidebarIconClass(active?: boolean) {
  return active ? "text-[#1AA7F2]" : "text-[#8A867D]";
}

type SidebarSurfaceProps = {
  children: ReactNode;
  className?: string;
  muted?: boolean;
};

export function SidebarSurface({
  children,
  className = "",
  muted = false,
}: SidebarSurfaceProps) {
  return (
    <div
      className={`${muted ? SIDEBAR_SURFACE_MUTED_CLASS : SIDEBAR_SURFACE_CLASS} ${className}`}
    >
      {children}
    </div>
  );
}
