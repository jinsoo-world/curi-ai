-- 지식 검색에 낱말 검색을 더한다 (대표 결정 0928, 하이브리드 검색)
--
-- 왜 pg_trgm(부분 글자 일치)인가:
--   한국어는 Postgres 에 형태소 분석기가 없다. 'simple' tsvector 는 「창업자를」, 「창업자는」을 서로 다른 낱말로 저장해서
--   「창업자」로 찾으면 못 찾는다 (실제 조각으로 확인). ILIKE '%창업자%' 는 조사가 붙어도 찾는다.
--   pg_trgm GIN 색인이 ILIKE 를 빠르게 해 주고(3글자 이상), word_similarity 로 동점을 가른다.
--
-- 덧붙이기만 한다: 확장 추가, 색인 추가, 새 함수 추가. 기존 match_knowledge 는 그대로 둔다.
-- 봇 격리: 모든 단계가 mentor_id = match_mentor_id 안에서만 돈다 (기존과 같은 강도).

create extension if not exists pg_trgm with schema extensions;

create index if not exists knowledge_chunks_content_trgm_idx
    on public.knowledge_chunks using gin (content extensions.gin_trgm_ops);

create or replace function public.match_knowledge_hybrid(
    query_embedding extensions.vector,
    match_mentor_id uuid,
    query_terms text[] default '{}',
    query_text text default '',
    match_threshold double precision default 0.7,
    match_count integer default 20
)
returns table (
    chunk_id uuid,
    content text,
    similarity double precision,
    vec_rank integer,
    kw_score double precision,
    kw_hits integer,
    kw_rank integer
)
language plpgsql
stable
set search_path = public, extensions
as $$
declare
    n_terms integer := coalesce(array_length(query_terms, 1), 0);
    need integer := greatest(1, ceil(coalesce(array_length(query_terms, 1), 0) * 0.5)::integer);
    total integer;
begin
    if match_mentor_id is null then
        raise exception 'match_knowledge_hybrid: match_mentor_id 는 필수';
    end if;

    select count(*) into total from public.knowledge_chunks kc where kc.mentor_id = match_mentor_id;

    return query
    with mine as (
        select kc.id, kc.content, 1 - (kc.embedding <=> query_embedding) as sim
        from public.knowledge_chunks kc
        where kc.mentor_id = match_mentor_id
    ),
    vec as (
        select m.id, row_number() over (order by m.sim desc)::integer as r
        from mine m
        where m.sim > match_threshold
        order by m.sim desc
        limit match_count
    ),
    terms as (
        select distinct t from unnest(query_terms) as t where n_terms > 0 and length(t) >= 2
    ),
    df as (
        -- 낱말마다 이 봇 자료 안에서 몇 조각에 나오나 (흔한 낱말은 가볍게)
        select t.t, count(m.id) as d
        from terms t
        left join mine m on m.content ilike '%' || replace(replace(replace(t.t, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        group by t.t
    ),
    kw_raw as (
        select m.id,
               count(df.t)::integer as hits,
               sum(ln(1 + (total::double precision / greatest(df.d, 1)))) as score
        from mine m
        join df on df.d > 0
            and m.content ilike '%' || replace(replace(replace(df.t, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        group by m.id
    ),
    kw as (
        select k.id, k.hits, k.score,
               row_number() over (order by k.score desc, word_similarity(query_text, mm.content) desc)::integer as r
        from kw_raw k
        join mine mm on mm.id = k.id
        where k.hits >= need
        order by k.score desc
        limit match_count
    )
    select m.id, m.content, m.sim, vec.r, kw.score, kw.hits, kw.r
    from mine m
    left join vec on vec.id = m.id
    left join kw on kw.id = m.id
    where vec.id is not null or kw.id is not null;
end;
$$;

revoke all on function public.match_knowledge_hybrid(extensions.vector, uuid, text[], text, double precision, integer) from public, anon, authenticated;
grant execute on function public.match_knowledge_hybrid(extensions.vector, uuid, text[], text, double precision, integer) to service_role;

comment on function public.match_knowledge_hybrid is '벡터 + 낱말(pg_trgm ILIKE) 후보를 한 봇(mentor_id) 안에서만 뽑는다. 순위 합치기(RRF)는 앱(queries.ts)';
