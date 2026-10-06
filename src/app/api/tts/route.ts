import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'
import { logLlmUsage } from '@/domains/llm/usage-log'
import { answerToChunks, echoesUserText, isSentenceInText, MIN_SPEAK_CHARS, normalizeForMatch, TTS_CHUNK_MAX } from '@/domains/tts/chunks'
import { verifyGrant } from '@/domains/tts/grant'
import { chargeDailyChars } from '@/domains/tts/quota'

const ADMIN_EMAIL = 'jin@mission-driven.kr'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const maxDuration = 60

const DEFAULT_VOICE = 'pFZP5JQG7iQjIQuC4Bku'  // ElevenLabs 기본 여성 한국어 음성 (Lily)

/** 옛 방식(text 직접 전달) 요청을 받아주는 마감일. 이 날이 지나면 message 식별자만 받는다. */
const LEGACY_TEXT_UNTIL = Date.parse('2026-11-15T00:00:00+09:00')

/** 공개 목록 미리 듣기 고정 문구 (봇 이름별) */
const PREVIEW_LINES: Record<string, string> = {
    '열정진': '안녕하세요! 열정진입니다. 오늘도 콘텐츠로 세상을 바꿔봅시다!',
    '글담쌤': '반가워요, 글담쌤이에요. 오늘은 어떤 글을 써볼까요?',
    'Cathy': 'Hi there! I\'m Cathy. Ready to level up your marketing game?',
    '봉이 김선달': '허허, 이 김선달이가 돈 버는 비법을 알려주지!',
    '신사임당': '반갑습니다. 지혜로운 삶과 예술에 대해 이야기 나눠볼까요?',
}
const DEFAULT_PREVIEW_LINE = '안녕하세요, 큐리 AI 봇입니다. 무엇이든 물어보세요!'
const OWNER_PREVIEW_MAX = 200
/** 위기 상담 안내(통화에서도 읽는 고정 문구, 채팅 화면의 CRISIS_RESPONSE 를 소리용으로 줄인 것) */
const CRISIS_SPOKEN = '지금 많이 힘드신 것 같아서 걱정돼요. 혼자 감당하지 않으셔도 돼요. 자살예방상담전화 1393, 정신건강위기상담전화 1577-0199로 지금 바로 연락해 보세요. 24시간 도움을 받으실 수 있어요.'
type Db = ReturnType<typeof createAdminClient>

type Mentor = { id: string; name: string | null; voice_id: string | null; is_active: boolean | null; creator_id: string | null }
type Reading = { text: string; voiceId: string | null; mentorId: string | null }
type Fail = { error: string; status: number }
const fail = (error: string, status: number): Fail => ({ error, status })

async function loadMentor(db: Db, mentorId: unknown): Promise<Mentor | null> {
    if (typeof mentorId !== 'string' || !mentorId) return null
    const { data } = await db.from('mentors').select('id, name, voice_id, is_active, creator_id').eq('id', mentorId).maybeSingle()
    return (data as Mentor | null) ?? null
}

/** 이 봇이 내 봇인가(주인 = 크리에이터 프로필 · 봇 팀 · 어드민) */
async function isMyMentor(db: Db, user: { id: string; email?: string | null }, mentor: Mentor): Promise<boolean> {
    if (user.email === ADMIN_EMAIL) return true
    const { data: mine } = await db.from('creator_profiles').select('id').eq('user_id', user.id)
    if (mentor.creator_id && ((mine ?? []) as { id: string }[]).some(c => c.id === mentor.creator_id)) return true
    const { data: team } = await db.from('team_bots').select('id').eq('user_id', user.id).eq('mentor_id', mentor.id).maybeSingle()
    return !!team
}

/** 공개 봇이거나 내 봇이면 읽을 수 있다 */
async function canUseMentor(db: Db, user: { id: string; email?: string | null }, mentor: Mentor): Promise<boolean> {
    return !!mentor.is_active || (await isMyMentor(db, user, mentor))
}

/** 이 메시지 바로 앞의 사용자 말 (따라 말하기 검사용) */
async function precedingUserText(db: Db, sessionId: string, before: string | null): Promise<string | null> {
    let q = db.from('messages').select('content').eq('session_id', sessionId).eq('role', 'user')
    if (before) q = q.lt('created_at', before)
    const { data } = await q.order('created_at', { ascending: false }).limit(1)
    return ((data ?? []) as { content: string }[])[0]?.content ?? null
}

/** ① 저장된 봇 답(message 식별자)의 몇 번째 조각 */
async function readSavedMessage(db: Db, user: { id: string; email?: string | null }, body: Record<string, unknown>): Promise<(Reading & { part: number; parts: number }) | Fail> {
    const { messageId } = body
    if (typeof messageId !== 'string' || !UUID_RE.test(messageId)) return fail('메시지를 찾을 수 없어요.', 400)
    const part = typeof body.part === 'number' && Number.isInteger(body.part) && body.part >= 0 ? body.part : 0
    const { data: msg } = await db.from('messages').select('id, role, content, session_id, origin, created_at').eq('id', messageId).maybeSingle()
    const m = msg as { id: string; role: string; content: string; session_id: string | null; origin: string | null; created_at: string | null } | null
    // 봇이 서버에서 실제로 만든 답만(origin='server'). 손님이 가져온 글·넘김 글은 읽지 않는다
    if (!m || m.role !== 'assistant' || !m.session_id || m.origin !== 'server') return fail('이 글은 읽을 수 없어요.', 403)
    const { data: sess } = await db.from('chat_sessions').select('user_id, mentor_id').eq('id', m.session_id).maybeSingle()
    const s = sess as { user_id: string | null; mentor_id: string | null } | null
    // 내 대화방의 답만
    if (!s || s.user_id !== user.id) return fail('이 글은 읽을 수 없어요.', 403)
    const chunks = answerToChunks(m.content)
    if (chunks.length === 0 || part >= chunks.length) return fail('읽을 내용이 없어요.', 404)
    // 그 봇의 목소리를 쓸 권한(공개 봇이거나 내 봇) — 남의 비공개 봇은 막는다
    const mentor = await loadMentor(db, s.mentor_id)
    if (mentor && !(await canUseMentor(db, user, mentor))) return fail('이 목소리는 쓸 수 없어요.', 403)
    // 사용자 말을 그대로 따라 한 조각은 읽지 않는다
    if (echoesUserText(chunks[part], await precedingUserText(db, m.session_id, m.created_at))) return fail('이 글은 읽을 수 없어요.', 403)
    return { text: chunks[part], voiceId: mentor?.voice_id ?? null, mentorId: mentor?.id ?? null, part, parts: chunks.length }
}

/** ② 통화 중 실시간 문장 — 서버가 찍어준 도장이 맞는 글 안의 문장만 */
async function readLiveSentence(db: Db, user: { id: string; email?: string | null }, body: Record<string, unknown>): Promise<Reading | Fail> {
    const grant = body.grant as { text?: unknown; ts?: unknown; sig?: unknown; from?: unknown } | undefined
    const sentence = body.sentence
    const mentor = await loadMentor(db, body.mentorId)
    if (!mentor || !grant || typeof sentence !== 'string') return fail('읽을 수 없어요.', 400)
    if (!verifyGrant(user.id, mentor.id, { text: grant.text, ts: grant.ts, sig: grant.sig, from: grant.from })) return fail('읽을 수 없어요.', 403)
    // 도장 찍힌 글 안에서 문장 경계에서 시작하는 구간(8자 이상, 답의 첫 문장만 짧아도 됨)만
    const s = normalizeForMatch(sentence)
    if (s.length > TTS_CHUNK_MAX || !isSentenceInText(s, grant.text as string, grant.from === 0)) return fail('읽을 수 없어요.', 403)
    if (!(await canUseMentor(db, user, mentor))) return fail('이 목소리는 쓸 수 없어요.', 403)
    return { text: s, voiceId: mentor.voice_id, mentorId: mentor.id }
}

/** ③ 통화 첫 인사·조용할 때 말 거는 문구 — 문구는 서버가 만든다 */
async function readGreeting(db: Db, user: { id: string; email?: string | null }, body: Record<string, unknown>): Promise<Reading | Fail> {
    const mentor = await loadMentor(db, body.mentorId)
    if (!mentor || !(await canUseMentor(db, user, mentor))) return fail('이 목소리는 쓸 수 없어요.', 403)
    if (body.greeting === 'crisis') return { text: CRISIS_SPOKEN, voiceId: mentor.voice_id, mentorId: mentor.id }
    if (body.greeting === 'idle') return { text: '아직 계세요? 궁금한 게 있으면 편하게 말씀해 주세요!', voiceId: mentor.voice_id, mentorId: mentor.id }
    const { data: prof } = await db.from('users').select('display_name').eq('id', user.id).maybeSingle()
    // 이름은 한글·영문·숫자만 10자(이름 칸에 글을 심어 읽히는 것을 막는다)
    const name = String((prof as { display_name?: string | null } | null)?.display_name || '').replace(/[^가-힣a-zA-Z0-9]/g, '').slice(0, 10) || '회원'
    return { text: `네, ${name}님! ${mentor.name || '큐리'}입니다, 반갑습니다!`, voiceId: mentor.voice_id, mentorId: mentor.id }
}

/** ④ 미리 듣기 — 공개 봇은 고정 문구, 내 봇은 주인이 쓴 짧은 문장(200자) */
async function readPreview(db: Db, user: { id: string; email?: string | null }, body: Record<string, unknown>): Promise<Reading | Fail> {
    const mentor = await loadMentor(db, body.mentorId)
    if (typeof body.ownerPreview === 'string') {
        if (mentor) {
            if (!(await isMyMentor(db, user, mentor))) return fail('내 봇만 미리 들을 수 있어요.', 403)
            const text = body.ownerPreview.trim().slice(0, OWNER_PREVIEW_MAX)
            if (!text) return fail('문장이 필요해요.', 400)
            return { text, voiceId: mentor.voice_id, mentorId: mentor.id }
        }
        // 봇을 아직 만들기 전(만들기 화면): 크리에이터 본인에게 고정 문구만, 기본 목소리로
        const { data: mine } = await db.from('creator_profiles').select('id').eq('user_id', user.id).limit(1)
        if (((mine ?? []) as unknown[]).length === 0) return fail('내 봇만 미리 들을 수 있어요.', 403)
        return { text: '안녕하세요! 목소리 시험입니다. 만나서 반가워요!', voiceId: null, mentorId: null }
    }
    // 공개 봇 고정 문구
    if (!mentor || !mentor.is_active) return fail('이 목소리는 쓸 수 없어요.', 403)
    return { text: PREVIEW_LINES[mentor.name ?? ''] || DEFAULT_PREVIEW_LINE, voiceId: mentor.voice_id, mentorId: mentor.id }
}

/** ⑤ 옛 방식(text) — 내 대화방 최근 봇 답(origin='server')의 읽을 조각과 정확히 같은 글일 때만, 목소리는 그 답의 봇 것 */
async function readLegacyText(db: Db, user: { id: string; email?: string | null }, body: Record<string, unknown>): Promise<Reading | Fail> {
    if (Date.now() >= LEGACY_TEXT_UNTIL) return fail('앱을 최신 버전으로 업데이트해 주세요.', 410)
    if (typeof body.text !== 'string') return fail('텍스트가 필요합니다.', 400)
    const wanted = normalizeForMatch(body.text.slice(0, TTS_CHUNK_MAX))
    if (wanted.length < MIN_SPEAK_CHARS) return fail('이 글은 읽을 수 없어요.', 403)
    const { data: sessions } = await db.from('chat_sessions').select('id, mentor_id').eq('user_id', user.id)
        .order('last_message_at', { ascending: false, nullsFirst: false }).limit(5)
    const sess = (sessions ?? []) as { id: string; mentor_id: string | null }[]
    if (sess.length === 0) return fail('이 글은 읽을 수 없어요.', 403)
    const { data: msgs } = await db.from('messages').select('content, session_id, created_at').in('session_id', sess.map(x => x.id))
        .eq('role', 'assistant').eq('origin', 'server').order('created_at', { ascending: false }).limit(20)
    for (const m of (msgs ?? []) as { content: string; session_id: string; created_at: string | null }[]) {
        if (!answerToChunks(m.content).some(c => normalizeForMatch(c) === wanted)) continue
        const mentor = await loadMentor(db, sess.find(x => x.id === m.session_id)?.mentor_id)
        if (mentor && !(await canUseMentor(db, user, mentor))) return fail('이 목소리는 쓸 수 없어요.', 403)
        if (echoesUserText(wanted, await precedingUserText(db, m.session_id, m.created_at))) return fail('이 글은 읽을 수 없어요.', 403)
        return { text: wanted, voiceId: mentor?.voice_id ?? null, mentorId: mentor?.id ?? null }
    }
    return fail('이 글은 읽을 수 없어요.', 403)
}

export async function POST(request: NextRequest) {
    try {
        // 인증 확인
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }
        // 요청 횟수 제한(보안 C-1 9번): 분당 10
        const db = createAdminClient()
        const rl = await checkRateLimit(db, rateLimitKey('tts', user.id), 10, 60)
        if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('음성 읽기') }, { status: 429 })

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
        if (!body || typeof body !== 'object') {
            return NextResponse.json({ error: '요청이 올바르지 않습니다.' }, { status: 400 })
        }

        // 🔒 아무 글이나 소리로 읽어 주지 않는다 = 봇이 실제로 한 답(또는 서버가 정한 고정 문구)만.
        //    목소리 번호는 클라이언트가 보낸 값을 쓰지 않고 그 봇의 것을 서버가 정한다.
        let reading: Reading | Fail
        let part: number | undefined
        let parts: number | undefined
        if (body.messageId !== undefined) {
            const r = await readSavedMessage(db, user, body)
            reading = r
            if (!('error' in r)) { part = r.part; parts = r.parts }
        } else if (body.grant !== undefined) {
            reading = await readLiveSentence(db, user, body)
        } else if (body.greeting === true || body.greeting === 'idle' || body.greeting === 'crisis') {
            reading = await readGreeting(db, user, body)
        } else if (body.preview === true || body.ownerPreview !== undefined) {
            reading = await readPreview(db, user, body)
        } else {
            reading = await readLegacyText(db, user, body)
        }
        if ('error' in reading) {
            return NextResponse.json({ error: reading.error }, { status: reading.status })
        }

        const trimmedText = reading.text.slice(0, TTS_CHUNK_MAX)

        // 사용자별 하루 읽기 글자 수 상한
        if (!(await chargeDailyChars(db, user.id, trimmedText.length)).allowed) {
            return NextResponse.json({ error: '오늘 음성으로 들을 수 있는 분량을 다 썼어요. 내일 다시 이용해 주세요.' }, { status: 429 })
        }

        const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY
        if (!ELEVENLABS_KEY) {
            return NextResponse.json({ error: 'ElevenLabs API 키가 설정되지 않았습니다.' }, { status: 500 })
        }

        // voice_id: 그 봇의 목소리 또는 기본 다국어 음성
        const voiceId = reading.voiceId || DEFAULT_VOICE
        const isClonedVoice = !!reading.voiceId  // 클론 음성 여부

        console.log('[TTS] ElevenLabs 요청:', { voiceId, isClonedVoice, textLen: trimmedText.length })

        // 클론 음성: 고품질 모델 + 높은 유사도 / 기본 음성: 빠른 모델
        const modelId = isClonedVoice ? 'eleven_multilingual_v2' : 'eleven_turbo_v2_5'
        const voiceSettings = isClonedVoice
            ? { stability: 0.75, similarity_boost: 0.85, style: 0.25, use_speaker_boost: true }
            : { stability: 0.75, similarity_boost: 0.85, style: 0.25, use_speaker_boost: true }

        // ElevenLabs TTS Streaming API
        const 시작 = Date.now()
        // 비용 기록: 글자 수를 남긴다 (일레븐랩스는 글자 수로 청구. 원화는 요금제마다 달라 비운다)
        const logTts = (ok: boolean, error?: string) => logLlmUsage({
            route: '/api/tts', kind: 'tts', provider: 'elevenlabs', model: modelId, userId: user.id,
            latencyMs: Date.now() - 시작, ok, error: error ?? null,
            meta: { chars: trimmedText.length, clonedVoice: isClonedVoice },
        })
        const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
            method: 'POST',
            headers: {
                'xi-api-key': ELEVENLABS_KEY,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg',
            },
            body: JSON.stringify({
                text: trimmedText,
                model_id: modelId,
                language_code: 'ko',
                voice_settings: voiceSettings,
            }),
        })

        if (!ttsRes.ok) {
            const errBody = await ttsRes.text()
            console.error('[TTS] ElevenLabs 실패:', ttsRes.status, errBody)
            logTts(false, `${ttsRes.status} ${errBody.slice(0, 200)}`)

            if (ttsRes.status === 429) {
                return NextResponse.json({ error: '요청이 너무 많습니다.' }, { status: 429 })
            }
            if (ttsRes.status === 401) {
                return NextResponse.json({ error: 'API 인증 오류입니다.' }, { status: 500 })
            }
            return NextResponse.json({ error: '음성 생성에 실패했습니다.' }, { status: 500 })
        }

        // 오디오 스트림을 ArrayBuffer로 변환 → Base64 data URL 반환
        const audioBuffer = await ttsRes.arrayBuffer()
        logTts(true)
        const base64 = Buffer.from(audioBuffer).toString('base64')
        const audioUrl = `data:audio/mpeg;base64,${base64}`

        console.log('[TTS] ✅ ElevenLabs 성공:', { voiceId, audioSize: audioBuffer.byteLength })

        return NextResponse.json({ audioUrl, ...(part !== undefined ? { part, parts } : {}) })

    } catch (error: any) {
        console.error('[TTS API Error]', error)
        return NextResponse.json(
            { error: '음성 생성 중 오류가 발생했습니다.' },
            { status: 500 }
        )
    }
}
