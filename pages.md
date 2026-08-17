# 루핀 — 페이지 명세

> **언제 쓰나?** "이 URL 페이지 만들어줘" 할 때, 라우팅·레이아웃·구성 요소 확인할 때  
> UX 상세: [uiux.md](./uiux.md) | Figma: [figma.md](./figma.md)

## 1. 라우팅 구조

### 1.1 전체 라우트

| 경로 | 페이지명 | 레이아웃 | 인증 | 역할 | 우선순위 | 상태 |
|------|----------|----------|------|------|----------|------|
| `/` | 랜딩 | Public | N | - | P0 | 미착수 |
| `/login` | 로그인 | Auth | N | 공통 | P0 | 미착수 |
| `/signup` | 회원가입 | Auth | N | 공통 | P0 | 미착수 |
| `/student` | 학생 대시보드 | Student | Y | 학생 | P0 | 미착수 |
| `/student/mission` | 오늘의 미션 | Student | Y | 학생 | P0 | 미착수 |
| `/student/quiz/:id` | 퀴즈 | Student | Y | 학생 | P0 | 미착수 |
| `/student/quiz/:id/result` | 퀴즈 결과 | Student | Y | 학생 | P0 | 미착수 |
| `/student/wrong-notes` | 오답노트 | Student | Y | 학생 | P0 | 미착수 |
| `/student/profile` | 학생 프로필 | Student | Y | 학생 | P1 | 미착수 |
| `/teacher` | **캘린더 홈** (교사 첫 화면) | Teacher | Y | 교사 | P0 | **구현됨** (calendar-home.svg) |
| `/teacher/classes` | 학급 목록 | Teacher | Y | 교사 | P0 | 미착수 |
| `/teacher/school-settings` | **학교 설정** | Teacher | Y | 교사 | P0 | **구현됨** (Figma SVG) |
| `/teacher/classes/:id` | **반 홈** (학급 상세, `?tab=`로 과제/학생/설정) | Teacher | Y | 교사 | P0 | **구현됨** (class-home.svg, 중1 영어) |
| `/teacher/problems` | **문제 제출** (문제 관리 기본) | Teacher | Y | 교사 | P0 | **구현됨** (problems-list.svg) — 실질적인 과제 출제 화면. 아래 `/teacher/assignments/new`를 대체함 |
| `/teacher/problems/saved` | 사용자 지정 과제 제출 | Teacher | Y | 교사 | P0 | **구현됨** |
| `/teacher/vocab` | **단어장 만들기** (부가기능) | Teacher | Y | 교사 | P1 | **구현됨** (엑셀 복붙 · 짝맞추기/퀴즈 연습) |
| `/teacher/assignments/new` | ~~과제 만들기~~ | Teacher | Y | 교사 | P0 | **대체됨** → `/teacher/problems`(출제) + `/teacher/classes/:id?tab=assignments`(현황)로 구현됨. 원래 계획한 이 URL은 쓰지 않음 |
| `/teacher/assignments/:id` | ~~과제 상세~~ | Teacher | Y | 교사 | P0 | **대체됨** → `/teacher/classes/:id?tab=assignments`로 구현됨. 원래 계획한 이 URL은 쓰지 않음 |
| `/teacher/settings` | **내 설정** | Teacher | Y | 교사 | P1 | **구현됨** (`my-settings.svg` · 사이드바 「설정」) |

### 1.2 레이아웃

| 레이아웃 | 요소 | 사용 경로 |
|----------|------|-----------|
| `Public` | 헤더(로고, 로그인), 푸터 | `/` |
| `Auth` | 로고, 중앙 카드 | `/login`, `/signup` |
| `Student` | 모바일: 하단 탭 / PC: 사이드바 | `/student/*` |
| `Teacher` | 좌측 사이드바, 상단 바 | `/teacher/*` |

### 1.3 역할별 리다이렉트

| 상황 | 이동 |
|------|------|
| 로그인 성공 (학생) | `/student` |
| 로그인 성공 (교사) | `/teacher` |
| 학생이 `/teacher` 접근 | `/student` |
| 교사가 `/student` 접근 | `/teacher` |
| 비로그인 → 보호 경로 | `/login` |

---

## 2. 페이지 상세

### 2.1 랜딩 (`/`)

| 항목 | 내용 |
|------|------|
| 목적 | 서비스 소개, 가입 유도 |
| 인증 | 불필요 |

**구성**

| 컴포넌트 | 내용 |
|----------|------|
| Hero | "내신 영어, 루핀과 함께" + CTA |
| StudentSection | 학생용: 재미있는 퀴즈, XP |
| TeacherSection | 교사용: 간편 과제, 자동 채점 |
| CTA | "무료로 시작하기" → `/signup` |

---

### 2.2 로그인 (`/login`)

| 컴포넌트 | 필드 |
|----------|------|
| LoginForm | email, password |
| Link | `/signup`, 비밀번호 찾기(2차) |

---

### 2.3 회원가입 (`/signup`)

| 단계 | 내용 |
|------|------|
| 1 | 역할 선택: 학생 / 교사 |
| 2a (학생) | 이름, 이메일, 비밀번호, **학급 코드** |
| 2b (교사) | 이름, 이메일, 비밀번호, 학교명 |

---

### 2.4 학생 대시보드 (`/student`)

| 컴포넌트 | 데이터 |
|----------|--------|
| ProfileSummary | 레벨, XP, 연속 학습일 |
| MissionList | API: 오늘의 과제 + 추천 |
| RecentScores | 최근 퀴즈 3개 |

---

### 2.5 퀴즈 (`/student/quiz/:id`)

| 컴포넌트 | 데이터 |
|----------|--------|
| QuizProgress | current / total |
| QuestionCard | question, options |
| QuizTimer | optional |
| Submit | 마지막 문제 후 결과로 |

---

### 2.6 퀴즈 결과 (`/student/quiz/:id/result`)

| 컴포넌트 | 데이터 |
|----------|--------|
| ScoreDisplay | score, xpEarned |
| WrongList | 틀린 문항 |
| Actions | 홈, 오답노트, 재도전 |

---

### 2.7 교사 대시보드 (`/teacher`)

> **실제 구현은 아래 표가 아니라 캘린더 홈이다.** `/teacher`는 1.1에 있듯 `calendar-home.svg` 기반 **캘린더** 화면으로 구현되었다 (주간/월간 토글, 오늘의 수업·과제 사이드바 등 — 상세는 figma.md 2절, uiux.md §2.3 "캘린더 홈" 참조). 아래 StatsCards/ClassOverviewList 표는 초기 기획 당시의 통계형 대시보드 구상이며 **현재 이 URL에는 없다** — 필요하면 캘린더 화면 안의 요약 위젯으로 재검토한다.

| 컴포넌트 | 데이터 |
|----------|--------|
| StatsCards | 학급 수, 활성 과제, 평균 제출률 |
| ClassOverviewList | 반별 요약 |
| QuickActions | 새 과제, 학급 추가 |

---

### 2.8 과제 만들기 (`/teacher/assignments/new`)

| 필드 | 유효성 |
|------|--------|
| title | 필수 |
| type | word / grammar |
| questionCount | 5–30 |
| dueAt | 미래 날짜 |
| classIds | 1개 이상 |

---

### 2.9 학급 상세 (`/teacher/classes/:id`)

| 컴포넌트 | 데이터 |
|----------|--------|
| ClassHeader | 반 이름, 학생 수, 초대 코드 |
| StudentTable | 이름, 최근 점수, 제출률 |
| AssignmentList | 이 반 과제 목록 |

---

## 3. 공통 컴포넌트

| 컴포넌트 | 경로 | 사용처 |
|----------|------|--------|
| `StudentNav` | `components/layout/` | 학생 레이아웃 |
| `TeacherNav` | `components/layout/` | 교사 레이아웃 |
| `MissionCard` | `components/features/mission/` | 학생 대시보드 |
| `QuizOption` | `components/features/quiz/` | 퀴즈 |
| `XPBar` | `components/features/gamification/` | 학생 UI |
| `ClassCard` | `components/features/class/` | 교사 대시보드 |

---

## 4. 에러 페이지

| 경로 | 메시지 |
|------|--------|
| 404 | "페이지를 찾을 수 없어요" |
| 403 | "접근 권한이 없어요" |

---

## 5. 페이지 구현 체크리스트

- [ ] 라우트 + 역할 가드
- [ ] 레이아웃 적용
- [ ] Loading / Empty / Error
- [ ] 모바일 반응형
- [ ] uiux.md 플로우 일치
