import fs from "fs";
import path from "path";

/**
 * SVG 에셋 폴더.
 * - 로컬/모노레포: loopin-web 기준 `../assets`
 * - Vercel CLI를 loopin-web만 올릴 때: `loopin-web/assets` 복사본
 */
export function getAssetsDir(): string {
  const candidates = [
    path.join(process.cwd(), "assets"),
    path.join(process.cwd(), "..", "assets"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[1]!;
}

export function readAssetFile(filename: string): string {
  const filePath = path.join(getAssetsDir(), filename);
  return fs.readFileSync(filePath, "utf-8");
}
