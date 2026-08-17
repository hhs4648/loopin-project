-- ---------------------------------------------------------------------------
-- 과제 **예약 공개** — 수업이 끝나야 학생 앱에 뜬다.
--
-- 지금까지는 교사가 과제를 만드는 즉시 학생 맵에 성이 생겼다. 수업일을 미리 잡아
-- 두고 출제해 두는 흐름에서는, 수업 전에 문제가 통째로 노출된다는 뜻이다.
-- `content_snapshot`에는 **정답까지** 들어 있어서 미리보기가 곧 답안지다.
--
-- 그래서 공개 시각(`open_at`)을 행에 박아 둔다. 교사 웹이 과제를 만들 때
-- 「수업일 + 그 반의 수업 종료 시각」을 한국시간으로 계산해 절대 시각으로 넣는다.
-- 읽는 쪽에서 시간대 계산을 하지 않아도 되고, 나중에 반 시간표를 바꿔도 이미 낸
-- 과제의 공개 시점이 흔들리지 않는다.
--
-- **null은 「이미 공개」로 본다.** 이 마이그레이션 이전 과제가 갑자기 사라지면 안 된다.
-- ---------------------------------------------------------------------------

alter table public.class_assignments
  add column if not exists open_at timestamptz;

create index if not exists class_assignments_open_at_idx
  on public.class_assignments (class_id, open_at);

-- ---------------------------------------------------------------------------
-- 학생은 **공개된 과제만** 읽는다.
--
-- 앱에서 거르는 것만으로는 부족하다 — 행 자체는 그대로 내려오므로 API를 직접
-- 부르면 예정된 과제의 문제와 정답을 미리 볼 수 있다. 실제 잠금은 여기서 건다.
-- 교사는 예정분까지 전부 봐야 하므로 그대로 둔다.
-- ---------------------------------------------------------------------------

drop policy if exists class_assignments_select_related on public.class_assignments;
create policy class_assignments_select_related on public.class_assignments
  for select using (
    public.is_teacher_of_class(class_id)
    or (
      public.is_enrolled_in_class(class_id)
      and (open_at is null or open_at <= now())
    )
  );
