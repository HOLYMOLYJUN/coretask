-- core_task · 10 cron
-- 근거: docs/05-DB.md §11-B (D-040) + docs/06-API.md §5.3
--
-- ⚠️ 이 마이그레이션이 실패하면 대시보드 Database > Extensions 에서
--    pg_cron / pg_net 을 켠 뒤 다시 push 한다. 나머지 마이그레이션과 독립적이다.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ─────────────────────────────────────────────────────────────
-- D-040: 읽은 지 30일 지난 알림만 정리
--   · 미읽음은 지우지 않는다 — 휴가 복귀자의 배정 알림이 사라진다
--   · activities 는 절대 정리하지 않는다 (신뢰 문제, Foundation §8)
-- ─────────────────────────────────────────────────────────────

select cron.schedule(
  'purge-notifications',
  '30 0 * * *',
  $cron$
    delete from notifications
    where read_at is not null
      and read_at < now() - interval '30 days'
  $cron$
);

-- ─────────────────────────────────────────────────────────────
-- 마감 알림 배치 (US-801)
--   ⚠️ '0 0 * * *' 는 UTC 자정 = KST 09:00.
--      서버 타임존을 바꾸지 말고 cron 표현식에서 맞춘다.
--   NOT EXISTS 가드가 없으면 매일 같은 Task 로 중복 알림이 나간다.
-- ─────────────────────────────────────────────────────────────

select cron.schedule(
  'notify-due',
  '0 0 * * *',
  $cron$
    insert into notifications (user_id, type, task_id, project_id)
    select t.assignee_id,
           case when t.due_date < current_date then 'due_passed'::notification_type
                else 'due_soon'::notification_type end,
           t.id, t.project_id
    from tasks t
    where t.deleted_at is null
      and t.status <> 'done'
      and t.assignee_id is not null
      and t.due_date is not null
      and t.due_date <= current_date + 1
      and not exists (
        select 1 from notifications n
        where n.task_id = t.id
          and n.user_id = t.assignee_id
          and n.type in ('due_soon', 'due_passed')
          and n.created_at > now() - interval '20 hours'
      )
  $cron$
);

-- ─────────────────────────────────────────────────────────────
-- D-037: 푸시 재시도 — M2 에서 활성화한다
--
-- Edge Function `send-push` 와 Vault 시크릿이 준비된 뒤 아래 주석을 푼다.
-- 지금 켜면 존재하지 않는 함수를 5분마다 호출하게 된다.
--
-- select cron.schedule(
--   'retry-push',
--   '*/5 * * * *',
--   $cron$
--     select net.http_post(
--       url     := (select decrypted_secret from vault.decrypted_secrets where name = 'push_fn_url'),
--       headers := jsonb_build_object(
--                    'Content-Type', 'application/json',
--                    'Authorization', 'Bearer ' ||
--                      (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
--       body    := jsonb_build_object('notification_id', n.id)
--     )
--     from notifications n
--     where n.pushed_at is null
--       and n.created_at > now() - interval '1 day'   -- 하루 지난 건 포기한다
--     limit 100
--   $cron$
-- );
