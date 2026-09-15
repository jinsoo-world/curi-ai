import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSms, normalizePhone, smsReady } from '@/lib/sms'

export const dynamic = 'force-dynamic'

/** 인증번호는 3분만 산다 */
const 유효분 = 3
/** 같은 번호로 하루에 받을 수 있는 문자 */
const 하루한도 = 5

function 해시(code: string, phone: string) {
    return crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex')
}

export async function POST(req: Request) {
    try {
        // 열쇠부터 본다 — 로그인보다 먼저.
        // 2026-09-15에 「인증번호가 안 온다」를 쫓는 데 시간이 걸린 이유가 이 순서였다.
        // 로그인 검사가 앞에 있으면 열쇠가 빠졌는지를 밖에서 알 길이 없다(열쇠 유무만 드러나고 값은 안 나간다).
        if (!smsReady()) {
            return Response.json({ error: '문자 보내는 준비가 아직 안 됐어요. 잠시 뒤 다시 해주세요.' }, { status: 503 })
        }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return Response.json({ error: '로그인이 필요해요.' }, { status: 401 })
        }

        const { phone: raw } = await req.json()
        const phone = normalizePhone(raw)
        if (!phone) {
            return Response.json({ error: '휴대폰 번호를 다시 확인해주세요.' }, { status: 400 })
        }

        const db = createAdminClient()

        // 이미 그 번호로 체험권을 받았는가
        const { data: 이미 } = await db
            .from('users')
            .select('id')
            .eq('trial_phone', phone)
            .maybeSingle()
        if (이미 && 이미.id !== user.id) {
            return Response.json({ error: '이 번호는 이미 무료 체험권을 받았어요.' }, { status: 409 })
        }

        // 하루 한도
        const 하루전 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { count } = await db
            .from('phone_codes')
            .select('id', { count: 'exact', head: true })
            .eq('phone', phone)
            .gte('sent_at', 하루전)
        if ((count ?? 0) >= 하루한도) {
            return Response.json({ error: '오늘은 더 보낼 수 없어요. 내일 다시 해주세요.' }, { status: 429 })
        }

        const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
        const expires = new Date(Date.now() + 유효분 * 60 * 1000).toISOString()

        const { error: 저장오류 } = await db.from('phone_codes').insert({
            phone,
            code_hash: 해시(code, phone),
            expires_at: expires,
            ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        })
        if (저장오류) {
            console.error('[trial/send-code] 저장 실패', 저장오류)
            return Response.json({ error: '잠시 뒤 다시 해주세요.' }, { status: 500 })
        }

        const 결과 = await sendSms(phone, `[큐리AI] 인증번호 ${code}\n${유효분}분 안에 입력해주세요.`)
        if (!결과.ok) {
            return Response.json({ error: 결과.error }, { status: 502 })
        }

        return Response.json({ ok: true, expiresInSec: 유효분 * 60 })
    } catch (e) {
        console.error('[trial/send-code] 오류', e)
        return Response.json({ error: '잠시 뒤 다시 해주세요.' }, { status: 500 })
    }
}
