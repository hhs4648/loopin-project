import fs from "fs";
import path from "path";

/** 프로젝트 루트의 assets/ 폴더 (loopin-web 기준 ../assets) */
export function getAssetsDir(): string {
  return path.join(process.cwd(), "..", "assets");
}

export function readAssetFile(filename: string): string {
  const filePath = path.join(getAssetsDir(), filename);
  return fs.readFileSync(filePath, "utf-8");
}
