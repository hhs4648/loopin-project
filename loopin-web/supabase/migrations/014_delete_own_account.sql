-- ---------------------------------------------------------------------------
-- 회원탈퇴 — 학생이 **자기 계정만** 지운다.
--
-- 왜 함수가 필요한가: 앱은 anon 키로만 말한다. `auth.users`는 PostgREST로 노출되지
-- 않고, 지울 권한도 없다. 서비스 롤 키를 앱에 넣는 건 논외다(그 키 하나면 남의
-- 기록까지 전부 지워진다). 그래서 **자기 자신만 지울 수 있는 함수 하나**를 두고
-- `security definer`로 권한을 빌려준다.
--
-- 무엇이 같이 사라지나: `auth.users` 한 행을 지우면 FK `on delete cascade`를 타고
--   profiles → enrollments · attempts → answers
-- 가 전부 따라 사라진다(001). 선생님 화면의 명단·점수에서도 같이 없어진다.
--
-- `error_reports`만 예외다. 로그인 전에도 신고가 들어와야 해서 `on delete set null`로
-- 걸려 있어(011) 계정을 지워도 행이 남는다. 학생이 「완전히 지워 달라」고 한 것이므로
-- 여기서 **명시적으로 먼저 지운다.**
--
-- 선생님 계정에 쓰면 그가 만든 반·문제집·과제까지 cascade로 사라진다. 지금 탈퇴
-- 화면은 학생 앱에만 있다. 선생님 웹에 붙일 때는 그 점을 화면에 적어야 한다.
-- ---------------------------------------------------------------------------

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
-- `security definer` 함수는 search_path를 고정해야 한다. 안 그러면 호출자가 만든
-- 동명 객체를 이 함수의 권한으로 실행하게 만들 수 있다.
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted int;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '28000';
  end if;

  -- 위 주석대로, cascade가 안 걸린 유일한 흔적
  delete from public.error_reports where student_id = v_uid;

  delete from auth.users where id = v_uid;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    -- 0행을 지우고 조용히 성공하면 앱은 「탈퇴됐다」고 믿고 로컬을 비운다.
    -- 계정은 살아 있는데 학생만 못 돌아오는 상태가 되므로 반드시 에러로 알린다.
    raise exception '계정을 찾지 못했습니다' using errcode = 'P0002';
  end if;
end;
$$;

-- 로그인한 사람만. `authenticated`에는 익명 세션도 포함되며, 그 경우에도
-- 지워지는 건 `auth.uid()` 자기 자신뿐이다.
--
-- **`anon`을 따로 걷어내야 한다.** Supabase는 public 스키마에 새로 만들어지는 함수에
-- 기본 권한으로 `anon`·`authenticated` 실행을 붙인다. `from public`(의사 롤)을 회수해도
-- `anon`에 직접 붙은 권한은 그대로 남는다 — 2026-09-04에 anon 키로 호출해 보니 권한
-- 오류가 아니라 함수 본문의 `로그인이 필요합니다`까지 들어왔다(즉 실행은 됐다).
-- 세션이 없으면 `auth.uid()`가 null이라 아무것도 안 지워지지만, 닿지 않게 막아 둔다.
revoke all on function public.delete_own_account() from public;
revoke all on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;
