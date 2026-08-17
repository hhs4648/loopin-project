import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // 상위 loopin-project 폴더와 lockfile이 섞여 루트를 잘못 잡지 않게 고정
    root: path.join(__dirname),
  },
  // config 타입은 NextConfig가 문맥으로 제공한다 (webpack 패키지는 별도 설치돼 있지 않음)
  webpack: (config, { dev }) => {
    // Windows에서 .next 캐시 파일이 깨지며 incorrect data check가 반복되는 것 방지
    if (dev) {
      config.cache = { type: "memory" };
    }
    return config;
  },
};

export default nextConfig;
