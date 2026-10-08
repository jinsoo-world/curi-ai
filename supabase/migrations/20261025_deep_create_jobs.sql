-- ============================================================
-- 2026-10-25 큐리AI 「깊게 만들기」 작업 표 (대표 확정 10/7, 구독 전용 · 무료는 미리보기만)
-- 표 1개 신설. 기존 표는 건드리지 않는다. 데이터는 바꾸지 않는다.
--
--   deep_create_jobs   한 문장 → (1) 조사 → (2) 정리 → (3) 점검 을 단계별로 돌리는 작업 한 건.
--                      앱은 GET /api/os/deep-create/{id} 로 상태를 묻는다(폴링).
--                      결과(지시문 전문)는 서버만 읽는다. 무료 회원에게는 앞부분 미리보기만 돌려준다.
--                      하루 한도는 이 표의 오늘(서울 기준) 줄 수(실패 포함) + 원자적 카운터(rate_limits, deep:day:{user}:{서울날짜})로 센다.
--                      한 단계를 2번 잡고도 못 끝내거나 만든 지 15분이 지나면 더 돌리지 않고 failed 로 끝낸다(attempts).
--
-- 원칙: RLS 켬 + 정책 0개 + anon·authenticated 권한 전부 회수 + service_role 만. 화면(회원 열쇠)은 이 표를 못 본다.
-- 적용: Supabase SQL 편집기(큐리AI DB)에 통째로 붙여 실행. 여러 번 실행해도 안전.
--       코드는 이 표가 없으면 「곧 열려요」(503)로 답한다.
-- ============================================================

begin;

create table if not exists public.deep_create_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  plan          text not null default 'free' check (plan in ('free', 'basic', 'pro')),  -- 시작할 때 요금제
  status        text not null default 'research'
                check (status in ('research', 'write', 'check', 'done', 'failed')),
  idea          text not null,                       -- 한 문장 (최대 200자)
  ref_links     text[] not null default '{}',        -- 참고 링크 (최대 3개)
  ref_text      text,                                -- 참고 글 (최대 20,000자)
  research      jsonb,                               -- { notes, sources: [{url,title}], material }
  result        jsonb,                               -- { name, oneLiner, greeting, sampleQuestions, isRealPerson, promptText, checks }
  fidelity      jsonb,                               -- { total, grade, items: [{key,label,score,max}], weaknesses }
  error         text,
  claimed_at    timestamptz,                         -- 지금 돌고 있는 실행이 잡은 시각 (오래되면 다른 실행이 이어서 돈다)
  attempts      int not null default 0 check (attempts >= 0),  -- 지금 단계를 잡은 횟수 (단계가 넘어가면 0). 2번 잡고도 못 끝내면 failed
  saved_at      timestamptz,                         -- 「이 봇 만들기」로 저장한 시각 (한 번만)
  mentor_id     uuid references public.mentors(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 먼저 만든 표가 있으면 칸만 더한다 (여러 번 실행해도 안전)
alter table public.deep_create_jobs add column if not exists attempts int not null default 0;

create index if not exists deep_create_jobs_user_day_idx on public.deep_create_jobs (user_id, created_at desc);

comment on table public.deep_create_jobs is
  '큐리AI 깊게 만들기(조사→정리→점검) 작업. 지시문 전문이 들어 있다. 서버(service_role) 전용';

alter table public.deep_create_jobs enable row level security;

-- 정책 0개 (혹시 손으로 만든 정책이 있으면 지운다)
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename = 'deep_create_jobs' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

revoke all on table public.deep_create_jobs from anon, authenticated;
grant all on table public.deep_create_jobs to service_role;

commit;
