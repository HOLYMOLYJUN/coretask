-- core_task · 14 v_project_stats 에 프로젝트 이름 추가
--
-- ⚠️ 구현 중 발견
-- v_project_stats 에 name 이 없어서 대시보드 위젯이 UUID 앞 8자리를 그대로 노출했다.
-- 프로젝트 목록에서는 projects 를 따로 조회해 클라이언트에서 병합하고 있었는데,
-- 같은 병합을 두 곳에서 하면 언젠가 어긋난다. 뷰가 자족하게 만든다.

drop view if exists v_project_stats;

create view v_project_stats as
select
  p.id            as project_id,
  p.workspace_id,
  p.name,
  p.is_personal,
  p.status        as project_status,
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
group by p.id, p.workspace_id, p.name, p.is_personal, p.status;

alter view v_project_stats set (security_invoker = true);

grant select on v_project_stats to authenticated;
