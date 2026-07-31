"use client";

type SchoolSettingsActionsProps = {
  dirty: boolean;
  onRevert: () => void;
  onSave: () => void;
};

/** school-settings.svg 우상단 — 프레임 1557 기준 right 고정으로 SVG와 맞춤 */
const FRAME_WIDTH = 1557;
const SAVE_RIGHT = FRAME_WIDTH - (1385.49 + 97.3); // ≈ 74.21
const ACTIONS_TOP = 63;
const ACTIONS_HEIGHT = 39;
const REVERT_WIDTH = 96;
const SAVE_WIDTH = 97;
const ACTIONS_GAP = 11;

/**
 * SVG 되돌리기·저장 위에 올리는 버튼 페어.
 * SVG 잔상은 뒤 배경으로 가리고, 같은 높이로 정렬.
 */
export function SchoolSettingsActions({
  dirty,
  onRevert,
  onSave,
}: SchoolSettingsActionsProps) {
  const pairWidth = REVERT_WIDTH + ACTIONS_GAP + SAVE_WIDTH;

  return (
    <div
      className="absolute z-30 flex items-center"
      style={{
        right: SAVE_RIGHT,
        top: ACTIONS_TOP,
        width: pairWidth,
        height: ACTIONS_HEIGHT,
        gap: ACTIONS_GAP,
        // SVG 버튼·글자 잔상 완전 가림
        backgroundColor: "#FFFFFF",
        padding: 0,
      }}
    >
      <button
        type="button"
        aria-label="되돌리기"
        disabled={!dirty}
        onClick={onRevert}
        className="flex h-full items-center justify-center rounded-[14px] text-[15px] font-bold leading-none outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#1AA7F2] disabled:cursor-not-allowed"
        style={{
          width: REVERT_WIDTH,
          backgroundColor: "#FFFFFF",
          border: "1.5px solid #15171A",
          color: "#15171A",
          opacity: 1,
          WebkitFontSmoothing: "antialiased",
        }}
      >
        되돌리기
      </button>

      <button
        type="button"
        aria-label="저장"
        disabled={!dirty}
        onClick={onSave}
        className="flex h-full items-center justify-center rounded-[14px] text-[15px] font-bold leading-none outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#1AA7F2] focus-visible:ring-offset-2 disabled:cursor-not-allowed"
        style={{
          width: SAVE_WIDTH,
          backgroundColor: dirty ? "#1AA7F2" : "#D1D5DB",
          color: dirty ? "#FFFFFF" : "#15171A",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        저장
      </button>
    </div>
  );
}
