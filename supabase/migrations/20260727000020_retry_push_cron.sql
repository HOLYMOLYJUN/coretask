-- core_task · 20 retry-push cron 활성화 (D-037 · US-802)
--
-- 마이그레이션 10에서 주석으로 준비해둔 것을 send-push 배포와 함께 켠다.
-- Database Webhook 도 pg_net 도 자동 재시도가 없으므로,
-- pushed_at 이 비어 있는 알림을 5분마다 다시 발송한다 —
-- "알림이 조용히 사라지는" 유일한 경로를 막는 안전망이다.
--
-- 인증: anon 키를 쓴다. anon 키는 어차피 JS 번들에 들어가는 공개 값이고,
-- send-push 는 알림 id 로 조회만 하므로(내용은 서버가 재구성) 위조 표면이 없다.
-- 최악의 남용도 "그 알림의 주인에게 자기 알림을 다시 보내는 것" 뿐이다.

select cron.schedule(
  'retry-push',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url     := 'https://ycorelrympxhkpwcgkmy.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljb3JlbHJ5bXB4aGtwd2Nna215Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNjY1MDksImV4cCI6MjEwMDY0MjUwOX0.hrgxAEox39Gj1bccTR2gFT7GYFa4ulCPpDc6fXlagWw'
      ),
      body    := jsonb_build_object('notification_id', n.id)
    )
    from notifications n
    where n.pushed_at is null
      and n.created_at > now() - interval '1 day'   -- 어제 배정의 푸시는 지금 와도 의미가 없다
    limit 100
  $cron$
);
