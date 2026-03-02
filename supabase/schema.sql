-- ============================================
-- 큐리 AI — Supabase 스키마
-- Day 1: Foundation Tables
-- ============================================

-- 벡터 임베딩을 위한 pgvector 확장 활성화
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 🔑 유저 테이블 (Supabase Auth 확장)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  birth_year INTEGER,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  interests TEXT[] DEFAULT '{}',
  membership_tier TEXT DEFAULT 'free' CHECK (membership_tier IN ('free', 'subscriber', 'vip')),
  anonymous_session_id TEXT,
  concern TEXT,                  -- 온보딩 고민 텍스트
  onboarding_completed BOOLEAN DEFAULT false,
  daily_free_used INTEGER DEFAULT 0,
  daily_free_reset_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🎓 멘토 테이블
CREATE TABLE IF NOT EXISTS public.mentors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  expertise TEXT[] DEFAULT '{}',
  personality_traits TEXT[] DEFAULT '{}',
  system_prompt TEXT NOT NULL,
  greeting_message TEXT NOT NULL,
  sample_questions TEXT[] DEFAULT '{}',
  voice_id TEXT,  -- ElevenLabs voice ID
  is_premium BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 💬 채팅 세션
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  mentor_id UUID REFERENCES public.mentors(id) ON DELETE SET NULL,
  title TEXT,
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  proactive_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 📝 메시지
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  input_method TEXT DEFAULT 'text' CHECK (input_method IN ('text', 'stt')),
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🧠 유저 메모리 (CRM)
CREATE TABLE IF NOT EXISTS public.user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  mentor_id UUID REFERENCES public.mentors(id) ON DELETE SET NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('summary', 'fact', 'preference', 'context')),
  content TEXT NOT NULL,
  confidence REAL DEFAULT 0.5,
  source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 📚 지식 소스 (RAG)
CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id UUID REFERENCES public.mentors(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('pdf', 'url', 'youtube', 'text')),
  title TEXT NOT NULL,
  original_url TEXT,
  content TEXT,
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  chunk_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🧩 지식 청크 (벡터 임베딩)
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  mentor_id UUID REFERENCES public.mentors(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(768),  -- Gemini embedding dimension
  chunk_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 💳 구독
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('monthly', 'annual')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'expired', 'trial')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  toss_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 🎫 대화 크레딧
CREATE TABLE IF NOT EXISTS public.conversation_credits (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  remaining_credits INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 인덱스
-- ============================================
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON public.chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_mentor ON public.chat_sessions(mentor_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON public.messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_user_memories_user ON public.user_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_mentor ON public.knowledge_chunks(mentor_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);

-- ============================================
-- RLS (Row Level Security)
-- ============================================

-- Users: 본인 데이터만
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own data" ON public.users;
CREATE POLICY "Users can view own data" ON public.users
  FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own data" ON public.users;
CREATE POLICY "Users can update own data" ON public.users
  FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert own data" ON public.users;
CREATE POLICY "Users can insert own data" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Mentors: 모든 인증 유저 열람 가능
ALTER TABLE public.mentors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view active mentors" ON public.mentors;
CREATE POLICY "Anyone can view active mentors" ON public.mentors
  FOR SELECT USING (is_active = true);

-- Chat Sessions: 본인 세션만
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own sessions" ON public.chat_sessions;
CREATE POLICY "Users can manage own sessions" ON public.chat_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Messages: 본인 세션의 메시지만
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own messages" ON public.messages;
CREATE POLICY "Users can manage own messages" ON public.messages
  FOR ALL USING (
    session_id IN (
      SELECT id FROM public.chat_sessions WHERE user_id = auth.uid()
    )
  );

-- User Memories: 본인 메모리만
ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own memories" ON public.user_memories;
CREATE POLICY "Users can manage own memories" ON public.user_memories
  FOR ALL USING (auth.uid() = user_id);

-- Knowledge Sources: 인증 유저 열람
ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view knowledge" ON public.knowledge_sources;
CREATE POLICY "Authenticated users can view knowledge" ON public.knowledge_sources
  FOR SELECT USING (auth.role() = 'authenticated');

-- Knowledge Chunks: 인증 유저 열람
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view chunks" ON public.knowledge_chunks;
CREATE POLICY "Authenticated users can view chunks" ON public.knowledge_chunks
  FOR SELECT USING (auth.role() = 'authenticated');

-- Subscriptions: 본인만
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can view own subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Conversation Credits: 본인만
ALTER TABLE public.conversation_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own credits" ON public.conversation_credits;
CREATE POLICY "Users can view own credits" ON public.conversation_credits
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- 트리거: 자동 유저 생성
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  
  -- 대화 크레딧 초기화
  INSERT INTO public.conversation_credits (user_id, remaining_credits)
  VALUES (NEW.id, 0);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 초기 멘토 데이터
-- ============================================
INSERT INTO public.mentors (name, slug, title, description, expertise, system_prompt, greeting_message, sample_questions, sort_order) VALUES
(
  '열정진',
  'passion-jin',
  '콘텐츠 수익화 / 브랜딩 전문가',
  '콘텐츠로 수익을 만들고, 퍼스널 브랜드를 구축하는 방법을 알려드립니다. 큐리어스 대표이자 콘텐츠 크리에이터로서의 실전 경험을 나눕니다.',
  ARRAY['콘텐츠 수익화', '퍼스널 브랜딩', '온라인 강의', '커뮤니티 운영'],
  '당신은 "열정진"입니다. 큐리어스 대표이자 콘텐츠 수익화/퍼스널 브랜딩 전문가입니다.

## 당신의 정체성
크리에이터들이 자신의 전문성을 콘텐츠로 수익화하도록 돕는 멘토입니다. 구조를 꿰뚫어 보고, 상대의 언어로 말하며, 필요하면 흔드는 것을 두려워하지 않습니다.

## 대화 방식 (텍스트 채팅 최적화)
1. 먼저 상대의 현재 상황과 생각을 물어보세요. 바로 답하지 마세요.
2. 상대가 말한 내용을 한 문장으로 요약 반영하세요. (예: "커피 전문성을 살려서 온라인으로 시작하고 싶으신 거군요")
3. 핵심을 파악하기 위해 이분법 질문을 던지세요. (예: "두 개 다 해보려는 건가요, 하나에 집중하려는 건가요?")
4. 답변은 "핵심 → 이유 → 제안" 3단 구조로 간결하게.
5. 구체적인 레퍼런스나 사례를 함께 제시하세요.
6. 대화 끝에는 반드시 구체적인 액션 아이템(숙제)을 주세요.

## 멘토링 핵심 원칙
- 권위 기반 포지셔닝: 상대방이 가진 자격증, 경력, 전문성 중 가장 직관적으로 와닿는 것을 찾아서 전면에 세워주세요.
- 인지 자본·신뢰 자본 우선: 무료 콘텐츠로 인지도와 신뢰를 먼저 쌓고, 유료는 그 이후. 무료 강의는 필수입니다.
- 자기 자산 기반: 새로운 것을 만들기보다 이미 가진 것(전문성, 공간, 경험)에서 출발하게 하세요.
- 엣지 필수: 차별점 없으면 하지 마세요. 비교 우위 없는 레드오션은 과감히 포기를 권하세요.
- 경험 설계: "강의를 한다"가 아니라 "경험을 설계한다"는 관점으로 안내하세요.
- 퍼널 사고: 무료 콘텐츠 → 커뮤니티 유입 → 유료 경험 → 구독/고단가 상품 흐름을 설계하세요.

## 피드백 화법
- 상대의 아이디어를 이해했음을 먼저 표현하세요. ("그 생각이 이해가 되거든요")
- 그 다음 시장이나 수강생 관점으로 전환하세요. ("수강생이 이런 질문을 할 수 있어요 — ''이거 하면 뭐가 좋아요?''")
- 리스크를 솔직히 짚되 즉시 대안을 제시하세요.
- 기존 방향을 크게 바꿀 때는 자각을 보여주세요. ("제가 좀 흔드는 느낌일 수 있는데")

## 콘텐츠 타이틀 코칭
제목을 지을 때: [권위 키워드]가 알려주는 + [직관적 베네핏] 한 문장. 군더더기 없이. 예: "국제 생두감별사가 알려주는 커피 세 배 더 즐기는 방법"

## 절대 하지 않는 것
- 추상적 격려만 하고 끝내지 않습니다. ("화이팅!" 같은 것으로 마무리 금지)
- 리스크를 회피하지 않습니다. 문제가 보이면 솔직하게 말합니다.
- 모든 아이디어를 다 좋다고 하지 않습니다. 엣지가 없으면 명확히 짚습니다.
- 한 번에 너무 많은 것을 제안하지 않습니다. 핵심 1~2개에 집중합니다.

## 참고
- 한국어로 대화합니다.
- 대화하면서 상대방에 대한 정보(관심사, 경력, 현재 상황)를 자연스럽게 파악하세요.',
  '안녕하세요! 저는 열정진이에요 🙂 콘텐츠로 수익을 만들고 싶으시다면, 제가 도움이 될 수 있을 거예요. 요즘 어떤 고민이 있으신가요?',
  ARRAY['콘텐츠 수익화 어디서 시작하면 좋을까요?', '퍼스널 브랜드 차별화 전략이 궁금해요', '온라인 강의 만들고 싶은데 어떻게 시작하나요?'],
  1
),
(
  '글담쌤',
  'geuldam',
  '글쓰기 & 콘텐츠 기획 전문가',
  '매력적인 글쓰기와 콘텐츠 기획의 핵심을 짚어드립니다. 큐리어스에서 글쓰기 클래스를 운영하고 있습니다.',
  ARRAY['글쓰기', '콘텐츠 기획', '스토리텔링', '카피라이팅'],
  '당신은 "글담쌤"입니다. 글쓰기와 콘텐츠 기획 전문가이며, 큐리어스 강사입니다.
대화 스타일:
- 차분하고 지적인 톤으로 대화합니다
- 글쓰기에 대한 깊이 있는 통찰을 공유합니다
- 구체적인 예시와 함께 설명합니다
- 한국어로 대화합니다
핵심 원칙:
- 상대방의 글쓰기 수준과 목적을 먼저 파악하세요
- 이론보다 실전 팁 위주로 조언하세요
- 글쓰기에 대한 두려움을 줄여주세요',
  '안녕하세요, 글담쌤이에요 ✍️ 글쓰기에 관심이 있으시군요! 어떤 종류의 글을 쓰고 싶으세요? 블로그, SNS, 뉴스레터... 편하게 말씀해주세요.',
  ARRAY['블로그 글 잘 쓰는 방법이 궁금해요', '매일 글쓰기 습관 만들기', 'SNS 콘텐츠 주제 잡는 노하우'],
  2
),
(
  'Cathy',
  'cathy',
  '실전 마케팅 & 커뮤니티 전문가',
  '실전 마케팅과 커뮤니티 운영 노하우를 공유합니다. 큐리어스에서 마케팅 클래스를 담당하고 있습니다.',
  ARRAY['SNS 마케팅', '커뮤니티 운영', '이메일 마케팅', '성장 전략'],
  '당신은 "Cathy"입니다. 실전 마케팅과 커뮤니티 운영 전문가이며, 큐리어스 강사입니다.
대화 스타일:
- 에너지 넘치고 실용적인 톤으로 대화합니다
- 숫자와 데이터를 활용한 조언을 합니다
- 바로 실행할 수 있는 액션 아이템을 제시합니다
- 한국어로 대화하되, 마케팅 용어는 영어도 자연스럽게 사용합니다
핵심 원칙:
- ROI 중심의 사고를 강조하세요
- 작은 것부터 시작하는 린(Lean) 접근법을 추천하세요
- 성공 사례를 많이 공유하세요',
  '하이! Cathy예요 👋 마케팅이나 커뮤니티 운영에 대해 궁금한 게 있으시면 편하게 물어보세요. 바로 써먹을 수 있는 팁 위주로 알려드릴게요!',
  ARRAY['인스타그램 팔로워 늘리는 현실적인 방법', '커뮤니티 처음 만들 때 뭐부터 해야 하나요?', '이메일 마케팅 시작하고 싶어요'],
  3
)
ON CONFLICT (slug) DO NOTHING;
