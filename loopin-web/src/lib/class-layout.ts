/**
 * 반 화면 공통 레이아웃 (uiux.md §2.4 · §반 화면 탭)
 * 홈·과제·학생·설정 탭 헤더·탭바를 동일 좌표로 통일.
 */
export const CLASS_LAYOUT = {
  sidebarWidth: 238.93,
  /**
   * 사이드 회색 띠 끝 — 콘텐츠(홈 본문 `homeBleedLeft`)와 **흰 이격**.
   * 홈 기준 ≈ 44px 화이트 갭.
   */
  gutterGrayEnd: 250,
  /** 헤더·탭·주요 패널 왼쪽 */
  contentLeft: 324.375,
  contentWidth: 929.875,
  /** 개편안 홈 본문 SVG 시작 X (구분선·덮개 왼쪽) */
  homeBleedLeft: 293.875,
  /** 콘텐츠 오른쪽 끝 (홈 히어로 우측과 동일) */
  contentRight: 1500.995,
  headerTop: 20,
  headerHeight: 62,
  tabsTop: 84,
  /** 탭 밑줄·전탭 공통 구분선 y */
  tabsBaseline: 116,
  /** 탭·헤더 흰 덮개 하단 (구분선 아래 간격 확보 후 히어로 직전) */
  tabsWipeBottom: 132,
} as const;
