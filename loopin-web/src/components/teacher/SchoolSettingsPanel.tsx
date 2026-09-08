"use client";

import { useId, useRef } from "react";
import {
  BRAND_COLOR_THEMES,
  type SchoolBrand,
  type SchoolMarkMode,
  getBrandTheme,
} from "@/lib/school-brand";

type SchoolSettingsPanelProps = {
  draft: SchoolBrand;
  onChange: (next: SchoolBrand) => void;
};

/**
 * 학교 설정 메인 영역 (스크롤 없음 · SVG 완전 덮음 · 잘림 방지).
 */
export function SchoolSettingsPanel({
  draft,
  onChange,
}: SchoolSettingsPanelProps) {
  const fileId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const theme = getBrandTheme(draft);
  const mark = draft.markText.slice(0, 2).trim();
  const showImage =
    draft.markMode === "image" && Boolean(draft.markImageDataUrl);

  function patch(partial: Partial<SchoolBrand>) {
    onChange({ ...draft, ...partial });
  }

  function onPickImage(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      patch({
        markMode: "image",
        markImageDataUrl: String(reader.result || ""),
      });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div
      className="absolute z-20 flex flex-col gap-4 overflow-hidden rounded-[16px] p-1"
      style={{
        left: 293.5,
        top: 148,
        width: 928.7,
        height: 620,
        backgroundColor: "#F3F4F5",
      }}
    >
      <section className="shrink-0 rounded-[14px] bg-white px-7 py-5">
        <div className="flex items-center justify-between gap-6">
          <h3 className="text-[18px] font-bold leading-none text-[#15171A]">
            사이드바 미리보기
          </h3>
          <div
            className="flex h-[58px] max-w-[320px] min-w-[220px] shrink-0 items-center gap-3 rounded-[12px] px-4"
            style={{ backgroundColor: "#F8F8F7" }}
          >
            <MarkBadge
              color={theme.class}
              mark={mark}
              showImage={showImage}
              imageUrl={draft.markImageDataUrl}
              photoMode={draft.markMode === "image"}
              size={40}
            />
            <span className="truncate text-[17px] font-bold leading-none text-[#16150F]">
              {draft.name || "학교 이름"}
            </span>
          </div>
        </div>
      </section>

      <section className="shrink-0 rounded-[14px] bg-white px-7 py-6">
        <h3 className="text-[18px] font-bold leading-none text-[#15171A]">
          기본 정보
        </h3>

        <div className="mt-5 space-y-5">
          <label className="flex items-center gap-5">
            <span className="flex h-12 w-[100px] shrink-0 items-center text-[15px] font-semibold text-[#3D4148]">
              학교 이름
            </span>
            <input
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              maxLength={30}
              className="h-12 flex-1 rounded-[12px] border border-[#E1E2E4] px-4 text-[16px] font-semibold text-[#15171A] outline-none focus:border-[#1AA7F2]"
            />
          </label>

          {/* 프로필 — 1줄: 배지 · 문구/사진 · 입력 · 힌트 */}
          <div className="flex items-center gap-5">
            <span className="flex h-12 w-[100px] shrink-0 items-center text-[15px] font-semibold text-[#3D4148]">
              프로필
            </span>

            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[12px] border border-[#E8E8EA] bg-[#FAFAFA] px-3 py-2.5">
              <MarkBadge
                color={theme.class}
                mark={mark}
                showImage={showImage}
                imageUrl={draft.markImageDataUrl}
                photoMode={draft.markMode === "image"}
                size={44}
              />

              <div className="inline-flex shrink-0 rounded-[10px] bg-[#EEEEED] p-0.5">
                {(
                  [
                    ["text", "문구"],
                    ["image", "사진"],
                  ] as const
                ).map(([mode, label]) => (
                  <ModeChip
                    key={mode}
                    label={label}
                    selected={draft.markMode === mode}
                    onClick={() =>
                      patch({ markMode: mode as SchoolMarkMode })
                    }
                  />
                ))}
              </div>

              {draft.markMode === "text" ? (
                <>
                  <input
                    value={draft.markText}
                    onChange={(e) =>
                      patch({ markText: e.target.value.slice(0, 2) })
                    }
                    maxLength={2}
                    placeholder=""
                    className="h-11 w-[72px] shrink-0 rounded-[10px] border border-[#E1E2E4] bg-white px-2 text-center text-[17px] font-bold leading-none text-[#15171A] outline-none focus:border-[#1AA7F2]"
                  />
                  <span className="shrink-0 text-[14px] font-medium leading-none text-[#6B7280]">
                    최대 2자
                  </span>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="h-11 shrink-0 rounded-[10px] border border-[#E1E2E4] bg-white px-4 text-[14px] font-semibold leading-none text-[#15171A] hover:bg-[#F3F4F5]"
                  >
                    {showImage ? "사진 변경" : "사진 올리기"}
                  </button>
                  <input
                    id={fileId}
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onPickImage(e.target.files?.[0])}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {draft.markMode === "text" ? (
      <section className="min-h-0 flex-1 rounded-[14px] bg-white px-7 py-6">
        <h3 className="text-[18px] font-bold leading-none text-[#15171A]">
          브랜드 색상
        </h3>

        <div className="mt-5 flex items-center gap-3">
          <div
            className="h-9 w-9 shrink-0 rounded-[10px]"
            style={{ backgroundColor: theme.class }}
            aria-hidden
          />
          <span className="text-[16px] font-semibold leading-none text-[#3D4148]">
            {theme.label}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-3">
          {BRAND_COLOR_THEMES.map((t) => {
            const selected = draft.colorThemeId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-label={t.label}
                aria-pressed={selected}
                title={t.label}
                onClick={() => patch({ colorThemeId: t.id })}
                className="h-10 w-10 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#1AA7F2] focus-visible:ring-offset-2"
                style={{
                  backgroundColor: t.class,
                  boxShadow: selected
                    ? "inset 0 0 0 2px #fff, 0 0 0 2px #15171A"
                    : "0 0 0 1.5px rgba(0,0,0,0.08)",
                }}
              />
            );
          })}
        </div>
      </section>
      ) : null}
    </div>
  );
}

function MarkBadge({
  color,
  mark,
  showImage,
  imageUrl,
  photoMode,
  size,
}: {
  color: string;
  mark: string;
  showImage: boolean;
  imageUrl?: string;
  photoMode: boolean;
  size: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[11px] text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: photoMode ? "#FFFFFF" : color,
        boxShadow: photoMode ? "inset 0 0 0 1px rgba(0,0,0,0.08)" : undefined,
      }}
      aria-hidden
    >
      {showImage && imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      ) : !photoMode && mark ? (
        <span
          className="flex h-full w-full items-center justify-center font-bold"
          style={{
            fontSize: size * 0.36,
            lineHeight: 1,
            paddingBottom: 1,
          }}
        >
          {mark}
        </span>
      ) : null}
    </div>
  );
}

function ModeChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex h-10 items-center justify-center rounded-[8px] px-4 text-[14px] font-bold leading-none transition-colors ${
        selected
          ? "bg-white text-[#15171A] shadow-sm"
          : "text-[#6B7280] hover:text-[#15171A]"
      }`}
    >
      {label}
    </button>
  );
}
