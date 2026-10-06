-- 봇 「추가 프롬프트」 칸 (2026-10-06 대표 지시: "지시문 밑에 추가 프롬프트라고 해서 5천 자까지 텍스트 삽입 가능하게 하고 그걸 읽게")
--
-- 무엇: mentors.extra_prompt text, 5,000자 제한. 봇 주인이 지시문 밑에 적는 참고 자료(자주 받는 질문과 답, 말투 예시, 꼭 지킬 규칙).
-- 비밀 칸: 지시문(system_prompt)과 같이 주인과 서버만 본다.
--   20261021_mentors_column_lockdown.sql 이 anon·authenticated 에게 공개 칸 28개만 칸 단위로 읽게 했다.
--   새 칸은 그 목록에 없으니 원래도 못 읽지만, 혹시 표 단위 권한이 다시 생겨도 이 칸은 막히도록 칸 단위로 한 번 더 거둔다.
--   코드도 같은 목록을 쓴다: src/domains/mentor/public-fields.ts 의 PRIVATE_MENTOR_FIELDS 에 extra_prompt 를 넣었다.
--
-- ⚠️ 적용 순서: 이 SQL 을 먼저 실행하고, 그 다음 코드 PR(feat/bot-extra-prompt)을 병합·배포한다.
--   칸만 더하는 것이라 옛 코드는 아무 영향이 없다. 반대로 코드가 먼저 나가면 단체방·전달·초안·AI 공개 확인이
--   없는 칸을 읽다 실패한다(1:1 대화는 옛 칸 목록으로 다시 읽어 버틴다).
-- 여러 번 실행해도 안전하다. 기존 데이터는 바꾸지 않는다.

begin;

alter table public.mentors
    add column if not exists extra_prompt text;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'mentors_extra_prompt_len' and conrelid = 'public.mentors'::regclass
    ) then
        alter table public.mentors
            add constraint mentors_extra_prompt_len check (extra_prompt is null or char_length(extra_prompt) <= 5000);
    end if;
end $$;

comment on column public.mentors.extra_prompt is '봇 주인이 쓴 추가 프롬프트(최대 5,000자). 비밀 칸: 서버(service_role)만 읽는다. 대화 때 지시문 다음, 공통 안전 규칙 앞에 울타리로 붙는다';

-- 회원·손님 열쇠는 이 칸을 읽지도 쓰지도 못한다
revoke select (extra_prompt), insert (extra_prompt), update (extra_prompt) on public.mentors from anon, authenticated;
grant all on table public.mentors to service_role;

commit;
