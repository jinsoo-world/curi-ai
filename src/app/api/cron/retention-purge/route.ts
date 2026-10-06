// 정리 작업 — 하루 한 번 새벽 5시(UTC 기준 vercel.json).
//  1. 탈퇴한 리더의 정산 정보를 1년이 지나면 지운다 (대표 확정 2026-10-01 「1년」). 보관함 = retained_payout_profiles
//  2. 앱 연결 임시 표 청소
//  3. 하루 지난 요청 횟수 제한 줄(rate_limits) 삭제
//  4. 30분 넘게 「읽는 중」으로 남은 자료를 「못 읽음(시간 초과)」으로 (지우지 않는다. 학습 창구가 300초에 끊긴 것)
// 단계마다 따로 try = 한 단계가 고장 나도 나머지는 돈다. 실패한 단계가 있으면 알림 한 번(단계 이름만).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { purgeExpiredPayouts } from '@/domains/account/delete'
import { purgeAppConnectRows } from '@/domains/connectors'
import { failStuckSources } from '@/domains/knowledge/stuck'
import { sendErrorAlert } from '@/lib/slack'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DAY_MS = 86_400_000

export async function GET(req: NextRequest) {
    const 열쇠 = process.env.CRON_SECRET
    if (!열쇠 || req.headers.get('authorization') !== `Bearer ${열쇠}`) {
        return NextResponse.json({ error: 'no' }, { status: 401 })
    }
    const db = createAdminClient({ longRunning: true })
    const now = new Date()
    const 결과: Record<string, string | number> = {}
    const 실패: string[] = []

    const 단계 = async (이름: string, fn: () => Promise<string | number | void>) => {
        try {
            const v = await fn()
            결과[이름] = v ?? 'ok'
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            console.error(`[cron/retention-purge] ${이름} 실패`, message)
            결과[이름] = `실패: ${message.slice(0, 120)}`
            실패.push(이름)
        }
    }

    await 단계('정산정보_1년', () => purgeExpiredPayouts(db, now))
    await 단계('앱연결_임시표', () => purgeAppConnectRows(db))
    await 단계('요청제한_하루지난줄', async () => {
        const { error, count } = await db.from('rate_limits').delete({ count: 'exact' }).lt('window_start', new Date(now.getTime() - DAY_MS).toISOString())
        if (error) throw new Error(error.message)
        return count ?? 0
    })
    await 단계('읽는중_30분넘음', () => failStuckSources(db, now))

    console.log('[cron/retention-purge]', JSON.stringify(결과))
    if (실패.length > 0) {
        await sendErrorAlert({ source: 'cron/retention-purge', error: `정리 작업 ${실패.length}단계 실패: ${실패.join(', ')}` }, { timeoutMs: 3_000 })
    }
    return NextResponse.json({ success: 실패.length === 0, ...결과 })
}
