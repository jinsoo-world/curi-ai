-- 1단계 표 변경 (대표 승인 2026-09-29 01:03 KST)
-- 더하기만 합니다. 기존 행은 지우거나 고치지 않습니다.
-- 주인 기준: mentors.creator_id -> creator_profiles.user_id (knowledge_sources, knowledge_chunks 정책과 같음).
-- team_bots.user_id 는 마켓에서 데려온 봇(linked_from_market)도 포함해 주인 기준으로 쓰지 않습니다.
-- 새 표 쓰기는 서버(service_role)만. 로그인 사용자는 자기 봇 행과 공통 행만 읽습니다.

-- 1) 자료 출처: 실패 이유 코드, 쪽 수
alter table public.knowledge_sources
  add column if not exists failure_reason text,
  add column if not exists page_count integer;

do $$ begin
  alter table public.knowledge_sources
    add constraint knowledge_sources_failure_reason_len check (failure_reason is null or char_length(failure_reason) <= 200);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.knowledge_sources
    add constraint knowledge_sources_page_count_nonneg check (page_count is null or page_count >= 0);
exception when duplicate_object then null; end $$;

comment on column public.knowledge_sources.failure_reason is '실패 이유 코드 (src/domains/knowledge/failure-reasons.ts). 성공이면 null';
comment on column public.knowledge_sources.page_count is '파일 쪽 수 (요금제별 월 자료 한도 계산용). 파일이 아니면 null';

-- 월 사용량 합계용 (봇별, 넣은 때)
create index if not exists knowledge_sources_mentor_created_idx
  on public.knowledge_sources (mentor_id, created_at) where page_count is not null;

-- 2) 조각: 부모 ID, 제목 경로
alter table public.knowledge_chunks
  add column if not exists parent_id uuid,
  add column if not exists heading_path text[];

comment on column public.knowledge_chunks.parent_id is '같은 부모 구역에 속한 조각끼리 공유하는 ID (행 참조 아님)';
comment on column public.knowledge_chunks.heading_path is '문서 제목 경로, 예: {"2장 가격", "기본 과정"}';

create index if not exists knowledge_chunks_parent_idx
  on public.knowledge_chunks (parent_id) where parent_id is not null;

-- 3) 주인 확인 함수 (정책에서 씀)
create or replace function public.is_mentor_owner(p_mentor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mentors m
    join public.creator_profiles cp on cp.id = m.creator_id
    where m.id = p_mentor and cp.user_id = auth.uid()
  );
$$;

revoke all on function public.is_mentor_owner(uuid) from public;
grant execute on function public.is_mentor_owner(uuid) to authenticated, service_role;

-- 4) 개체 표: 말투(voice_profile), 인물상(leader_persona), 강의(course), 상품(product), 충돌(conflict) 등
create table if not exists public.ontology_entities (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'bot' check (scope in ('common', 'bot')),
  mentor_id uuid references public.mentors(id) on delete cascade,
  kind text not null check (kind in ('Person', 'Artifact', 'Event', 'State', 'Goal', 'Outcome')),
  module text check (module in ('Actor', 'Asset', 'Transaction', 'Interaction')),
  semantic_name text not null check (char_length(semantic_name) between 1 and 60),
  name text,
  aliases text[] not null default '{}',
  attrs jsonb not null default '{}'::jsonb,
  source_id uuid references public.knowledge_sources(id) on delete set null,
  evidence_chunk_ids uuid[] not null default '{}',
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'open', 'resolved', 'removed')),
  leader_confirmed boolean not null default false,
  leader_confirmed_at timestamptz,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ontology_entities_scope_mentor check (
    (scope = 'common' and mentor_id is null) or (scope = 'bot' and mentor_id is not null)
  )
);

comment on table public.ontology_entities is '봇이 이해한 개체. semantic_name: voice_profile, leader_persona, course, product, conflict, topic, faq, story. 충돌은 status open/resolved, attrs.chosen 에 리더가 고른 값';

create index if not exists ontology_entities_mentor_idx on public.ontology_entities (mentor_id, semantic_name);
create index if not exists ontology_entities_open_conflict_idx on public.ontology_entities (mentor_id)
  where semantic_name = 'conflict' and status = 'open';

create table if not exists public.ontology_relations (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'bot' check (scope in ('common', 'bot')),
  mentor_id uuid references public.mentors(id) on delete cascade,
  from_id uuid not null references public.ontology_entities(id) on delete cascade,
  rel text not null check (char_length(rel) between 1 and 60),
  to_id uuid not null references public.ontology_entities(id) on delete cascade,
  evidence_chunk_id uuid,
  confidence real check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_at timestamptz not null default now(),
  constraint ontology_relations_scope_mentor check (
    (scope = 'common' and mentor_id is null) or (scope = 'bot' and mentor_id is not null)
  )
);

create index if not exists ontology_relations_mentor_idx on public.ontology_relations (mentor_id);
create index if not exists ontology_relations_from_idx on public.ontology_relations (from_id);
create index if not exists ontology_relations_to_idx on public.ontology_relations (to_id);

create or replace function public.ontology_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists ontology_entities_touch on public.ontology_entities;
create trigger ontology_entities_touch before update on public.ontology_entities
  for each row execute function public.ontology_touch_updated_at();

-- 5) RLS: 읽기만 정책을 둡니다. 쓰기 정책이 없으니 쓰기는 service_role 만 됩니다.
alter table public.ontology_entities enable row level security;
alter table public.ontology_relations enable row level security;

drop policy if exists ontology_entities_read on public.ontology_entities;
create policy ontology_entities_read on public.ontology_entities
  for select to authenticated
  using (scope = 'common' or public.is_mentor_owner(mentor_id));

drop policy if exists ontology_relations_read on public.ontology_relations;
create policy ontology_relations_read on public.ontology_relations
  for select to authenticated
  using (scope = 'common' or public.is_mentor_owner(mentor_id));

revoke all on public.ontology_entities from anon;
revoke all on public.ontology_relations from anon;
