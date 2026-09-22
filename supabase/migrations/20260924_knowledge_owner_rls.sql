-- ============================================================
-- 2026-09-24 자료(지식) 표 격리 — 「로그인한 누구나 읽기」 → 「그 봇의 주인만」
-- 크리밋 기준 보안설계 §E-2 (02_제품/큐리스/큐리AI_보안설계_크리밋기준_0923.md)
--
-- 소유 사슬(실측 2026-09-23, src/domains/mentor/queries.ts):
--   knowledge_sources.mentor_id → mentors.id
--   mentors.creator_id          → creator_profiles.id      (⚠️ auth.uid() 가 아니다)
--   creator_profiles.user_id    → auth.users.id
-- 그래서 정책은 creator_profiles 를 한 번 거쳐야 한다. 곧바로 m.creator_id = auth.uid() 로 쓰면 주인도 못 본다.
--
-- 서버 코드(service_role)는 RLS 를 건너뛴다. 그래서 검색 함수 호출은 mentorId 가 없으면
-- 예외를 던지게 코드에서 막았다(src/domains/knowledge/queries.ts matchKnowledge).
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행. 여러 번 실행해도 안전.
-- ============================================================

ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks  ENABLE ROW LEVEL SECURITY;

-- 옛 정책(누구나 읽기) 제거
DROP POLICY IF EXISTS "Authenticated users can view knowledge" ON public.knowledge_sources;
DROP POLICY IF EXISTS "Authenticated users can view chunks"    ON public.knowledge_chunks;

-- 자료 원장: 그 봇의 주인만 읽고·쓰고·지운다
DROP POLICY IF EXISTS "owner_all_knowledge_sources" ON public.knowledge_sources;
CREATE POLICY "owner_all_knowledge_sources" ON public.knowledge_sources
  FOR ALL
  USING (EXISTS (
      SELECT 1 FROM public.mentors m
      JOIN public.creator_profiles cp ON cp.id = m.creator_id
      WHERE m.id = knowledge_sources.mentor_id AND cp.user_id = auth.uid()))
  WITH CHECK (EXISTS (
      SELECT 1 FROM public.mentors m
      JOIN public.creator_profiles cp ON cp.id = m.creator_id
      WHERE m.id = knowledge_sources.mentor_id AND cp.user_id = auth.uid()));

-- 자료 조각: 원장과 같은 기준
DROP POLICY IF EXISTS "owner_all_knowledge_chunks" ON public.knowledge_chunks;
CREATE POLICY "owner_all_knowledge_chunks" ON public.knowledge_chunks
  FOR ALL
  USING (EXISTS (
      SELECT 1 FROM public.mentors m
      JOIN public.creator_profiles cp ON cp.id = m.creator_id
      WHERE m.id = knowledge_chunks.mentor_id AND cp.user_id = auth.uid()))
  WITH CHECK (EXISTS (
      SELECT 1 FROM public.mentors m
      JOIN public.creator_profiles cp ON cp.id = m.creator_id
      WHERE m.id = knowledge_chunks.mentor_id AND cp.user_id = auth.uid()));

-- ⚠️ 확인할 것(콘솔): 검색 함수 public.match_knowledge(query_embedding, match_mentor_id, match_threshold, match_count)
--   본문에 `AND c.mentor_id = match_mentor_id` 가 있는지. 없으면 그 줄을 넣는다. 원문이 저장소에 없어 여기서 재정의하지 않는다.
