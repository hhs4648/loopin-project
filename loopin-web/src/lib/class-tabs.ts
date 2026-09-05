export type ClassTabId =
  | "home"
  | "assignments"
  | "students"
  | "settings";

export const CLASS_TABS: {
  id: ClassTabId;
  label: string;
  asset: string;
}[] = [
  { id: "home", label: "홈", asset: "class-home.svg" },
  { id: "assignments", label: "과제", asset: "class-assignments.svg" },
  { id: "students", label: "학생", asset: "class-students.svg" },
  { id: "settings", label: "설정", asset: "class-settings.svg" },
];

export function parseClassTab(raw: string | string[] | undefined): ClassTabId {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (
    value === "assignments" ||
    value === "students" ||
    value === "settings"
  ) {
    return value;
  }
  return "home";
}

export function classTabHref(classId: string, tab: ClassTabId): string {
  const base = `/teacher/classes/${classId}`;
  return tab === "home" ? base : `${base}?tab=${tab}`;
}

/**
 * 과제를 낸 뒤 열어 줄 반 홈.
 * 반이 여러 개면 `preferredId`(보고 있던 탭·이어서 내기 기준 반)를 우선한다.
 */
export function assignedClassHomeHref(
  classIds: readonly string[],
  preferredId?: string | null,
): string | null {
  const ids = [...new Set(classIds.filter(Boolean))];
  if (ids.length === 0) return null;
  const pick =
    preferredId && ids.includes(preferredId) ? preferredId : ids[0]!;
  return classTabHref(pick, "home");
}

export function classTabAsset(tab: ClassTabId): string {
  return CLASS_TABS.find((t) => t.id === tab)?.asset ?? "class-home.svg";
}

/** 설정 SVG의 #F7F7F8 캔버스를 다른 탭과 같이 white 로 맞춤 (에셋 파일은 수정하지 않음) */
export function normalizeClassSvgCanvas(svg: string): string {
  return svg.replace(/fill="#F7F7F8"/g, 'fill="white"');
}
