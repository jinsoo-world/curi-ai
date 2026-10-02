-- 고객센터 문의 (2026-10-02). 앱스토어 심사 「지원 주소」가 진짜 연락 창구로 이어지게 한다.
-- 쓰기와 읽기는 서버(service_role)만 한다. 로그인 사용자, 비로그인 모두 직접 못 연다(정책 없음 + RLS 켬).
-- 여러 번 돌려도 같은 결과가 나온다.
create table if not exists public.support_inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid null,
  email text not null,
  category text not null,
  body text not null,
  platform text null,
  app_version text null,
  status text not null default 'open',
  answered_at timestamptz null,
  handled_by uuid null
);
-- 먼저 만든 표에도 같은 칸이 있게 (여러 번 돌려도 안전)
alter table public.support_inquiries add column if not exists handled_by uuid null;

do $$ begin
  alter table public.support_inquiries
    add constraint support_inquiries_category_check check (category in ('account', 'billing', 'bot', 'report', 'other'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.support_inquiries
    add constraint support_inquiries_status_check check (status in ('open', 'answered', 'closed'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.support_inquiries
    add constraint support_inquiries_body_len_check check (char_length(body) between 10 and 2000);
exception when duplicate_object then null; end $$;

create index if not exists support_inquiries_created_idx on public.support_inquiries (created_at desc);
create index if not exists support_inquiries_status_created_idx on public.support_inquiries (status, created_at desc);

alter table public.support_inquiries enable row level security;
-- 정책을 일부러 하나도 만들지 않는다: anon, authenticated 는 읽기도 쓰기도 못 한다
revoke all on public.support_inquiries from anon, authenticated;

comment on table public.support_inquiries is '고객센터 문의. /api/support/inquiry 가 넣고 /admin/os/inquiries 에서 처리. 서버만 접근. 탈퇴하면 user_id 만 비우고 3년 보관';
comment on column public.support_inquiries.handled_by is '마지막으로 상태를 바꾼 관리자 id';
