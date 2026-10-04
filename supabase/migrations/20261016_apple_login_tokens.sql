-- 애플로 로그인한 사람의 애플 쪽 연결 끊기용 열쇠 보관 (2026-10-05, 앱스토어 5.1.1(v)).
-- 애플은 탈퇴할 때 우리가 애플 쪽 연결(토큰)도 끊으라고 요구한다. 웹으로 애플 로그인을 하면 그때 한 번만 받는 refresh token 이 있어야 끊을 수 있다.
-- 서버가 잠가서(AES-256-GCM, CONNECTOR_SECRET_KEY) 넣고, 탈퇴할 때 쓰고 지운다. 평문 보관 금지. 더하기만 한다.
create table if not exists public.apple_login_tokens (
  user_id uuid primary key,
  refresh_token_encrypted text not null,
  client_id text not null,
  updated_at timestamptz not null default now()
);
comment on table public.apple_login_tokens is '애플 로그인 연결 끊기용 잠근 열쇠. 탈퇴 때 쓰고 지움. 서버(service_role) 전용';
alter table public.apple_login_tokens enable row level security;
revoke all on public.apple_login_tokens from anon, authenticated;
grant all on public.apple_login_tokens to service_role;
