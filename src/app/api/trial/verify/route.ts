import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/sms'
import { trialEndsAt, isTrialActive, REFERRER_REWARD, TRIAL_DAYS, TRIAL_CLOVERS } from '@/domains/trial'

export const dynamic = 'force-dynamic'

/** 인증번호를 틀릴 수 있는 횟수 */
const 최대시도 = 5

function 해시(code: string, phone: string) {
    return crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex')
}

export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return Response.json({ error: '로그인이 필요해요.' }, { status: 401 })
        }

        const { phone: raw, code, referralCode } = await req.json()
        const phone = normalizePhone(raw)
        if (!phone || typeof code !== 'string' || !/^[0-9]{6}$/.test(code)) {
            return Response.json({ error: '인증번호 6자리를 입력해주세요.' }, { status: 400 })
        }

        const db = createAdminClient()

        // 이미 체험 중이면 두 번 주지 않는다
        const { data: 나 } = await db
            .from('users')
            .select('trial_ends_at, trial_phone, clovers')
            .eq('id', user.id)
            .maybeSingle()
        if (나?.trial_ends_at && isTrialActive(나.trial_ends_at)) {
            return Response.json({ error: '이미 무료 체험 중이에요.', trialEndsAt: 나.trial_ends_at }, { status: 409 })
        }
        if (나?.trial_phone) {
            return Response.json({ error: '이미 무료 체험권을 받은 적이 있어요.' }, { status: 409 })
        }

        // 그 번호로 이미 받은 사람이 있는가
        const { data: 임자 } = await db
            .from('users')
            .select('id')
            .eq('trial_phone', phone)
            .maybeSingle()
        if (임자 && 임자.id !== user.id) {
            return Response.json({ error: '이 번호는 이미 무료 체험권을 받았어요.' }, { status: 409 })
        }

        // 가장 최근에 보낸 인증번호
        const { data: 표 } = await db
            .from('phone_codes')
            .select('id, code_hash, tries, expires_at, used_at')
            .eq('phone', phone)
            .order('sent_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (!표 || 표.used_at) {
            return Response.json({ error: '인증번호를 먼저 받아주세요.' }, { status: 400 })
        }
        if (new Date(표.expires_at).getTime() < Date.now()) {
            return Response.json({ error: '인증번호가 만료됐어요. 다시 받아주세요.' }, { status: 400 })
        }
        if ((표.tries ?? 0) >= 최대시도) {
            return Response.json({ error: '너무 여러 번 틀렸어요. 인증번호를 다시 받아주세요.' }, { status: 429 })
        }
        if (표.code_hash !== 해시(code, phone)) {
            await db.from('phone_codes').update({ tries: (표.tries ?? 0) + 1 }).eq('id', 표.id)
            return Response.json({ error: '인증번호가 맞지 않아요.' }, { status: 400 })
        }

        // 추천인 찾기 — 내 코드로는 못 받는다
        let 추천인: string | null = null
        if (typeof referralCode === 'string' && referralCode.trim()) {
            const { data: r } = await db
                .from('users')
                .select('id')
                .eq('referral_code', referralCode.trim())
                .maybeSingle()
            if (r && r.id !== user.id) 추천인 = r.id
        }

        const 시작 = new Date()
        const 끝 = trialEndsAt(시작)

        // 체험권과 함께 클로버도 준다 — 대표 확정 0915 「무료체험권 넣으면 100클로버 줘」
        const 새잔액 = (나?.clovers ?? 0) + TRIAL_CLOVERS

        const { error: 갱신오류 } = await db
            .from('users')
            .update({
                subscription_tier: 'free_trial',
                trial_started_at: 시작.toISOString(),
                trial_ends_at: 끝.toISOString(),
                trial_phone: phone,
                trial_referrer_id: 추천인,
                clovers: 새잔액,
            })
            .eq('id', user.id)
        if (갱신오류) {
            console.error('[trial/verify] 갱신 실패', 갱신오류)
            return Response.json({ error: '잠시 뒤 다시 해주세요.' }, { status: 500 })
        }

        await db.from('phone_codes').update({ used_at: new Date().toISOString() }).eq('id', 표.id)

        await db.from('credit_transactions').insert({
            user_id: user.id,
            amount: TRIAL_CLOVERS,
            balance_after: 새잔액,
            type: 'bonus',
            description: '무료 체험권 받기',
        })

        // 추천한 사람에게 클로버 — 실패해도 체험권은 이미 줬으니 되돌리지 않는다
        if (추천인) {
            const { data: 상대 } = await db.from('users').select('clovers').eq('id', 추천인).maybeSingle()
            if (상대) {
                await db
                    .from('users')
                    .update({ clovers: (상대.clovers ?? 0) + REFERRER_REWARD })
                    .eq('id', 추천인)
            }
        }

        return Response.json({
            ok: true,
            trialEndsAt: 끝.toISOString(),
            days: TRIAL_DAYS,
            clovers: TRIAL_CLOVERS,
            balance: 새잔액,
            referrerRewarded: !!추천인,
        })
    } catch (e) {
        console.error('[trial/verify] 오류', e)
        return Response.json({ error: '잠시 뒤 다시 해주세요.' }, { status: 500 })
    }
}
