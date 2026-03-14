-- auto_tts 컬럼 추가 (기본값 false)
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_tts BOOLEAN DEFAULT false;
