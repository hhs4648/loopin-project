type AlertBadgeIconProps = {
  /** 바깥 배지 한 변 (기본 삭제 모달용 44) */
  size?: number;
  /** 안쪽 심볼 크기 */
  iconSize?: number;
  /** 배지 배경 (기본 `#FEF2F2`) */
  background?: string;
  /** 심볼 색 (기본 `#EF4444`) */
  color?: string;
  className?: string;
};

/**
 * 삭제·경고 모달용 알림 아이콘.
 * 삼각형 경고 대신 원형 + 느낌표 (루핀 톤).
 */
export function AlertBadgeIcon({
  size = 44,
  iconSize = 22,
  background = "#FEF2F2",
  color = "#EF4444",
  className = "",
}: AlertBadgeIconProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${className}`}
      style={{ width: size, height: size, background }}
      aria-hidden
    >
      <AlertCircleGlyph size={iconSize} color={color} />
    </span>
  );
}

/** 통계 카드 등 배경 없는 원형 경고 심볼 */
export function AlertCircleGlyph({
  size = 18,
  color = "#EF4444",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke={color}
        strokeWidth="1.8"
      />
      <path
        d="M12 8v5"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.75" r="1.15" fill={color} />
    </svg>
  );
}
