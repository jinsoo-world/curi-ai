-- ============================================================
-- 2026-09-26 루틴(bot_routines) 표 1개 신설. 기존 표는 건드리지 않는다.
--
-- 루틴 = 봇이 「정해진 때에」 혼자 한 번 도는 일.
--        그록봇의 「루틴」과 같은 물건이고, 우리 먼저 말 걸기 크론을 승격시킨 것이다.
--
-- 켜기 전 6확인(기획 §11 「루틴 켜기 전 6확인」)이 그대로 칸이 된다:
--   ① 담당 봇(mentor_id)  ② 시간·요일(schedule_kind·run_at_local·weekday·timezone)
--   ③ 입력 출처(input_source)  ④ 기대 결과(expected_output)
--   ⑤ 승인 경계(approval_boundary)  ⑥ 자료가 없을 때(on_missing_data)
--
-- 안전장치
--   · 새 루틴은 항상 꺼진 채로 태어난다(enabled=false). 사람이 「시험 실행」으로 한 번 보고 켠다.
--   · 루틴은 초안·요약·정리만 한다. 밖으로 보내는 일(메시지·게시·결제·삭제)은 직접 하지 않는다.
--   · RLS 켬 + 본인 행만. 서버(service_role)는 RLS 를 우회하니 API 에서 user_id 를 반드시 검사한다.
--
-- 적용: Supabase SQL 편집기에 통째로 붙여 실행(여러 번 실행해도 안전).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bot_routines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  mentor_id         UUID NOT NULL REFERENCES public.mentors(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,                       -- 목록에 보이는 이름: 「평일 아침 팬 질문 모아 초안」
  instruction       TEXT NOT NULL,                       -- 그때 봇에게 시킬 말 한 덩어리
  -- 언제 도나
  schedule_kind     TEXT NOT NULL DEFAULT 'daily'
                    CHECK (schedule_kind IN ('daily', 'weekdays', 'weekly')),
  run_at_local      TIME NOT NULL DEFAULT '08:30',       -- 그 나라 시각(아래 timezone 기준)
  weekday           SMALLINT CHECK (weekday BETWEEN 0 AND 6),  -- weekly 일 때만. 0=일요일
  timezone          TEXT NOT NULL DEFAULT 'Asia/Seoul',
  -- 켜기 전 6확인 중 나머지
  input_source      TEXT,                                -- 「어디를 보고 만드나」 (없으면 대화 기억만)
  expected_output   TEXT NOT NULL DEFAULT '',            -- 「무엇이 나와야 성공인가」
  on_missing_data   TEXT NOT NULL DEFAULT 'report_failure'
                    CHECK (on_missing_data IN ('report_failure', 'skip')),
  approval_boundary TEXT NOT NULL DEFAULT '밖으로 보내는 일은 항상 승인받는다',
  -- 상태
  enabled           BOOLEAN NOT NULL DEFAULT false,      -- 새 루틴은 꺼진 채로 태어난다
  last_run_at       TIMESTAMPTZ,
  last_result       TEXT,                                -- 「성공: …」 / 「실패: …」 한 줄
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 실행기(크론)가 5분마다 「지금 돌 것」만 빠르게 집는 길
CREATE INDEX IF NOT EXISTS bot_routines_due_idx  ON public.bot_routines (enabled, run_at_local);
CREATE INDEX IF NOT EXISTS bot_routines_user_idx ON public.bot_routines (user_id, created_at DESC);

COMMENT ON TABLE  public.bot_routines IS '봇 루틴. 켜기 전 6확인이 그대로 칸이다. 새 루틴은 꺼진 채로 태어난다';
COMMENT ON COLUMN public.bot_routines.on_missing_data IS 'report_failure=지어내지 말고 실패를 보고(기본) · skip=조용히 건너뜀';

-- ---------- RLS: 켬, 본인 행만 ----------
ALTER TABLE public.bot_routines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own bot_routines" ON public.bot_routines;
CREATE POLICY "own bot_routines" ON public.bot_routines
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
