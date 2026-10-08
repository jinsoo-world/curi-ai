// POST /api/os/deep-create/{id}/save = 「이 봇 만들기」. 구독자만 (저장 시점 요금제로 판정 = 미리보기 뒤 구독하면 바로 저장 가능)
// → { bot(팀 봇), mentorId, referencesSaved } · 무료 402 { paywall: true } · 아직 안 끝남 409 · 이미 저장 200 { mentorId, alreadySaved }
// 봇은 비공개로 만든다(createTeamBot 기본). 지시문 전문·인사·추천 질문을 몸(mentors)에 넣고, 조사 자료 묶음을 봇 자료(파일 학습)로 넣는다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readPlanId } from '@/domains/os/usage-db'
import { createTeamBot } from '@/domains/os/team'
import { addTextSource } from '@/domains/os/knowledge'
import { DeepTableMissing, loadDeepJob, pickLook, referencesText } from '@/domains/os/deep-create'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const { id } = await ctx.params
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: '찾을 수 없어요' }, { status: 404 })

    const db = createAdminClient()
    const plan = await readPlanId(db, user.id)
    if (plan === 'free') return NextResponse.json({ error: '깊게 만든 봇 저장은 구독자만 할 수 있어요', paywall: true }, { status: 402 })

    let job
    try {
        job = await loadDeepJob(db, id, user.id)
    } catch (e) {
        if (e instanceof DeepTableMissing) return NextResponse.json({ error: '곧 열려요' }, { status: 503 })
        return NextResponse.json({ error: '잠시 후 다시 해 주세요' }, { status: 503 })
    }
    if (!job) return NextResponse.json({ error: '찾을 수 없어요' }, { status: 404 })
    if (job.saved_at) return NextResponse.json({ mentorId: job.mentor_id, alreadySaved: true })
    if (job.status !== 'done' || !job.result) return NextResponse.json({ error: '아직 만드는 중이에요' }, { status: 409 })

    // 한 번만 저장 (두 번 눌러도 봇이 둘 생기지 않게)
    const now = new Date().toISOString()
    const { data: claimed } = await db.from('deep_create_jobs').update({ saved_at: now, updated_at: now })
        .eq('id', job.id).eq('user_id', user.id).is('saved_at', null).select('id')
    if (!claimed?.length) return NextResponse.json({ error: '이미 저장하고 있어요' }, { status: 409 })

    const r = job.result
    const look = pickLook(job.idea)
    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || '주인'
    let bot
    try {
        bot = await createTeamBot(db, { id: user.id, displayName, ownerName: user.user_metadata?.full_name || '' }, {
            job: 'custom', customJob: r.oneLiner || r.name, autonomy: 'always_ask', name: r.name, shape: look.shape, color: look.color,
        }, 'deep_create')
        const { error: mErr } = await db.from('mentors').update({
            system_prompt: r.promptText,
            greeting_message: r.greeting,
            ...(r.sampleQuestions.length ? { sample_questions: r.sampleQuestions } : {}),
        }).eq('id', bot.mentorId)
        if (mErr) throw new Error(mErr.message)
    } catch (e) {
        console.error('[os/deep-create save] 봇 만들기 실패:', e instanceof Error ? e.message : e)
        await db.from('deep_create_jobs').update({ saved_at: null }).eq('id', job.id)
        return NextResponse.json({ error: '봇을 만들지 못했어요. 다시 해 주세요' }, { status: 500 })
    }

    let referencesSaved = false
    if (job.research) {
        try {
            await addTextSource(db, bot.mentorId, `${r.subjectName || r.name} 조사 자료`, referencesText(r, job.research))
            referencesSaved = true
        } catch (e) {
            console.warn('[os/deep-create save] 참고자료 저장 실패:', e instanceof Error ? e.message : e)
        }
    }
    await db.from('deep_create_jobs').update({ mentor_id: bot.mentorId }).eq('id', job.id)
    return NextResponse.json({ bot: { ...bot, systemPrompt: r.promptText, greeting: r.greeting }, mentorId: bot.mentorId, referencesSaved })
}
