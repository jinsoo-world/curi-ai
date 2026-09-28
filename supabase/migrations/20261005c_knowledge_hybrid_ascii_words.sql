-- 하이브리드 검색 손질 (20261005 다음)
-- 실제 조각으로 비교해 보니 영문 짧은 낱말(ui 등)이 단어 속 글자(build, quick)에도 걸렸다.
-- 영문과 숫자 낱말은 앞뒤에 영문이나 숫자가 붙지 않은 곳에서만 찾고 (DOHL_사업계획서, 헬로tv 는 찾음), 한국어는 그대로 부분 일치(조사가 붙어도 찾게)로 둔다.
-- create or replace 만 쓴다 (덧붙이기). knowledge_term_hit 는 search_path 를 고정하지 않는다(기본 함수만 써서 안쪽으로 펼쳐지게).

create or replace function public.knowledge_term_hit(content text, term text)
returns boolean
language sql
immutable
as $$
    select case
        when term ~ '^[a-z0-9]+$' then content ~* ('(^|[^a-z0-9])' || term || '([^a-z0-9]|$)')
        else content ilike '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    end;
$$;

revoke all on function public.knowledge_term_hit(text, text) from public, anon, authenticated;
grant execute on function public.knowledge_term_hit(text, text) to service_role;

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
        left join mine m on public.knowledge_term_hit(m.content, t.t)
        group by t.t
    ),
    kw_raw as (
        select m.id,
               count(df.t)::integer as hits,
               sum(ln(1 + (total::double precision / greatest(df.d, 1)))) as score
        from mine m
        join df on df.d > 0
            and public.knowledge_term_hit(m.content, df.t)
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

