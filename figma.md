# 루핀 — Figma 명세

> **언제 쓰나?** 디자인 에셋을 코드로 옮길 때  
> **에셋 위치**: `assets/` **만** 사용

---

## ⚠️ 필수 규칙

### 디자인은 이미 완료됨 — 임의 생성·수정 금지

- 제공한 SVG/PNG를 **그대로** 구현 (색·레이아웃·문구 수정 X)
- AI가 디자인을 **알아서 만들지 말 것**
- 클릭 필요 시 **투명 hit-area만** 추가
- 예외: 반 상단 탭은 SVG가 좌측 정렬이어도 **왼쪽 정렬 오버레이**로 통일 (`ClassTabsBar`)

### 에셋은 assets/ 에만

```
❌ public/, figma/ 등 다른 폴더에 복사·생성하지 않음
❌ 하위 폴더 임의로 나누지 않음 (사용자 지시 시만)
✅ assets/ 에 파일 넣기
✅ AI가 assets/ 안에서 파일명만 영문으로 rename
```

---

## 1. assets 폴더

**사용자**: SVG·사진을 `assets/`에 넣는다.  
**AI**: `assets/` 안에서만 파일명을 영문 kebab-case로 변경한다.

```
assets/
├── calendar-home.svg
├── calendar-monthly.svg
├── class-home.svg
├── class-assignments.svg
├── class-students.svg
├── class-sessions.svg
├── class-settings.svg
├── school-settings.svg
├── my-settings.svg
├── praise-calendar-example.svg
├── problems-list.svg
└── README.md
```

> 이미지 폴더 나누기(`images/` 등)는 **나중에 사용자가 지시할 때** 진행.

### AI 파일명 정리

| 넣은 파일 | rename 후 |
|-----------|-----------|
| `캘린더 홈화면.svg` | `calendar-home.svg` |
| `월간 캘린더.svg` | `calendar-monthly.svg` |
| `반 홈.svg` | `class-home-legacy.svg` (이전) |
| `반 홈 — 개편안.svg` | `class-home.svg` (**현재 반 홈**) |
| `반 과제.svg` | `class-assignments.svg` |
| `반 학생.svg` | `class-students.svg` |
| `반 차시.svg` | `class-sessions.svg` |
| `반 설정.svg` | `class-settings.svg` |
| `학교 설정.svg` | `school-settings.svg` |
| `내 설정.svg` | `my-settings.svg` |
| `칭찬 캘린더 예시 화면.svg` | `praise-calendar-example.svg` |
| `문제 관리 목록.svg` | `problems-list.svg` |

- **내용 수정 X** — **이름만** 변경
- **복사본 만들지 않음** — rename/move만
- **다른 폴더에 파일 만들지 않음**

---

## 2. 화면 목록

| 화면 | assets 파일 | URL | 비고 |
|------|-------------|-----|------|
| **캘린더 홈** (첫 화면) | `calendar-home.svg` | `/teacher` | 교사 진입 · **주간** 기본 |
| **월간 캘린더** | `calendar-monthly.svg` | `/teacher` (토글 **월간**) | 참고 에셋 · 실제 UI는 `CalendarMonthlyPanel` |
| 반 홈 | `class-home.svg` | `/teacher/classes/[classId]` | **개편안** · 사이드바·탭 오버레이 유지 |
| 반 과제 | `class-assignments.svg` | `?tab=assignments` | |
| 반 학생 | `class-students.svg` | `?tab=students` | |
| 반 차시 | `class-sessions.svg` | `?tab=sessions` | |
| 반 설정 | `class-settings.svg` | `?tab=settings` | 에셋 추가 필요 |
| 학교 설정 | `school-settings.svg` | `/teacher/school-settings` | 학교 로고 클릭 |
| **내 설정** | `my-settings.svg` | `/teacher/settings` | 사이드바 하단 **설정** · 본문만(1153×973) · 공통 사이드바 오른쪽에 배치 |
| **칭찬 캘린더 예시** | `praise-calendar-example.svg` | `/teacher/settings` (칭찬 캘린더 **?** 호버) | 학생 앱 칭찬 캘린더 화면 · **수정 없이** 축소 팝오버 |
| **문제 관리 목록** | `problems-list.svg` | `/teacher/problems` | 사이드바 **문제 관리** |

`/` → `/teacher` 로 리다이렉트.

---

## 3. 클릭 영역 (hit-area)

### 3.1 공통 사이드바 (모든 교사 화면)

| id | 영역 (x,y,w,h) | URL |
|----|----------------|-----|
| `school-logo` | 24,28,39,39 | `/teacher/school-settings` |
| `nav-calendar` | 16,155,200,40 | `/teacher` |

- **담당 반**은 동적 (`AssignedClassesPanel`) — 캘린더 · 반 화면 · 학교 설정 **전부 동일**
- 초기: `+ 새 반 추가`만 / 생성 후: 이름+색 목록
- 반 색상 **8종**, 팝업에서 요일·시간 설정 (`uiux.md` §2.3)
- 사이드바 메뉴 글자 **bold**
- **사이드바를 고칠 때 한 화면만 수정하지 말 것**

코드: `TeacherFigmaFrame` + `SidebarBackdrop` + `SidebarBrandHeader`

### 3.2 반 화면 탭 · 헤더

| 요소 | 구현 |
|------|------|
| **상단 이름·색** | `ClassPageHeader` — `+ 새 반 추가`로 저장한 이름·색 |
| **탭** | `ClassTabsBar` — **왼쪽 정렬** (홈·과제·학생·차시·설정) |
| **탭 URL** | 홈 `/teacher/classes/[id]` · 과제 `?tab=assignments` · 학생 `?tab=students` · 차시 `?tab=sessions` · 설정 `?tab=settings` |

- hit-area는 투명 / 포커스 네모 없음
- 화면 viewport **왼쪽 정렬**
- SVG에 박힌 좌측 탭·데모 반 이름은 오버레이로 가림

코드: `loopin-web/src/lib/class-tabs.ts`, `ClassTabsBar`, `ClassPageHeader`

---

## 4. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-13 | assets/ 만 사용, 다른 폴더 복사 금지 |
| 2026-07-14 | 반 홈 탭 hit-area, 왼쪽 정렬, 포커스 네모 제거 |
| 2026-07-14 | 캘린더 홈 첫 화면, 담당 반 동적화 |
| 2026-07-14 | 전 화면 공통 사이드바, 8색·요일·시간 팝업, bold |
| 2026-07-14 | 월간 캘린더 에셋 · 주간 토·일 · 주차 이동 · 월간 캘린더 토글 |
| 2026-07-14 | 문제 관리 목록 (`problems-list.svg` · `/teacher/problems`) |
| 2026-07-14 | 반 홈 → 개편안 `class-home.svg` (구버전 `class-home-legacy.svg`) |
