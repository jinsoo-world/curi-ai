-- ============================================================
-- 2026-10-24 봇 「내 SNS 연결 — 인스타그램」 (Instagram API with Instagram Login, instagram_business_basic)
-- 표 3개 신설. 기존 표는 건드리지 않는다. 데이터는 바꾸지 않는다.
--
--   instagram_connections        봇 하나에 인스타그램 계정 하나.
--                                60일 열쇠는 연결 자물쇠(CONNECTOR_SECRET_KEY)에서 갈라낸 열쇠로 AES-256-GCM 잠금(token_encrypted).
--                                끊으면 열쇠만 지운다(token_encrypted = null, status = 'disconnected'). 아이디 번호는
--                                나중에 메타 「정보 삭제 요청」이 오면 어느 봇 자료인지 찾으려고 남긴다(삭제 요청이 오면 줄째 지운다).
--   instagram_deletion_requests  메타 「정보 삭제 요청」 접수 번호와 처리 상태(상태 화면 /api/sns/instagram/data-deletion?code=…).
--   instagram_learned_sources    배운 자료마다 그때 연결된 계정 번호 (삭제 요청이 그 계정 글만 지우게)
--
-- 배우기는 이미 있는 knowledge_feeds(sns_slot = 'instagram', kind = 'instagram') 줄로 돈다. 그 표는 바꾸지 않는다.
--
-- 원칙: RLS 켬 + 정책 0개 + anon·authenticated 권한 전부 회수 + service_role 만. 화면(회원 열쇠)은 이 표를 못 본다.
--       서버 API 가 봇 주인을 먼저 확인한다(resolveOwnedBot / assertBotOwned).
-- 적용: Supabase SQL 편집기(큐리AI DB)에 통째로 붙여 실행. 여러 번 실행해도 안전.
--       코드는 이 표가 없어도 깨지지 않는다(읽기는 「연결 없음」, 저장은 「곧 열려요」).
-- ============================================================

begin;

create table if not exists public.instagram_connections (
  mentor_id           uuid primary key references public.mentors(id) on delete cascade,
  user_id             uuid not null references public.users(id) on delete cascade,
  ig_user_id          text not null,                 -- 프로페셔널 계정 번호 (/me user_id)
  ig_scoped_id        text,                          -- 앱 범위 번호 (/me id, 메타 콜백 user_id)
  previous_ig_ids     text[] not null default '{}',  -- 다른 계정으로 바꿔 연결하기 전 계정 번호들 (옛 계정의 정보 삭제 요청도 찾게)
  username            text,
  account_type        text,                          -- BUSINESS / MEDIA_CREATOR
  token_encrypted     text,                          -- 잠근 60일 열쇠. 끊으면 null
  token_expires_at    timestamptz,
  token_refreshed_at  timestamptz,
  status              text not null default 'connected'
                      check (status in ('connected', 'needs_reconnect', 'disconnected')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists instagram_connections_ig_user_idx on public.instagram_connections (ig_user_id);
create index if not exists instagram_connections_ig_scoped_idx on public.instagram_connections (ig_scoped_id);
create index if not exists instagram_connections_previous_ids_idx on public.instagram_connections using gin (previous_ig_ids);
-- 매일 크론 열쇠 연장: 연결 중이고 곧 끝나는 것부터
create index if not exists instagram_connections_refresh_idx on public.instagram_connections (status, token_expires_at);

comment on table public.instagram_connections is
  '봇 「내 SNS 연결」 인스타그램 로그인 연결. 열쇠는 잠가서만 저장. 서버(service_role) 전용';

create table if not exists public.instagram_deletion_requests (
  confirmation_code  text primary key,
  ig_user_id         text not null,
  mentor_ids         uuid[] not null default '{}',
  status             text not null default 'pending' check (status in ('pending', 'done')),
  removed_sources    int not null default 0,
  requested_at       timestamptz not null default now(),
  done_at            timestamptz
);

create index if not exists instagram_deletion_requests_pending_idx on public.instagram_deletion_requests (status, requested_at);
create index if not exists instagram_deletion_requests_ig_user_idx on public.instagram_deletion_requests (ig_user_id, status);

comment on table public.instagram_deletion_requests is
  '메타 인스타그램 정보 삭제 요청 접수. 매일 크론(/api/cron/feeds)이 배운 인스타그램 자료를 지우고 done 으로 바꾼다';

-- 배운 자료 한 건마다 그때 연결된 계정 번호. 메타 정보 삭제 요청이 오면 그 계정 번호가 붙은 자료만 지운다
-- (같은 봇이 계정을 바꿔 연결했어도 다른 계정 글은 안 지운다). 자료가 지워지면 같이 지워진다
create table if not exists public.instagram_learned_sources (
  source_id     uuid primary key references public.knowledge_sources(id) on delete cascade,
  mentor_id     uuid not null references public.mentors(id) on delete cascade,
  ig_user_id    text not null,
  ig_scoped_id  text,
  created_at    timestamptz not null default now()
);

create index if not exists instagram_learned_sources_mentor_idx on public.instagram_learned_sources (mentor_id, ig_user_id);
create index if not exists instagram_learned_sources_scoped_idx on public.instagram_learned_sources (mentor_id, ig_scoped_id);

alter table public.instagram_connections enable row level security;
alter table public.instagram_deletion_requests enable row level security;
alter table public.instagram_learned_sources enable row level security;

-- 정책 0개 (혹시 손으로 만든 정책이 있으면 지운다)
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('instagram_connections', 'instagram_deletion_requests', 'instagram_learned_sources') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

revoke all on table public.instagram_connections from anon, authenticated;
revoke all on table public.instagram_deletion_requests from anon, authenticated;
revoke all on table public.instagram_learned_sources from anon, authenticated;
grant all on table public.instagram_connections to service_role;
grant all on table public.instagram_deletion_requests to service_role;
grant all on table public.instagram_learned_sources to service_role;

commit;
