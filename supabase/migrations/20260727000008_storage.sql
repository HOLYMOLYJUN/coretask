-- core_task · 08 storage
-- 근거: docs/05-DB.md §11-A (D-039)
--
-- ⚠️ Storage 버킷은 테이블 RLS 와 완전히 별개의 정책을 갖는다.
--    테이블에 RLS 를 다 걸어놓고 버킷을 열어두면 거기가 구멍이 된다.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288,          -- 512KB 상한
        array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- 읽기: 공개.
-- 아바타는 비밀이 아니고, 보드 로딩마다 20개씩 불러오므로 CDN 을 타야 한다.
drop policy if exists avatar_read on storage.objects;
create policy avatar_read on storage.objects for select
  using (bucket_id = 'avatars');

-- 쓰기: 본인 경로만. 경로 규약 = {user_id}/avatar.webp
drop policy if exists avatar_write on storage.objects;
create policy avatar_write on storage.objects for insert
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatar_update on storage.objects;
create policy avatar_update on storage.objects for update
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatar_delete on storage.objects;
create policy avatar_delete on storage.objects for delete
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = auth.uid()::text);

-- NOTE: 업로드 전 클라이언트에서 256px 로 리사이즈한다.
-- 아바타는 19px 로 렌더되는데 폰 사진 4MB 가 그대로 올라오면 보드 로딩이 느려진다.
-- file_size_limit 는 리사이즈를 건너뛴 업로드를 막는 2차 방어선이다.
