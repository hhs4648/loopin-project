import type { NextConfig } from "next";
import path from "path";
import type { Configuration } from "webpack";

const nextConfig: NextConfig = {
  turbopack: {
    // 상위 loopin-project 폴더와 lockfile이 섞여 루트를 잘못 잡지 않게 고정
    root: path.join(__dirname),
  },
  webpack: (config: Configuration, { dev }) => {
    // Windows에서 .next 캐시 파일이 깨지며 incorrect data check가 반복되는 것 방지
    if (dev) {
      config.cache = { type: "memory" };
    }
    return config;
  },
};

export default nextConfig;
