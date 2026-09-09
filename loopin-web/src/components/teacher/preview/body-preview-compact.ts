/**
 * 본문(문장) 미리보기 전용 축소 스타일.
 *
 * 학생 앱 `exercise-typography`와 분리한다. 미리보기는 「이런 문제」라는
 * 느낌만 주면 되므로 조각 버튼·문장 상자를 작게 써서 한 화면에 다 보이게 한다.
 */

export const BODY_PREVIEW_OPTION_CLASS =
  "text-[10px] font-semibold leading-tight tracking-[-0.01em] text-[#1E1E1E] antialiased";

export const BODY_PREVIEW_EMPTY_HINT_CLASS =
  "text-[10px] font-medium leading-snug text-[#9AA4B4] antialiased";

export const BODY_PREVIEW_TILE_CLASS =
  "rounded-[6px] border border-[#C9D9EE] bg-white px-1 py-0.5 shadow-none";

export const BODY_PREVIEW_PLACED_CLASS =
  "cursor-pointer rounded-[5px] border border-[#3C86FF] bg-white px-0.5 py-px shadow-none";

/** 아이디·화자처럼 처음부터 정답으로 박아 두는 조각 */
export const BODY_PREVIEW_GIVEN_CLASS =
  "cursor-default rounded-[5px] border border-[#3C86FF] bg-[#EAF2FF] px-0.5 py-px shadow-none";
