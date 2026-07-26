-- core_task · 06 views
-- 근거: docs/05-DB.md §8 + docs/06-API.md §9 (D-038)
--
-- 계산할 수 있는 값은 저장하지 않는다 (D-009).

-- 정체 판정 (D-015, D-027). 임계값은 프로젝트별로 다르므로 여기서 계산한다.
create or replace view v_tasks_enriched as
select
  t.*,
  p.workspace_id,
  p.name               as project_name,
  p.stale_progress_days,
  p.stale_review_days,
  (extract(epoch from (now() - t.status_changed_at)) / 86400)::int as days_in_status,
  case
    when t.status = 'in_progress'
      then now() - t.status_changed_at > make_interval(days => p.stale_progress_days)
    when t.status = 'in_review'
      then now() - t.status_changed_at > make_interval(days => p.stale_review_days)
    else false
  end as is_stale,
  (t.due_date is not null and t.due_date < current_date and t.status <> 'done') as is_overdue,
  (t.assignee_id is not null and t.due_date is null and t.status <> 'done')     as is_missing_due
from tasks t
join projects p on p.id = t.project_id
where t.deleted_at is null and p.deleted_at is null;

-- D-009: 진행률은 저장하지 않고 계산한다
create or replace view v_project_stats as
select
  p.id                                                    as project_id,
  p.workspace_id,
  count(t.id)                                             as total,
  count(*) filter (where t.status = 'done')               as done,
  count(*) filter (where t.status = 'todo')               as todo,
  count(*) filter (where t.status = 'in_progress')        as in_progress,
  count(*) filter (where t.status = 'in_review')          as in_review,
  count(*) filter (where t.assignee_id is null and t.status <> 'done') as unassigned,
  count(*) filter (where t.is_missing_due)                as missing_due,
  count(*) filter (where t.is_stale or t.is_overdue)      as delayed,
  case when count(t.id) = 0 then 0
       else round(count(*) filter (where t.status = 'done')::numeric * 100 / count(t.id))
  end                                                     as progress
from projects p
left join v_tasks_enriched t on t.project_id = p.id
where p.deleted_at is null
group by p.id, p.workspace_id;

-- D-038: Admin 은 project_members 행 없이도 Lead 권한을 갖는다 (D-016d).
-- 이 분기를 뷰가 흡수해서 대시보드 쿼리를 한 벌로 유지한다.
-- 탭 노출 조건(US-702 AC-1)과 집계 범위가 어긋날 수 없게 된다.
create or replace view v_my_lead_projects as
select p.*
from projects p
where p.deleted_at is null
  and p.status = 'active'
  and (
    exists (select 1 from project_members pm
            where pm.project_id = p.id and pm.user_id = auth.uid() and pm.role = 'lead')
    or is_workspace_admin(p.workspace_id)
  );

-- ⚠️ 뷰에는 RLS 가 자동 상속되지 않는다.
-- security_invoker = true 여야 조회자의 권한으로 기반 테이블 RLS 가 적용된다.
alter view v_tasks_enriched   set (security_invoker = true);
alter view v_project_stats    set (security_invoker = true);
alter view v_my_lead_projects set (security_invoker = true);
