-- 채팅방 색깔 선택 기능 추가 (고급설정 유료 기능)
-- 크리에이터가 채팅방 테마 색상을 선택할 수 있도록 함

ALTER TABLE public.mentors
ADD COLUMN IF NOT EXISTS chat_theme_color TEXT;

COMMENT ON COLUMN public.mentors.chat_theme_color IS '채팅방 테마 색상 (hex 코드, nullable). 고급설정에서 설정 가능한 유료 기능';
