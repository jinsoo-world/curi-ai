-- 월 자료 한도 기록장 (대표 승인 2026-09-29 「한도 구멍 막아. 승인」)
-- 자료나 봇을 지워도 이번 달 쓴 쪽 수가 줄지 않게, 지워지지 않는 기록장에서 셉니다.
-- 더하기만 합니다. knowledge_sources 와 외래키로 묶지 않습니다(지워도 기록은 남아야 하므로).
create table if not exists public.doc_page_usage (
  source_id uuid primary key,
  user_id uuid not null,
  mentor_id uuid,
  pages integer not null check (pages >= 0),
  created_at timestamptz not null default now()
);

create index if not exists doc_page_usage_user_created_idx
  on public.doc_page_usage (user_id, created_at);

alter table public.doc_page_usage enable row level security;
-- 로그인 사용자는 자기 행만 읽기, 쓰기는 서버(service_role)만
do $$ begin
  create policy doc_page_usage_select_own on public.doc_page_usage
    for select to authenticated using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

comment on table public.doc_page_usage is '월 파일 쪽 한도 기록장. 성공하거나 처리 중인 파일만. 실패하면 서버가 행을 지움. 자료를 지워도 남음';

-- 이번 달에 이미 넣은 자료를 옮겨 적기 (서울 기준 이번 달, 실패 제외)
insert into public.doc_page_usage (source_id, user_id, mentor_id, pages, created_at)
select ks.id, cp.user_id, ks.mentor_id, ks.page_count, ks.created_at
from public.knowledge_sources ks
join public.mentors m on m.id = ks.mentor_id
join public.creator_profiles cp on cp.id = m.creator_id
where ks.page_count is not null
  and ks.processing_status <> 'failed'
  and ks.created_at >= (date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
on conflict (source_id) do nothing;
