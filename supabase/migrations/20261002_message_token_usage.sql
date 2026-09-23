-- 대화 한 턴의 실제 LLM 토큰 사용량 (비용/마진 계측)
-- tokens_used 는 이미 있고 총합으로 쓴다. prompt/completion 을 칸으로 나눠 둔다.
-- 숫자는 LLM 이 돌려준 값만 넣는다. 없으면 NULL 그대로 둔다.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS prompt_tokens integer,
  ADD COLUMN IF NOT EXISTS completion_tokens integer;

COMMENT ON COLUMN public.messages.tokens_used IS '총 토큰 (prompt + completion). LLM usage.total_tokens 또는 합';
COMMENT ON COLUMN public.messages.prompt_tokens IS '입력(프롬프트) 토큰. LLM usage.prompt_tokens';
COMMENT ON COLUMN public.messages.completion_tokens IS '출력(완성) 토큰. LLM usage.completion_tokens';
