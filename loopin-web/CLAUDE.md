# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## 언어

결과값과 설명은 무조건 한글로 작성한다. 코드/식별자/커밋 메시지의 영어 규칙(예: PascalCase 컴포넌트명, `feat(scope): ...` 커밋 포맷)은 그대로 따르되, 사용자에게 보여주는 설명·요약·주석은 한국어로 작성한다.

**Next.js version warning:** this project runs Next.js 16.2.10, not the Next.js 15/14 you may know from training data. Before touching routing, config, or build behavior, check `node_modules/next/dist/docs/` for the current API — App Router conventions and `next.config.ts` options may differ from what you expect.

## Commands

Run from `loopin-web/` (this directory is the actual git repo and npm project; the parent `loopin-project/` only has a thin wrapper `package.json` that does `npm --prefix loopin-web run <script>`):

- `npm run dev` — dev server (`next dev --webpack`; webpack is explicit, not the default Turbopack)
- `npm run build` — production build (`next build`)
- `npm run start` — serve the production build
- `npm run lint` — ESLint (flat config: `next/core-web-vitals` + `next/typescript`)

There is no test suite and no single-test command — lint + `tsc` (via build) are the only checks.

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
