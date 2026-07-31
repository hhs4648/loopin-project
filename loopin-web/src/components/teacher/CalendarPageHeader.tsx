"use client";

/**
 * 주간·월간 공통 「캘린더」타이틀.
 * SVG 아웃라인 타이틀·부제를 넓게 가리고 동일한 위치·크기로 표시.
 */
export function CalendarPageHeader() {
  return (
    <div
      className="absolute z-[28] bg-white"
      style={{
        left: 268,
        top: 20,
        width: 700,
        height: 86,
        paddingLeft: 28,
        paddingTop: 12,
      }}
    >
      <h1
        className="font-bold tracking-tight text-[#15171A]"
        style={{ fontSize: 30, lineHeight: "36px" }}
      >
        캘린더
      </h1>
      <p
        className="mt-1.5 font-medium text-[#9CA3AF]"
        style={{ fontSize: 14, lineHeight: "20px" }}
      >
        담당하는 모든 반의 일정을 한 곳에서
      </p>
    </div>
  );
}
