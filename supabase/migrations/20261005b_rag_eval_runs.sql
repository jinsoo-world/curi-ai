-- 검색 품질 비교용 요청과 결과 (관리자 전용, 서버 전용). 덧붙이기만.
create table if not exists public.rag_eval_runs (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    status text not null default 'pending',
    request jsonb not null,
    result jsonb,
    finished_at timestamptz
);
alter table public.rag_eval_runs enable row level security;
revoke all on table public.rag_eval_runs from anon, authenticated;
