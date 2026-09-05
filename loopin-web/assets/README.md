# assets

Figma export / 사진 / SVG를 **여기에만** 넣으세요.

## 규칙

- 에셋은 **`assets/` 폴더에만** 둡니다.
- `public/`, `figma/` 등 **다른 곳에 복사하지 않습니다.**
- AI는 **파일 내용 수정 X**, **이름만** 영문 kebab-case로 변경 (rename).
- 하위 폴더 나누기는 **사용자가 지시할 때만**.

## 현재 파일

| 파일 | 화면 |
|------|------|
| `calendar-home.svg` | 캘린더 홈 · 주간 (교사 첫 화면) |
| `calendar-monthly.svg` | 월간 캘린더 |
| `class-home.svg` | 반 홈 (**개편안**) |
| `class-home-legacy.svg` | 반 홈 (이전 버전) |
| `class-assignments.svg` | 반 과제 |
| `class-students.svg` | 반 학생 |
| `class-sessions.svg` | 반 차시 |
| `class-settings.svg` | 반 설정 |
| `school-settings.svg` | 학교 설정 |
| `my-settings.svg` | 내 설정 (사이드바 「설정」) |
| `praise-calendar-example.svg` | 칭찬 캘린더 학생 화면 예시 (내 설정) |
| `problems-list.svg` | 문제 관리 목록 |
| `1920w light.svg` | 새 문제 세트 폼 (문제 관리 본문에 인라인) |
| `과제 부여.svg` | **과제 부여** — 문제 제출 화면 「제출하기」로 열리는 900×1630 오버레이 (`AssignAssignmentModal`). 시안에 없는 **파트별 부여** 왼쪽 패널이 캘린더 옆에 추가돼 있다(파트를 각각 다른 수업일에 끌어다 놓는 기능) |
| `part-assign-sidebar.svg` | **파트별 부여** 왼쪽 트레이 시안 (`AssignAssignmentModal` 좌측 · React로 재현) |
| `과제 부여 취소 팝업.svg` | 반 과제 탭에서 **부여 취소** 확인 팝업 (`ClassAssignmentsPanel`) |
| `반과제 화면.svg` | 반 과제 |
| `저장된 문제 세트.svg` | 사용자 지정 과제 제출 목록 |

> 상태가 바뀌는 화면(탭·체크·캘린더 선택)은 SVG를 그대로 띄우면 상태를 보여줄 수 없어서
> **시안대로 React로 재현**한다 — 문제 제출 화면(`1920w light.svg`)과 과제 부여 화면이 그렇다.
> 정적인 화면만 `FigmaScreen`으로 SVG를 그대로 렌더하고 투명 hit-area를 얹는다.
