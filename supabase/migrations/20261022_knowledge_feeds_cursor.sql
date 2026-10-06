-- ============================================================
-- 2026-10-22 knowledge_feeds.sync_cursor (PR #53, 큐리어스 본체 공개 창구 부담 줄이기)
--
-- 큐리어스 SNS 칸의 매일 자동 배우기는 지난번 본 가장 최신 글 번호에 닿으면 바로 멈춘다(보통 목록 1쪽).
-- 그 번호를 적어 두는 칸. 비어 있으면 처음 배우기처럼 최신 600편까지만 본다.
-- 권한은 바꾸지 않는다(knowledge_feeds 는 service_role 만, 20261022_knowledge_feeds_lock.sql).
-- 코드는 이 칸이 없어도 깨지지 않는다(읽기는 칸을 빼고 다시, 저장은 건너뜀). 여러 번 실행해도 안전.
-- ============================================================

alter table public.knowledge_feeds add column if not exists sync_cursor text;

comment on column public.knowledge_feeds.sync_cursor is
  '지난번 가져오기가 본 가장 최신 글의 기준(큐리어스 = 커뮤니티 글 번호). 다음엔 여기 닿으면 멈춘다';
