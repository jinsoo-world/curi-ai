-- 광고비 판단용 「어디서 왔나」 추적 (대표 지시 1005). 덧붙이기만 한다: 새 칸(NULL 허용, 기본값 없음)만 더하고 지우거나 바꾸는 것은 없다.
-- 새 표는 없다. 모두 서비스 열쇠(service_role)로만 읽고 쓰는 표라 회원 화면에는 보이지 않는다.
--
--  ① visit_logs     (방문 기록)  기기, 운영체제, 앱 여부, 추천 코드, 브라우저 표식을 더한다. 이제 직접 들어온 방문도 한 줄 남긴다.
--  ② user_onboarding (가입 온보딩) 처음 들어온 길의 추천 코드와 시각을 더한다. (utm, referrer, 기기는 이미 있는 칸을 쓴다)
--  ③ user_plans     (요금제)      처음 결제한 시각, 결제 경로(toss 또는 revenuecat), 그때의 유입 정보 사본(jsonb)을 더한다.
--
-- 적용 전 크기 확인(2026-10-05): visit_logs 38줄, user_onboarding 3줄, user_plans 0줄. 칸 추가만이라 즉시 끝난다.
-- 여러 번 실행해도 안전하다.

alter table public.visit_logs
    add column if not exists device text,        -- mobile, pc
    add column if not exists os text,            -- ios, android, windows, mac, linux, other
    add column if not exists app_shell text,     -- ios_app, android_app, web
    add column if not exists ref_code text,      -- 주소의 ?ref= 값 (추천 링크)
    add column if not exists visitor_id text;    -- curi_visitor_id

alter table public.user_onboarding
    add column if not exists ref_code text,            -- 처음 들어온 주소의 ?ref= 값
    add column if not exists first_touch_at timestamptz; -- 브라우저가 적어 둔 처음 들어온 시각. 값이 있으면 브라우저 기록으로 채운 줄

alter table public.user_plans
    add column if not exists first_paid_at timestamptz,
    add column if not exists first_paid_provider text,   -- toss, revenuecat
    add column if not exists paid_attribution jsonb;     -- 처음 결제할 때의 utm, referrer, 추천 코드, 기기 사본
