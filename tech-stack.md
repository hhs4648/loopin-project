# 루핀 — 기술 스택

> **언제 쓰나?** 프로젝트 처음 만들 때, "뭘로 개발할지" 확정할 때  
> **초보자 추천**: 아래 스택은 문서 많고 Claude Code가 잘 아는 조합입니다.

## 1. 스택 요약 (2026-07-21 기준 — `loopin-web/package.json` 실제 상태)

> 아래 "현재 설치됨"은 `loopin-web/package.json`에 실제로 있는 것만 표시. "예정"은 기획 당시 후보였지만 아직 설치·사용되지 않은 항목 — 필요해지면 추가.

| 영역 | 선택 | 상태 | 비고 |
|------|------|------|------|
| 언어 | TypeScript | 현재 설치됨 | 타입으로 실수 줄이기 |
| 프레임워크 | **Next.js 16** (App Router, `16.2.10`) | 현재 설치됨 | 페이지+API 한 프로젝트 · `next dev --webpack` (Turbopack 아님) |
| 스타일 | Tailwind CSS 4 | 현재 설치됨 | design.md 토큰 매핑 |
| UI 베이스 | shadcn/ui | 예정 (미설치) | Button, Input 등 빠른 시작 — 현재는 Figma SVG 오버레이(`FigmaScreen`) 방식 |
| DB + 인증 | **Supabase** (`@supabase/supabase-js`) | 현재 설치됨 | PostgreSQL + Anonymous Auth |
| 서버 상태 | TanStack Query | 예정 (미설치) | 과제·퀴즈 목록 — 현재는 `src/lib/*.ts` + localStorage 직접 관리 |
| 클라이언트 상태 | Zustand | 예정 (미설치) | 퀴즈 풀이 중간 상태 |
| 폼 | React Hook Form + Zod | 예정 (미설치) | 과제 만들기, 회원가입 — 현재 폼은 순수 React state |
| 아이콘 | Lucide React | 예정 (미설치) | 현재는 Figma SVG에 포함된 아이콘·직접 그린 인라인 SVG 사용 |
| 패키지 매니저 | **npm** | 현재 사용 중 | `package-lock.json` 존재, pnpm-lock 없음 |
| 배포 | Vercel | 예정 | Next.js 최적 · 아직 미배포 |
| 테스트 (2차) | Vitest, Playwright | 예정 (미설치) | 테스트 스위트 없음 · 현재는 lint + `tsc`(빌드 시)만 |

---

## 2. 왜 이 스택인가 (초보자용)

| 기술 | 한 줄 설명 |
|------|-----------|
| Next.js | `pages.md`의 URL이 폴더랑 거의 1:1로 맞음 |
| Supabase | DB+로그인 따로 안 깔아도 됨 |
| Tailwind | `design.md` 색을 class로 바로 씀 |
| shadcn/ui | (예정) 코드 복사해서 내 것처럼 수정 가능 — 도입 전까지는 Figma 에셋 오버레이로 구현 |

---

## 3. 프로젝트 초기화 (이미 완료됨 — 참고용)

> `loopin-web/`은 이미 생성되어 있고 **npm**을 사용 중이다. 아래는 최초 셋업 시 실행한(또는 재현 시 실행할) 명령이며, 새로 `pnpm`으로 바꾸지 않는다.

```bash
# 1. Next.js 생성 (완료됨)
npx create-next-app@latest loopin-web --typescript --tailwind --eslint --app --src-dir

cd loopin-web

# 2. 의존성 (현재 설치됨)
npm install @supabase/supabase-js

# 3. 아래는 "예정" 스택 도입 시 실행할 명령 (아직 미설치)
npm install @tanstack/react-query zustand
npm install react-hook-form @hookform/resolvers zod
npm install lucide-react clsx tailwind-merge class-variance-authority
npx shadcn@latest init
npx shadcn@latest add button input card dialog toast badge progress
```

### 3.1 design.md 토큰 적용

`src/styles/tokens.css` 생성 후 `globals.css`에서 import.

---

## 4. 코딩 컨벤션 (간단)

| 대상 | 규칙 | 예시 |
|------|------|------|
| 컴포넌트 파일 | PascalCase | `MissionCard.tsx` |
| 훅 | use + camelCase | `useQuiz.ts` |
| API 라우트 | 소문자 | `api/quizzes/[id]/route.ts` |
| 커밋 | `feat(quiz): add word quiz page` | |

---

## 5. Git 브랜치

> **현재 상태**: `loopin-web` 리포는 아직 `master` 브랜치 하나뿐 (`develop`·`feature/*` 없음). 아래는 앞으로 브랜치를 나눌 때 쓸 규칙.

| 브랜치 | 용도 |
|--------|------|
| `main`(또는 현재 `master`) | 배포용 |
| `develop` | 개발 통합 |
| `feature/student-quiz` | 기능별 |

---

## 6. 미결정 (나중에)

| 항목 | 후보 |
|------|------|
| 이메일 알림 | Resend, SendGrid |
| 분석 | Vercel Analytics, Mixpanel |
| 모바일 앱 | React Native, Capacitor |
