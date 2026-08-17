<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# 루핀 교사 웹 — 에이전트 공용 규칙

> **이 파일이 단일 소스입니다.** Cursor와 Claude Code가 **둘 다** 이 파일을 읽습니다.
> - Cursor: `AGENTS.md`를 네이티브로 읽음 + `../.cursor/rules/shared-agents.mdc`가 한 번 더 지시
> - Claude Code: `CLAUDE.md`가 `@AGENTS.md`로 임포트
>
> 규칙을 바꿀 땐 **이 파일만** 고치세요. `CLAUDE.md`에 내용을 되돌려 넣지 마세요 —
> 두 도구가 서로 다른 규칙을 보게 되는 원인이 됩니다.
> 위쪽 `BEGIN/END:nextjs-agent-rules` 블록은 자동 생성 구간이니 손대지 마세요.

## 먼저 읽을 것

**`HANDOFF.md`** (이 리포 루트) — 출시 준비(2026-08-12)를 하며 밟았던 함정을 모아
뒀습니다. 규칙이 아니라 **배경**입니다. 아래를 건드리기 전에는 반드시 보세요.

- **마이그레이션 001~012를 전부 올려야 합니다.** 학생 앱이 `012`의 DB 트리거에
  의존합니다(점수·진행률을 서버가 계산). 빠지면 조용히 고장 납니다.
- **과제 예약 공개**(`open_at`) — 수업 종료 시각 계산, KST 고정, 오답 재출제는 예외
- **재출제 상태 칩** — 점수에서 문항 수를 역산하지 마세요
- **학생 삭제** — 로컬만 지우면 되살아납니다
- **lint 32건** — 상당수가 Next.js 하이드레이션이라 **규칙이 틀린 경우**입니다.
  억지로 고치면 나빠집니다

> 학생 앱 쪽 함정은 그 리포의 `HANDOFF.md`에 따로 있습니다(폴더가 달라 여기서는 못 읽습니다).

## 언어

결과값과 설명은 무조건 한글로 작성한다. 코드/식별자/커밋 메시지의 영어 규칙(예: PascalCase 컴포넌트명, `feat(scope): ...` 커밋 포맷)은 그대로 따르되, 사용자에게 보여주는 설명·요약·주석은 한국어로 작성한다.

**Next.js version warning:** this project runs Next.js 16.2.10, not the Next.js 15/14 you may know from training data. Before touching routing, config, or build behavior, check `node_modules/next/dist/docs/` for the current API — App Router conventions and `next.config.ts` options may differ from what you expect.

## Commands

Run from `loopin-web/` (the npm project lives here; the parent `loopin-project/` only has a thin wrapper `package.json` that does `npm --prefix loopin-web run <script>`). Note the **git repo root is `loopin-project/`**, one level up — `git status` from here shows paths prefixed with `loopin-web/`.

- `npm run dev` — dev server (`next dev --webpack`; webpack is explicit, not the default Turbopack)
- `npm run build` — production build (`next build`)
- `npm run start` — serve the production build
- `npm run lint` — ESLint (flat config: `next/core-web-vitals` + `next/typescript`)

There is no test suite and no single-test command — lint + `tsc` (via build) are the only checks.

### 화면까지 확인해야 할 때

`tsc`·`build` 통과는 **화면이 맞다는 증거가 아니다.** 문제은행·청크·학생 미리보기처럼
눈으로 봐야 하는 변경은 앱을 띄워서 확인하고, 그 절차는 한 곳에 정리해 두었다.

> **`../.claude/skills/run-loopin-web/SKILL.md`** (리포 루트 기준 `.claude/skills/`)

dev 서버 중복 실행 방지, 브라우저 드라이버 구성(`playwright-core`가 고아 bin 링크라
그냥은 안 된다), 커스텀 드롭다운 `aria-label` 셀렉터 표, 미리보기까지 가는 순서와
함정, 결과를 오해하지 않는 법이 들어 있다. **매번 다시 헤매지 말고 이 문서를 먼저 읽는다.**

Claude Code는 이 파일을 스킬로 자동 인식하고, Cursor는 위 경로를 직접 열면 된다 —
내용은 도구와 무관한 일반 마크다운이다.

## Product context

This is the **teacher-facing** half of Loopin, a Korean middle-school English 내신(exam) prep product. The **student-facing** app (`loopin-webapp`) is a separate repo/git project with its own Supabase project sharing the same schema conventions. The actually-implemented surface here is teacher calendar management, problem/assignment authoring, and class management — not the student quiz flow.

The living product spec lives one directory **above** this repo, in `loopin-project/` (parent of `loopin-web/`): `requirements.md`, `architecture.md`, `design.md`, `pages.md`, `tech-stack.md`, `uiux.md`, `figma.md`. Consult these before implementing a feature — particularly:
- `uiux.md` §2.3 — the button/link → destination map.
- `figma.md` — rules for using the frozen Figma-exported assets in `../assets/` (parent dir).

## Cursor rule you must follow

`../.cursor/rules/uiux-button-destinations.mdc` (`alwaysApply: true`): **any time you add or change a button, link, `router.push`/`replace`, modal open/close, tab switch, or a hotspot in `figma-hotspots.ts`, update the corresponding row in `uiux.md` §2.3 in the same change.** If a button is not wired up yet, mark it explicitly as 미구현 rather than leaving the table wrong.

## Architecture

**Figma-asset-driven screens.** Full-screen SVGs live in `../assets/` (outside this repo, read via `src/lib/assets.ts`'s `readAssetFile`, relative to `loopin-web`'s cwd). `components/figma/FigmaScreen.tsx` renders that SVG verbatim via `dangerouslySetInnerHTML` (no modification) and overlays invisible `<Link>` hit-areas from `hotspots` props, positioned in absolute pixel coordinates against the SVG's export artboard (1557×973/974). Hotspot coordinates for each screen are centralized in `src/config/figma-hotspots.ts`. Do not redesign or re-render text/labels over the SVG — only add/adjust transparent hit-areas. The teacher sidebar hotspots (`getTeacherSidebarHotspots`) are shared across every teacher screen and must stay pixel-identical everywhere; don't fix a sidebar issue on only one screen.

**Local-first data, Supabase-second.** Feature state (classes, calendar/schedule, problem sets, assignments, students, teacher profile, settings) is modeled in plain `src/lib/*.ts` modules (`class-assignments.ts`, `calendar-*.ts`, `problem-sets.ts`, `teacher-classes.ts`, `teacher-profile.ts`, `school-brand.ts`, `korean-holidays.ts`, etc.) and persisted to localStorage under `loopin-*` keys — this is the source of truth for the UI. `src/lib/sync/*` (`supabase-client.ts`, `teacher-session.ts`, `teacher-sync.ts`, `content-snapshot.ts`, `types.ts`) mirrors writes to Supabase in a **best-effort, non-blocking** way: every sync function checks `isSyncEnabled()` first and swallows failures with `console.warn` rather than throwing — never make sync a hard dependency for a UI action to succeed. Migration to Supabase as the real source of truth is not finished; check whether a given feature actually reads from Supabase or only writes to it before assuming it's live.

**Supabase schema** is defined in `supabase/migrations/001_loopin_sync.sql` (Postgres + Anonymous Auth + Realtime, `pgcrypto` for UUIDs): `profiles` (role-checked student/teacher), `classes` (string ids `class-*`, 6-char `[A-Z0-9]` invite codes, a `payload jsonb` escape hatch for the full local object shape), `class_invites`, `enrollments`, and attempt/progress tables. Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`; sync is disabled entirely if these are unset).

**Routing** (`src/app/`, App Router): `/teacher` (calendar home), `/teacher/classes/[classId]` (tabs: home/assignments/students/settings — one dynamic route, not separate pages per tab), `/teacher/problems`, `/teacher/problems/saved`, `/teacher/school-settings`, `/teacher/settings`. `src/components/teacher/` holds one component per panel/modal (large, flat directory — grep by feature name, e.g. `Calendar*`, `Class*`, `Problem*`, `Sidebar*`). Path alias `@/*` → `src/*`.

**Data tooling** (`../scripts/`, parent dir): one-off import scripts (`import-problem-bank.mjs`, `parse-xlsx.mjs`) that generate `src/data/problem-bank.json` from spreadsheet sources — not part of the app runtime, run manually when the question bank changes.

## Design constraints (from uiux.md/design.md, enforced in code review)

- No hardcoded colors — use tokens in `src/styles` / Tailwind theme.
- Class/brand color choice is swatch-only from an 8-color palette; never add a hex input.
- Disabled/incorrect states must use icon+text, never color-only or opacity-only styling.
- Prefer single-viewport layouts (no scroll) where the spec calls for it (e.g. school settings).

## 학생앱(`loopin-webapp`)과 맞물리는 부분

두 리포는 별개 git 프로젝트라 한쪽만 고치면 조용히 어긋난다. 아래를 바꾸면 **반드시 반대쪽도 같이 확인**한다.

| 무엇 | 이쪽(교사) | 반대쪽(학생앱) |
|------|-----------|---------------|
| 문항 id 접미사 | `parseAnswerQuestionId` (`src/lib/sync/teacher-sync.ts`) | `build-session-sections.ts`가 id를 만든다 (`:match` `:ox` `:ox:fix` 등) |
| 유형 라벨 | `TYPE_SUFFIX_LABEL` / `TYPE_LABEL`, `GRAMMAR_TYPE_OPTIONS` | `snapshot.problemTypes.*` 문자열 비교 |
| 선택지 개수 | `validate-problem-item.ts` (교정 문제 3개 필수) | `buildOxXCorrection`이 3개 미만이면 문항을 만들지 않음 |
| 스냅샷 형태 | `src/lib/sync/content-snapshot.ts` | `src/lib/sync/types.ts`의 `ContentSnapshot` |
| 문법 개념 | `content-snapshot.ts`가 문제은행 `major`/`minor`를 스냅샷에 싣는다 | 복습 탭이 `grammar[].major`로 유형을 가른다 (`features/review/review-types.ts`) |

문제집은 유형을 **라벨 문자열**로 저장한다(`savedTypeState`). 라벨을 바꾸면 과거 문제집이 조용히 깨지니, 목록에서 빼더라도 학생앱 빌더는 남겨 둔다.
