-- 인스타그램 글의 구조 보관 (대표 지시 2026-10-05 「사진과 좋아요까지」). 더하기만 한다. 기존 표는 건드리지 않는다.
-- 봇이 배우는 글(knowledge_sources, knowledge_chunks)은 그대로 두고, 글마다 올린 시각, 좋아요, 댓글, 해시태그, 사진 주소를 따로 둔다.
-- 사진 주소는 인스타그램 쪽에서 며칠 뒤 만료된다 (image_expires_at). 사진 설명을 만들면 image_note 에 적는다 (아직 쓰지 않음, 승인 대기).
-- 자료나 봇이 지워지면 같이 지워진다 (on delete cascade). 서버 열쇠(service_role)만 읽고 쓴다.
create table if not exists public.knowledge_social_posts (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources(id) on delete cascade,
  mentor_id uuid not null references public.mentors(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'threads')),
  post_code text,
  post_url text,
  caption text not null default '',
  hashtags text[] not null default '{}',
  mentions text[] not null default '{}',
  posted_at timestamptz,
  like_count integer,
  comment_count integer,
  view_count integer,
  media_type text check (media_type in ('image', 'video', 'carousel')),
  is_reel boolean not null default false,
  image_urls jsonb not null default '[]'::jsonb,
  image_expires_at timestamptz,
  image_note text,
  fetched_at timestamptz not null default now()
);
create unique index if not exists knowledge_social_posts_source_code_uq on public.knowledge_social_posts (source_id, post_code) where post_code is not null;
create index if not exists knowledge_social_posts_mentor_idx on public.knowledge_social_posts (mentor_id, posted_at desc);
alter table public.knowledge_social_posts enable row level security;
grant all on table public.knowledge_social_posts to service_role;
