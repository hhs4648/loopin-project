"use client";

import type { SchoolBrand } from "@/lib/school-brand";
import { getBrandTheme } from "@/lib/school-brand";

type SidebarBrandHeaderProps = {
  brand: SchoolBrand;
  /** 내 설정에서 수정한 교사 이름 — 학교 이름 아래 「{이름} 선생님」 */
  teacherName?: string;
};

/**
 * 사이드바 좌상단 학교 로고·이름 — 전 교사 화면 공통.
 * 플랫 스타일: 카드 없이 로고 + 학교 이름 · 선생님 이름 2줄.
 */
export function SidebarBrandHeader({
  brand,
  teacherName,
}: SidebarBrandHeaderProps) {
  const theme = getBrandTheme(brand);
  const mark = brand.markText.slice(0, 2).trim();
  const photoMode = brand.markMode === "image";
  const showImage = photoMode && Boolean(brand.markImageDataUrl);
  const teacher = teacherName?.trim();

  return (
    <div
      className="pointer-events-none absolute z-20 flex items-center gap-2.5 px-1"
      style={{
        left: 16,
        top: 22,
        width: 206,
        height: 44,
      }}
    >
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-[12px] text-white shadow-[0_2px_6px_rgba(15,23,42,0.12)]"
        style={{
          width: 38,
          height: 38,
          backgroundColor: photoMode ? "#FFFFFF" : theme.class,
        }}
        aria-hidden
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.markImageDataUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : !photoMode && mark ? (
          <span className="text-[15px] font-bold leading-none">{mark}</span>
        ) : null}
      </div>
      <span className="flex min-w-0 flex-col justify-center gap-[3px]">
        <span className="truncate text-[15px] font-bold leading-tight tracking-tight text-[#15171A]">
          {brand.name}
        </span>
        {teacher ? (
          <span className="truncate text-[11.5px] font-medium leading-none text-[#8A867D]">
            {teacher} 선생님
          </span>
        ) : null}
      </span>
    </div>
  );
}
