"use client";

import Link from "next/link";
import {
  CLASS_TABS,
  type ClassTabId,
  classTabHref,
} from "@/lib/class-tabs";
import { CLASS_LAYOUT } from "@/lib/class-layout";

type ClassTabsBarProps = {
  classId: string;
  activeTab: ClassTabId;
};

const L = CLASS_LAYOUT;

/**
 * 전 반 탭 공통 — SVG 데모 탭·구분선 가림 · contentLeft 정렬.
 */
export function ClassTabsBar({ classId, activeTab }: ClassTabsBarProps) {
  const wipeLeft = L.homeBleedLeft;
  const dividerWidth = L.contentRight - wipeLeft;
  /** SVG 원본 탭 밑줄(x2≈1527.81)까지 덮도록 여유 */
  const wipeWidth = 1530 - wipeLeft;

  return (
    <>
      {/* 개편안~타탭 SVG 잔여 탭·가로선까지 충분히 가림 (원본 밑줄 끝 1527.81 포함) */}
      <div
        className="pointer-events-none absolute z-20 bg-white"
        style={{
          left: wipeLeft,
          top: 0,
          width: wipeWidth,
          height: L.tabsWipeBottom,
        }}
        aria-hidden
      />

      {/* 전 탭 공통 상단 구분선 */}
      <div
        className="pointer-events-none absolute z-[21]"
        style={{
          left: wipeLeft,
          top: L.tabsBaseline,
          width: dividerWidth,
          height: 1,
          backgroundColor: "#E8E8EA",
        }}
        aria-hidden
      />

      <nav
        className="absolute z-30 flex items-end justify-start"
        style={{
          left: L.contentLeft,
          top: L.tabsTop,
          width: L.contentWidth,
          height: L.tabsBaseline - L.tabsTop,
          gap: 30,
          paddingLeft: 4,
        }}
        aria-label="반 메뉴"
      >
        {CLASS_TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <Link
              key={tab.id}
              href={classTabHref(classId, tab.id)}
              aria-current={active ? "page" : undefined}
              className="relative flex flex-col items-center outline-none focus:outline-none focus-visible:outline-none"
              style={{
                minWidth: 48,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <span
                className={`pb-2.5 text-[16px] leading-none ${
                  active
                    ? "font-bold text-[#15171A]"
                    : "font-semibold text-[#B0ABA3]"
                }`}
              >
                {tab.label}
              </span>
              {active ? (
                <span
                  className="absolute -bottom-px h-[3.24px] w-[60.55px] rounded-full bg-[#15171A]"
                  aria-hidden
                />
              ) : null}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
