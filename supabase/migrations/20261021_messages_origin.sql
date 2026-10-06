-- messages.origin — 이 메시지가 어디서 만들어졌는가.
--   server       = 서버가 봇 답으로 직접 만든 것(기본값). 소리로 읽기(/api/tts)는 이것만 읽는다.
--   guest_import = 손님이 브라우저에서 가져온 대화를 로그인 때 옮겨 저장한 것(봇이 한 말이라고 믿을 수 없다).
--   handoff      = @봇 넘김·릴레이로 서버가 넣은 안내/전달 글.
-- 코드 배포 전에 먼저 적용한다(코드가 이 칸을 읽는다). 기존 행은 전부 'server' 로 채워진다.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'server'
  CHECK (origin IN ('server', 'guest_import', 'handoff'));
