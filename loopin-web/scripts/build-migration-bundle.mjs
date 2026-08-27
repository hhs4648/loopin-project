/**
 * `supabase/migrations/*.sql`를 순서대로 이어 붙여 **SQL Editor에 붙여넣을 한 덩어리**를
 * 만든다. 새 환경을 붙이거나 스키마를 재생성할 때 001~012를 하나씩 여는 대신 쓴다.
 * (HANDOFF §0 — 하나라도 빠지면 조용히 고장 난다.)
 *
 * 합본은 **저장하지 않는다.** 마이그레이션 파일이 유일한 원본이고, 합본은 그때그때
 * 다시 만든다 — 두 벌을 두면 언젠가 어긋난다.
 *
 *   node scripts/build-migration-bundle.mjs [출력경로]
 */
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS = path.join(process.cwd(), 'supabase', 'migrations')
const out = process.argv[2] ?? path.join(process.cwd(), 'apply-all-migrations.sql')

const files = fs
  .readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort() // 001_… 접두사가 곧 적용 순서다

if (files.length === 0) {
  console.error('마이그레이션 파일이 없습니다:', MIGRATIONS)
  process.exit(1)
}

const parts = [
  '-- ===========================================================================',
  '-- 자동 생성 — 고치지 마세요. 원본은 supabase/migrations/*.sql 입니다.',
  '--   node scripts/build-migration-bundle.mjs',
  `-- 포함(${files.length}개, 이 순서대로):`,
  ...files.map((f) => `--   ${f}`),
  '-- ===========================================================================',
  '',
]

for (const file of files) {
  const body = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8')
  parts.push(
    '',
    '-- ─────────────────────────────────────────────────────────────────────────',
    `-- ${file}`,
    '-- ─────────────────────────────────────────────────────────────────────────',
    '',
    body.trimEnd(),
    '',
  )
}

fs.writeFileSync(out, parts.join('\n'))
console.log(`${files.length}개 파일 → ${out}`)
console.log(files.map((f) => '  ' + f).join('\n'))
