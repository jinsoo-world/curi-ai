-- 의미 답 저장소 (대표 결정 0928). 같은 봇에 거의 같은 첫 질문이 오면 모델을 다시 부르지 않고 저장해 둔 답을 쓴다.
-- 서버 전용 (RLS 켜고 정책 없음). 덧붙이기만 한다.
-- 칸막이: mentor_id + scope_key(공개 봇은 'public', 개인 봇은 'owner:<주인 id>') + bot_version(봇 지침과 자료의 지문)
-- 봇 지침이나 자료가 바뀌면 bot_version 이 바뀌어 예전 답은 다시 안 쓰인다.

create table if not exists public.semantic_answer_cache (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    mentor_id uuid not null,
    scope_key text not null,
    bot_version text not null,
    embedding extensions.vector(768) not null,
    question text not null,
    answer text not null,
    hits integer not null default 0,
    last_hit_at timestamptz
);

create index if not exists semantic_answer_cache_lookup_idx
    on public.semantic_answer_cache (mentor_id, scope_key, bot_version, expires_at);

alter table public.semantic_answer_cache enable row level security;
revoke all on table public.semantic_answer_cache from anon, authenticated;

-- 이 봇 자료의 지문. 자료를 더하거나 지우거나 다시 처리하면 바뀐다.
create or replace function public.knowledge_version(p_mentor uuid)
returns text
language sql
stable
set search_path = public
as $$
    select md5(
        coalesce((select string_agg(s.id::text || ':' || coalesce(s.chunk_count, 0) || ':' || coalesce(s.processing_status, '') || ':' || coalesce(s.fetched_at::text, '') || ':' || md5(coalesce(s.context, '')), ',' order by s.id)
                  from public.knowledge_sources s where s.mentor_id = p_mentor), '')
        || '|' ||
        coalesce((select string_agg(c.id::text || ':' || md5(c.content), ',' order by c.id)
                  from public.knowledge_chunks c where c.mentor_id = p_mentor), '')
    );
$$;

-- 가장 가까운 저장된 답 하나 (문턱 이상, 안 지난 것만). 찾으면 hits 를 올린다.
create or replace function public.match_answer_cache(
    p_embedding extensions.vector,
    p_mentor uuid,
    p_scope text,
    p_version text,
    p_min_sim double precision
)
returns table (id bigint, answer text, similarity double precision)
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
    hit record;
begin
    if p_mentor is null or p_scope is null or p_version is null then
        raise exception 'match_answer_cache: mentor, scope, version 은 필수';
    end if;
    select c.id, c.answer, 1 - (c.embedding <=> p_embedding) as sim
      into hit
      from public.semantic_answer_cache c
     where c.mentor_id = p_mentor
       and c.scope_key = p_scope
       and c.bot_version = p_version
       and c.expires_at > now()
     order by c.embedding <=> p_embedding
     limit 1;
    if hit.id is null or hit.sim < p_min_sim then
        return;
    end if;
    update public.semantic_answer_cache set hits = hits + 1, last_hit_at = now() where semantic_answer_cache.id = hit.id;
    id := hit.id; answer := hit.answer; similarity := hit.sim;
    return next;
end;
$$;

revoke all on function public.knowledge_version(uuid) from public, anon, authenticated;
revoke all on function public.match_answer_cache(extensions.vector, uuid, text, text, double precision) from public, anon, authenticated;
grant execute on function public.knowledge_version(uuid) to service_role;
grant execute on function public.match_answer_cache(extensions.vector, uuid, text, text, double precision) to service_role;
