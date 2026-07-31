export const FRAME_W = 393;
export const FRAME_H = 852;

export function figmaRectStyle(rect: {
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  return {
    left: `${(rect.x / FRAME_W) * 100}%`,
    top: `${(rect.y / FRAME_H) * 100}%`,
    width: `${(rect.w / FRAME_W) * 100}%`,
    height: `${(rect.h / FRAME_H) * 100}%`,
  };
}
