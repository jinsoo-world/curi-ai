-- 회원·손님 열쇠 잠금 (2026-10-06 보안 수리 2탄)
--
-- 왜: 웹에 공개된 손님 열쇠(anon, sb_publishable_…)와 로그인 회원 열쇠(authenticated)로
--   ① mentors 의 봇 지시문(system_prompt)·말투 틀·성격 꼬리표가 로그인 없이 전부 읽혔다(운영 실측: 봇 94개, 지시문 92개).
--   ② 이름은 'Service role …' 인데 대상이 public, 조건이 true 인 정책 때문에 회원 누구나
--      남의 구독(billing_key 포함)·결제·알림·인사이트·수익화 설정을 읽고 고칠 수 있었다.
--      (service_role 은 원래 RLS 를 건너뛴다. 이런 정책은 필요 없다)
--   ③ 회원이 자기 대화방에 role='assistant' 가짜 봇 답을 넣거나 진짜 봇 답을 고칠 수 있었다.
--   ④ 회원이 users 자기 줄의 하루 무료 사용 수 등을 직접 고칠 수 있었다.
--
-- 원칙: 서버는 관리자 열쇠(service_role)로 읽고 쓴다(코드 전수 확인, PR 본문 표).
--   회원·손님 열쇠에는 화면이 직접 읽는 것만 남긴다.
--   - mentors: 공개 칸 28개 읽기만 (src/domains/mentor/public-fields.ts 의 PUBLIC_MENTOR_FIELDS 와 정확히 같다)
--   - chat_sessions·messages: 회원 본인 것 읽기만
--   - users: 읽기는 그대로(정책 별도 확인), 쓰기 회수
--   - subscriptions·payments·mentor_monetization·insights·notifications·credits: 전부 회수
--
-- ⚠️ 적용 순서: 이 SQL 은 코드 PR(이 파일이 든 PR) 과 #49(sessions/merge·mention-handoff·relay 관리자 쓰기)가
--   운영에 배포된 뒤에 실행한다. 먼저 실행하면 세션 열쇠로 쓰던 옛 코드가 42501(권한 없음)로 깨진다.
-- 여러 번 실행해도 안전하다. 데이터는 바꾸지 않는다. service_role 권한은 건드리지 않고 오히려 확실히 준다.

begin;

-- ─────────────────────────────────────────────────────────────
-- 1) mentors — 칸 단위 읽기 권한. 비밀 칸 4개(system_prompt, persona_template, style_template, personality_traits)는 못 읽는다.
--    쓰기(insert·update·delete)도 회수: 회원 열쇠로 mentors 에 쓰는 코드가 없다(봇 만들기·고치기·공개는 전부 서버 관리자 열쇠).
--    이걸 안 막으면 회원이 REST 로 자기 봇을 status='active'·is_active=true 로 바꿔 AI 공개 확인을 건너뛰거나
--    price·is_premium·subscriber_count 를 고칠 수 있다.
--    행 정책("Anyone can view active mentors" 등)은 그대로 둔다(칸 권한만으로 지시문은 막힌다).
-- ─────────────────────────────────────────────────────────────
revoke all on table public.mentors from anon, authenticated;
grant select (
    id, name, slug, title, description, avatar_url, expertise,
    greeting_message, sample_questions, is_premium, is_active, category,
    organization, handle, links, chat_theme_color, mentor_type, price,
    subscriber_count, creator_id, voice_sample_url, voice_test_url, voice_id,
    pdf_export_enabled, status, created_at, updated_at, sort_order
) on public.mentors to anon, authenticated;
grant all on table public.mentors to service_role;

-- ─────────────────────────────────────────────────────────────
-- 2) 서버만 쓰는 표 — 정책 전부 지우고(조건 true 정책 포함) 회원·손님 권한 전부 회수. RLS 는 켠 채로 둔다.
--    subscriptions : "Service role can manage subscriptions" (ALL, true/true)
--    payments      : 결제 기록. 화면이 직접 읽지 않는다(/api/billing/history 가 서버 열쇠로 본인 것만)
--    mentor_monetization : "Allow all access to mentor_monetization" (ALL, true/true). 손님 열쇠로도 읽혔다(실측)
--    insights      : "Service role full access to insights" (ALL, true/true) + "Anyone can view shared insight by id" (SELECT, true)
--                    코드에서 쓰는 곳 0 (공유 기능 코드 없음, git log 확인) → 정책 제거만
--    notifications : "Service role can manage notifications" (ALL, true). 이제 /api/notifications 가 서버 열쇠로 본인 것만
--    credits       : "Service can manage credits" (ALL, true/true). 코드에서 쓰는 곳 0
-- ─────────────────────────────────────────────────────────────
do $$
declare
    t text;
    p record;
begin
    foreach t in array array['subscriptions', 'payments', 'mentor_monetization', 'insights', 'notifications', 'credits'] loop
        if to_regclass('public.' || t) is null then continue; end if;
        for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
            execute format('drop policy %I on public.%I', p.policyname, t);
        end loop;
        execute format('alter table public.%I enable row level security', t);
        execute format('revoke all on table public.%I from anon, authenticated', t);
        execute format('grant all on table public.%I to service_role', t);
    end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3) chat_sessions·messages — 회원은 본인 것 읽기만. 쓰기·지우기는 서버 API 가 주인 확인 뒤 관리자 열쇠로.
--    지우는 정책: "Users can manage own sessions"(ALL), "Users can manage own messages"(ALL),
--               "Users can insert own messages", "Users can create/update/delete own sessions" 등 이 두 표의 정책 전부.
--    새 정책: 본인 대화방 읽기, 본인 대화방의 말 읽기 (화면 /chats 와 /api/sessions GET 이 회원 열쇠로 읽는다)
-- ─────────────────────────────────────────────────────────────
do $$
declare
    t text;
    p record;
begin
    foreach t in array array['chat_sessions', 'messages'] loop
        for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
            execute format('drop policy %I on public.%I', p.policyname, t);
        end loop;
    end loop;
end $$;

alter table public.chat_sessions enable row level security;
alter table public.messages enable row level security;

create policy chat_sessions_select_own on public.chat_sessions
    for select to authenticated
    using (user_id = auth.uid());

create policy messages_select_own on public.messages
    for select to authenticated
    using (exists (
        select 1 from public.chat_sessions s
        where s.id = messages.session_id and s.user_id = auth.uid()
    ));

revoke all on table public.chat_sessions from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
grant select on table public.chat_sessions to authenticated;
grant select on table public.messages to authenticated;
grant all on table public.chat_sessions to service_role;
grant all on table public.messages to service_role;

-- ─────────────────────────────────────────────────────────────
-- 4) users — 쓰기 회수(회원 열쇠로 users 에 쓰는 코드 0: 하루 무료 사용 수 올리기도 서버 열쇠로 바꿨다).
--    읽기(select)는 그대로 둔다: 화면 9곳이 회원 열쇠로 자기 줄을 읽는다. 읽기 정책이 「본인 줄만」인지는
--    아래 확인 쿼리로 따로 본다(이 파일에서 행 정책은 안 바꾼다). 손님은 이미 읽기 권한이 없다(실측 42501).
-- ─────────────────────────────────────────────────────────────
revoke insert, update, delete, truncate, references, trigger on table public.users from anon, authenticated;
revoke all on table public.users from anon;
grant all on table public.users to service_role;

commit;

-- 적용 뒤 확인 (손님 열쇠로):
--   GET /rest/v1/mentors?select=id,system_prompt        → 42501 permission denied
--   GET /rest/v1/mentors?select=id,name&is_active=eq.true → 200 (공개 칸은 그대로)
--   GET /rest/v1/mentor_monetization?select=*            → 42501
-- 권한 표 확인:
--   select grantee, table_name, privilege_type from information_schema.role_table_grants
--    where table_schema='public' and grantee in ('anon','authenticated')
--      and table_name in ('mentors','subscriptions','payments','mentor_monetization','insights','notifications','credits','chat_sessions','messages','users')
--    order by 2,1,3;
--   select grantee, column_name from information_schema.column_privileges
--    where table_schema='public' and table_name='mentors' and grantee in ('anon','authenticated') and privilege_type='SELECT';
--   select tablename, policyname, cmd, roles, qual, with_check from pg_policies
--    where schemaname='public' and tablename in ('users','chat_sessions','messages') order by 1,2;
