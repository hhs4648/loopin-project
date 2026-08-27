-- ---------------------------------------------------------------------------
-- public에 새 테이블이 생기면 **RLS를 자동으로 켠다.**
--
-- 이 함수·이벤트 트리거는 원래 마이그레이션에 없었다. 2026-08-22에 실제 DB 스키마를
-- 떠서 리포와 대조하다가, DB에만 있고 파일에는 없는 것으로 발견해 여기에 편입했다.
-- (누군가 SQL Editor에서 직접 만들어 두고 기록을 남기지 않았다. 그래서 스키마를
--  재생성하면 조용히 사라질 뻔했다.)
--
-- 왜 남기나: RLS를 안 켠 테이블은 anon 키로 전부 읽힌다. 마이그레이션마다
-- `enable row level security`를 잊지 않고 쓰면 되지만, 한 번 잊으면 학생 답안이
-- 통째로 열린다. 이건 그 실수를 막는 그물이다 — 규칙을 대신하지 않고 덧댄다.
--
-- 주의: 이벤트 트리거 생성은 권한이 높은 롤(Supabase의 `postgres`)이 필요하다.
-- SQL Editor에서는 되고, anon/authenticated로는 안 된다.
-- ---------------------------------------------------------------------------

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- 이벤트 트리거는 스키마에 속하지 않지만 위 함수에 딸려 있어서,
-- `drop schema public cascade`를 하면 같이 사라진다. 그래서 여기서 다시 만든다.
drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  execute function public.rls_auto_enable();
