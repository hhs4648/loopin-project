# 루핀 — 개발 워크플로 (Claude Code 가이드)

> **언제 쓰나?** 매일 개발할 때, Claude Code에게 뭐라고 말할지 모를 때

---

## 1. 초보자: MD 파일 사용법 (핵심)

### 1.1 MD는 "설계도", 코드는 "집"

```
MD 파일 = 설계도 (무엇을, 어떻게)
코드     = 실제 집 (구현)
Claude Code = 설계도 보고 집 짓는 도우미
```

### 1.2 작업 3단계 (매번 이렇게)

```
① 어떤 MD를 볼지 정한다
② MD 내용을 채우거나 확인한다
③ Claude Code에게 "OO.md 참조해서 XX해줘" 한다
```

### 1.3 상황별 — 어떤 MD를 쓰면 되나?

| 내가 하고 싶은 일 | 볼/쓸 MD | Claude Code에게 할 말 |
|-------------------|----------|----------------------|
| "단어 퀴즈 넣고 싶어" | requirements.md | "requirements F-003 기준으로 uiux.md 퀴즈 플로우 섹션 작성해줘" |
| "퀴즈 화면 만들어줘" | pages.md, uiux.md, design.md | "pages.md /student/quiz, uiux.md 퀴즈 UX, design.md 토큰으로 구현해줘" |
| "버튼 색 바꾸고 싶어" | design.md | "design.md primary 색 바꿨어, tokens.css 반영해줘" |
| "교사 과제 페이지" | pages.md, requirements F-008 | "pages.md /teacher/assignments/new, requirements F-008 구현해줘" |
| "프로젝트 처음 셋업" | tech-stack.md, architecture.md | "tech-stack.md로 Next.js 초기화, architecture.md 폴더 구조 만들어줘" |
| "Figma 디자인 있음" | figma.md, design.md | "figma.md 학생 대시보드 URL 참조, design.md 토큰 적용해줘" |
| "폴더 어디에 파일?" | architecture.md | "architecture.md에 맞게 QuizOption 컴포넌트 추가해줘" |

### 1.4 MD 작성 팁 (초보자)

1. **한 번에 다 안 써도 됨** — requirements만 채워도 시작 가능
2. **표를 수정하는 게 쉬움** — 기능 추가하면 표에 행 하나 추가
3. **모르겠으면 `_(미정)_` 남겨두기** — 나중에 채움
4. **코드 바꿨으면 MD도 업데이트** — 안 그러면 다음에 Claude가 헷갈림

### 1.5 좋은 프롬프트 vs 나쁜 프롬프트

```
❌ 나쁨: "퀴즈 만들어줘"

✅ 좋음:
pages.md의 /student/quiz/:id,
uiux.md 4.2 퀴즈 섹션,
design.md QuizOption 스타일,
architecture.md features/quiz 폴더에 맞게
단어 퀴즈 페이지 구현해줘. API는 mock 데이터로.
```

---

## 2. 루핀 개발 단계

### Phase 0: 기획 ✅ (지금)

- [x] requirements.md — 루핀 정의
- [x] uiux.md — 학생/교사 플로우
- [x] design.md — 색·컴포넌트
- [ ] figma.md — Figma URL (선택)
- [x] pages.md — 라우트 목록
- [x] tech-stack.md — Next.js + Supabase
- [x] architecture.md — 폴더 구조

### Phase 1: 프로젝트 셋업

```
프롬프트:
tech-stack.md 3절 명령어로 loopin-web 프로젝트 생성하고,
architecture.md 폴더 구조와 design.md tokens.css 적용해줘
```

### Phase 2: 공통 UI

```
프롬프트:
design.md 6절 Button, MissionCard, QuizOption, XPBar를
src/components/ui 및 features에 구현해줘
```

### Phase 3: 학생 MVP (우선)

| 순서 | 페이지 | 참조 MD |
|------|--------|---------|
| 1 | 로그인/회원가입 | pages, uiux 3.3 |
| 2 | 학생 대시보드 | pages 2.4, uiux 4.1 |
| 3 | 퀴즈 + 결과 | pages 2.5–2.6, requirements F-003 |
| 4 | 오답노트 | requirements F-005 |

### Phase 4: 교사 MVP

| 순서 | 페이지 | 참조 MD |
|------|--------|---------|
| 1 | 교사 대시보드 | pages 2.7 |
| 2 | 학급 관리 | requirements F-010 |
| 3 | 과제 만들기 | pages 2.8, requirements F-008 |

### Phase 5: 연동 & 배포

- Supabase 테이블, Auth
- Vercel 배포

---

## 3. 문서 참조 매트릭스

| 작업 | 필수 MD | 선택 MD |
|------|---------|---------|
| 새 기능 기획 | requirements | uiux |
| 페이지 구현 | pages, uiux, design | figma, architecture |
| 스타일만 | design | - |
| API | architecture, requirements | pages |
| 프로젝트 셋업 | tech-stack, architecture | design |

---

## 4. 코드 리뷰 체크리스트

- [ ] requirements.md 해당 기능과 맞음?
- [ ] uiux.md 플로우·빈/로딩/에러 있음?
- [ ] design.md 색·컴포넌트 사용?
- [ ] pages.md URL·역할 가드?
- [ ] architecture.md 폴더 위치?

---

## 5. 문서 업데이트 규칙

| 변경 | 업데이트할 MD |
|------|---------------|
| 기능 추가 | requirements.md |
| 화면 동작 변경 | uiux.md |
| 새 페이지 | pages.md |
| 색/폰트 변경 | design.md |
| Figma 수정 | figma.md |

---

## 6. 빠른 참조

```
무엇을?     → requirements.md
어떻게 쓰나? → uiux.md
어떻게 생겼나? → design.md (+ figma.md)
어떤 URL?   → pages.md
코드 구조?  → architecture.md
어떤 기술?  → tech-stack.md
어떻게 작업? → development.md (이 파일)
시작점      → README.md
```

---

## 7. 다음에 할 일 (추천)

1. ~~**tech-stack.md** 보고 `pnpm create next-app` 실행~~ — `loopin-web`은 이미 npm으로 생성·운영 중 (tech-stack.md 참조)
2. **학생 퀴즈** 한 화면부터 mock 데이터로 만들기
3. Figma 쓰면 **figma.md**에 URL 붙이기
