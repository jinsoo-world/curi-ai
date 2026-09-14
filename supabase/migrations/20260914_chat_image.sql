-- 대화에 사진 첨부 (2026-09-14)
-- 1) 메시지에 사진 주소 칸 하나 추가
-- 2) 사진을 담아둘 공개 보관함 chat-images 생성
--
-- 업로드는 서버가 service_role 로만 하므로 별도 쓰기 정책은 두지 않는다.
-- 읽기는 public 보관함이라 주소를 아는 사람이면 볼 수 있다(프로필 사진과 같은 수준).

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS image_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-images',
  'chat-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;
