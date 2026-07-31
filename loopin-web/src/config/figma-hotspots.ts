import type { FigmaHotspot } from "@/components/figma/types";

/**
 * figma.md 화면별 클릭 영역 (투명 hit-area).
 * 좌표는 export SVG artboard 기준 (1557×973/974).
 * 사이드바는 화면 간 픽셀 동일 (uiux.md §2.3).
 *
 * 담당 반은 동적 생성 — AssignedClassesPanel.
 * 반 탭은 ClassTabsBar (가운데 정렬).
 */

/** 교사 공통 사이드바 (정적): 로고 / 캘린더 */
export function getTeacherSidebarHotspots(): FigmaHotspot[] {
  return [
    {
      id: "school-logo",
      x: 24,
      y: 28,
      width: 39,
      height: 39,
      href: "/teacher/school-settings",
      label: "학교 설정",
    },
    {
      id: "nav-calendar",
      x: 16,
      y: 155,
      width: 200,
      height: 40,
      href: "/teacher",
      label: "캘린더",
    },
  ];
}

/** @deprecated 탭은 ClassTabsBar 사용 — 사이드바 hit만 반환 */
export function getClassHomeHotspots(_classId: string): FigmaHotspot[] {
  return getTeacherSidebarHotspots();
}

export function getCalendarHomeHotspots(): FigmaHotspot[] {
  return getTeacherSidebarHotspots();
}

export function getSchoolSettingsHotspots(): FigmaHotspot[] {
  return getTeacherSidebarHotspots();
}

export function getProblemsListHotspots(): FigmaHotspot[] {
  return getTeacherSidebarHotspots();
}
