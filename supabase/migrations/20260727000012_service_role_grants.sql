-- core_task · 12 service_role grants
--
-- "Automatically expose new tables" 를 꺼서 (11_grants.sql 참조)
-- service_role 도 자동 grant 를 받지 못했다.
-- Edge Function(send-push)이 service_role 로 REST 를 호출할 때
-- 테이블 권한이 없어 403 이 났다 — RLS 는 bypass 하지만 GRANT 는 별개 층이다.

grant all on all tables in schema public to service_role;

-- 앞으로 추가되는 테이블도 잊지 않도록 기본 권한을 걸어둔다
alter default privileges in schema public grant all on tables to service_role;
