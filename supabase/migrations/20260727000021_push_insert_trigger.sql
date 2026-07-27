-- core_task · 21 notifications INSERT 즉시 발송 트리거 (D-037 · US-802)
--
-- 설계는 "INSERT 웹훅 → send-push + 5분 cron 재시도" 인데
-- 웹훅이 등록돼 있지 않아 cron 이 유일한 경로였다 (최대 5분 지연).
-- 대시보드 웹훅 대신 트리거로 건다 — 레포에 기록이 남고 환경 재구축 시 누락되지 않는다.
--
-- 인증·남용 표면 논리는 20_retry_push_cron.sql 과 동일 (anon 키는 공개 값).
-- net.http_post 는 비동기(큐 적재)라 INSERT 트랜잭션을 지연시키지 않는다.

create or replace function public.notify_send_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url     := 'https://ycorelrympxhkpwcgkmy.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljb3JlbHJ5bXB4aGtwd2Nna215Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNjY1MDksImV4cCI6MjEwMDY0MjUwOX0.hrgxAEox39Gj1bccTR2gFT7GYFa4ulCPpDc6fXlagWw'
    ),
    body    := jsonb_build_object('notification_id', new.id)
  );
  return new;
end;
$$;

create trigger trg_notifications_send_push
  after insert on public.notifications
  for each row
  execute function public.notify_send_push();
