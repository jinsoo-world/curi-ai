import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'
import { logLlmUsage } from '@/domains/llm/usage-log'
import { answerToChunks, normalizeForMatch, stripMarkdown, TTS_CHUNK_MAX } from '@/domains/tts/chunks'
import { verifyGrant } from '@/domains/tts/grant'

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

type Mentor = { id: string; name: string | null; voice_id: string | null; is_active: boolean | null; creator_id: string | null }
type Reading = { text: string; voiceId: string | null; mentorId: string | null }
type Fail = { error: string; status: number }
const fail = (error: string, status: number): Fail => ({ error, status })

async function loadMentor(db: ReturnType<typeof createAdminClient>, mentorId: unknown): Promise<Mentor | null> {
    if (typeof mentorId !== 'string' || !mentorId) return null
    const { data } = await db.from('mentors').select('id, name, voice_id, is_active, creator_id').eq('id', mentorId).maybeSingle()
    return (data as Mentor | null) ?? null
}

/** 이 봇이 내 봇인가(주인 = 크리에이터 프로필 · 봇 팀 · 어드민) */
async function isMyMentor(db: ReturnType<typeof createAdminClient>, user: { id: string; email?: string | null }, mentor: Mentor): Promise<boolean> {
    if (user.email === ADMIN_EMAIL) return true
    const { data: mine } = await db.from('creator_profiles').select('id').eq('user_id', user.id)
    if (mentor.creator_id && ((mine ?? []) as { id: string }[]).some(c => c.id === mentor.creator_id)) return true
    const { data: team } = await db.from('team_bots').select('id').eq('user_id', user.id).eq('mentor_id', mentor.id).maybeSingle()
    return !!team
}

/** 공개 봇이거나 내 봇이면 읽을 수 있다 */
async function canUseMentor(db: ReturnType<typeof createAdminClient>, user: { id: string; email?: string | null }, mentor: Mentor): Promise<boolean> {
    return !!mentor.is_active || (await isMyMentor(db, user, mentor))
}

/** ① 저장된 봇 답(message 식별자)의 몇 번째 조각 */
async function readSavedMessage(db: ReturnType<typeof createAdminClient>, userId: string, body: Record<string, unknown>): Promise<(Reading & { part: number; parts: number }) | Fail> {
    const { messageId } = body
    if (typeof messageId !== 'string' || !UUID_RE.test(messageId)) return fail('메시지를 찾을 수 없어요.', 400)
    const part = typeof body.part === 'number' && Number.isInteger(body.part) && body.part >= 0 ? body.part : 0
    const { data: msg } = await db.from('messages').select('id, role, content, session_id').eq('id', messageId).maybeSingle()
    const m = msg as { id: string; role: string; content: string; session_id: string | null } | null
    // 봇의 답만. 사용자 말·시스템 글은 읽지 않는다
    if (!m || m.role !== 'assistant' || !m.session_id) return fail('이 글은 읽을 수 없어요.', 403)
    const { data: sess } = await db.from('chat_sessions').select('user_id, mentor_id').eq('id', m.session_id).maybeSingle()
    const s = sess as { user_id: string | null; mentor_id: string | null } | null
    // 내 대화방의 답만
    if (!s || s.user_id !== userId) return fail('이 글은 읽을 수 없어요.', 403)
    const chunks = answerToChunks(m.content)
    if (chunks.length === 0 || part >= chunks.length) return fail('읽을 내용이 없어요.', 404)
    const mentor = await loadMentor(db, s.mentor_id)
    return { text: chunks[part], voiceId: mentor?.voice_id ?? null, mentorId: mentor?.id ?? null, part, parts: chunks.length }
}

/** ② 통화 중 실시간 문장 — 서버가 찍어준 도장이 맞는 글 안의 문장만 */
async function readLiveSentence(db: ReturnType<typeof createAdminClient>, user: { id: string; email?: string | null }, body: Record<string, unknown>): Promise<Reading | Fail> {
    const grant = body.grant as { text?: unknown; ts?: unknown; sig?: unknown } | undefined
    const sentence = body.sentence
    const mentor = await loadMentor(db, body.mentorId)
    if (!mentor || !grant || typeof sentence !== 'string') return fail('읽을 수 없어요.', 400)
    if (!verifyGrant(user.id, mentor.id, { text: grant.text, ts: grant.ts, sig: grant.sig })) return fail('읽을 수 없어요.', 403)
    const s = normalizeForMatch(sentence)
    if (s.length < 1 || s.length > TTS_CHUNK_MAX || !normalizeForMatch(grant.text as string).includes(s)) return fail('읽을 수 없어요.', 403)
    if (!(await canUseMentor(db, user, mentor))) return fail('이 목소리는 쓸 수 없어요.', 403)
    return { text: s, voiceId: mentor.voice_id, mentorId: mentor.id }
}

/** ③ 통화 첫 인사·조용할 때 말 거는 문구 — 문구는 서버가 만든다 */
async function readGreeting(db: ReturnType<typeof createAdminClient>, user: { id: string; email?: string | null }, body: Record<string, unknown>): Promise<Reading | Fail> {
    const mentor = await loadMentor(db, body.mentorId)
    if (!mentor || !(await canUseMentor(db, user, mentor))) return fail('이 목소리는 쓸 수 없어요.', 403)
    if (body.greeting === 'idle') return { text: '아직 계세요? 궁금한 게 있으면 편하게 말씀해 주세요!', voiceId: mentor.voice_id, mentorId: mentor.id }
    const { data: prof } = await db.from('users').select('display_name').eq('id', user.id).maybeSingle()
    const name = String((prof as { display_name?: string | null } | null)?.display_name || '').trim().slice(0, 20) || '회원'
    return { text: `네, ${name}님! ${mentor.name || '큐리'}입니다, 반갑습니다!`, voiceId: mentor.voice_id, mentorId: mentor.id }
}

/** ④ 미리 듣기 — 공개 봇은 고정 문구, 내 봇은 주인이 쓴 짧은 문장(200자) */
async function readPreview(db: ReturnType<typeof createAdminClient>, user: { id: string; email?: string | null }, body: Record<string, unknown>): Promise<Reading | Fail> {
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

/** ⑤ 옛 방식(text) — 내 대화방 최근 봇 답에 들어 있는 글일 때만, 목소리는 그 답의 봇 것 */
async function readLegacyText(db: ReturnType<typeof createAdminClient>, userId: string, body: Record<string, unknown>): Promise<Reading | Fail> {
    if (Date.now() >= LEGACY_TEXT_UNTIL) return fail('앱을 최신 버전으로 업데이트해 주세요.', 410)
    if (typeof body.text !== 'string') return fail('텍스트가 필요합니다.', 400)
    const wanted = normalizeForMatch(body.text.slice(0, TTS_CHUNK_MAX))
    if (!wanted) return fail('텍스트가 필요합니다.', 400)
    const { data: sessions } = await db.from('chat_sessions').select('id, mentor_id').eq('user_id', userId)
        .order('last_message_at', { ascending: false, nullsFirst: false }).limit(5)
    const sess = (sessions ?? []) as { id: string; mentor_id: string | null }[]
    if (sess.length === 0) return fail('이 글은 읽을 수 없어요.', 403)
    const { data: msgs } = await db.from('messages').select('content, session_id').in('session_id', sess.map(x => x.id))
        .eq('role', 'assistant').order('created_at', { ascending: false }).limit(20)
    for (const m of (msgs ?? []) as { content: string; session_id: string }[]) {
        if (normalizeForMatch(stripMarkdown(m.content)).includes(wanted)) {
            const mentor = await loadMentor(db, sess.find(x => x.id === m.session_id)?.mentor_id)
            return { text: wanted, voiceId: mentor?.voice_id ?? null, mentorId: mentor?.id ?? null }
        }
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
            const r = await readSavedMessage(db, user.id, body)
            reading = r
            if (!('error' in r)) { part = r.part; parts = r.parts }
        } else if (body.grant !== undefined) {
            reading = await readLiveSentence(db, user, body)
        } else if (body.greeting === true || body.greeting === 'idle') {
            reading = await readGreeting(db, user, body)
        } else if (body.preview === true || body.ownerPreview !== undefined) {
            reading = await readPreview(db, user, body)
        } else {
            reading = await readLegacyText(db, user.id, body)
        }
        if ('error' in reading) {
            return NextResponse.json({ error: reading.error }, { status: reading.status })
        }

        const trimmedText = reading.text.slice(0, TTS_CHUNK_MAX)

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
