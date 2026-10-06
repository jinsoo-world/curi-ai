// POST /api/os/bot-face = 봇 얼굴(AI 사진) 한 장. 저장은 안 한다(앱이 기존 사진 올리기 흐름으로 저장). 대표 지시 1006.
// body { prompt(≤300자), style?: 'cute'|'illustration'|'photo'|'icon', mentorId? } → { imageBase64 }
// 앱은 Bearer 로 들어온다(createClient). 손님 401. mentorId 가 오면 내 봇만(남의 봇 403).
// 한도: 사람별 시간당 10번(셀 수 없으면 막음) → 무료는 이번 달 AI 예산 70% 넘으면 멈춤 → 사람별 하루(무료 3·베이직 10·프로 30) → 회사 전체 하루(IMAGE_GLOBAL_DAILY).
import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { IMAGE_MODEL_FAST } from '@/domains/studio/image-models'
import { checkImageCap, logImageGeneration } from '@/domains/studio/image-usage'
import { assertBotOwned, BotNotMine } from '@/domains/os/knowledge'
import {
    BOT_FACE_DAILY, BOT_FACE_MAX_BASE64, BOT_FACE_PER_HOUR, BOT_FACE_ROUTE, BOT_FACE_TIMEOUT_MS,
    buildBotFacePrompt, cleanBotFaceInput, countMyFacesToday, freeStopByBudget, readMonthSpentKrw, readPlanId,
} from '@/domains/os/bot-face'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const clean = cleanBotFaceInput(await req.json().catch(() => ({})))
    if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 })
    const { prompt, style, mentorId } = clean.input

    const db = createAdminClient()
    if (mentorId) {
        try {
            await assertBotOwned(db, user.id, mentorId)
        } catch (e) {
            if (e instanceof BotNotMine) return NextResponse.json({ error: '내가 만든 봇만 얼굴을 바꿀 수 있어요' }, { status: 403 })
            console.error('[os/bot-face] 주인 확인 실패:', e instanceof Error ? e.message : e)
            return NextResponse.json({ error: '잠시 후 다시 해 주세요' }, { status: 503 })
        }
    }

    const hour = await checkRateLimit(db, `bot-face:h:${user.id}`, BOT_FACE_PER_HOUR, 3600, { failClosed: true })
    if (!hour.allowed) return NextResponse.json({ error: '조금 천천히 해 주세요. 1시간 뒤 다시 할 수 있어요' }, { status: 429 })

    const plan = await readPlanId(db, user.id)
    if (plan === 'free' && freeStopByBudget(await readMonthSpentKrw(db))) {
        return NextResponse.json({ error: '지금은 무료 사진 만들기를 잠시 쉬고 있어요. 나중에 다시 해 주세요' }, { status: 429 })
    }
    const used = await countMyFacesToday(db, user.id)
    if (used === null) return NextResponse.json({ error: '잠시 후 다시 해 주세요' }, { status: 503 })
    if (used >= BOT_FACE_DAILY[plan]) {
        return NextResponse.json({ error: `오늘 만들 수 있는 사진(${BOT_FACE_DAILY[plan]}장)을 다 썼어요. 내일 다시 해 주세요` }, { status: 429 })
    }
    const cap = await checkImageCap(db, { route: BOT_FACE_ROUTE })
    if (cap) return NextResponse.json({ error: cap }, { status: 429 })

    const started = Date.now()
    const model = IMAGE_MODEL_FAST
    const log = { route: BOT_FACE_ROUTE, model, userId: user.id, meta: { purpose: 'bot-face', kind: 'bot-face', plan, style, mentorId } }
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
        const ctl = new AbortController()
        const timer = setTimeout(() => ctl.abort(), BOT_FACE_TIMEOUT_MS)
        let r
        try {
            r = await ai.models.generateContent({
                model,
                contents: [{ role: 'user', parts: [{ text: buildBotFacePrompt({ prompt, style }) }] }],
                config: { abortSignal: ctl.signal },
            })
        } finally {
            clearTimeout(timer)
        }
        const parts = r.candidates?.[0]?.content?.parts ?? []
        const img = parts.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data) as { inlineData: { data: string } } | undefined
        const latencyMs = Date.now() - started
        if (!img) {
            logImageGeneration({ ...log, images: 0, ok: false, error: 'no image part', usageMetadata: r.usageMetadata, latencyMs })
            return NextResponse.json({ error: '사진이 만들어지지 않았어요. 설명을 바꿔 다시 해 보세요' }, { status: 502 })
        }
        if (img.inlineData.data.length > BOT_FACE_MAX_BASE64) {
            logImageGeneration({ ...log, images: 0, ok: false, error: 'too large', usageMetadata: r.usageMetadata, latencyMs })
            return NextResponse.json({ error: '사진이 너무 커요. 다시 해 보세요' }, { status: 502 })
        }
        logImageGeneration({ ...log, images: 1, ok: true, usageMetadata: r.usageMetadata, latencyMs })
        return NextResponse.json({ imageBase64: img.inlineData.data })
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'error'
        console.error('[os/bot-face]', msg)
        logImageGeneration({ ...log, images: 0, ok: false, error: msg, latencyMs: Date.now() - started })
        return NextResponse.json({ error: '사진을 만들지 못했어요. 잠시 후 다시 해 주세요' }, { status: 502 })
    }
}
