// domains/push — 앱 알림 관문 하나. 아이폰·안드로이드 알림은 전부 sendPush 를 지난다.
//
// 순서 (하나라도 걸리면 애플·구글을 부르지 않는다):
//  0. 열쇠           — 아이폰·안드로이드 둘 다 열쇠가 없으면 { skipped: 'not_configured' } (DB 도 안 건드린다)
//  1. 광고 규칙       — 제목 「(광고)」 · 21:00~08:00 금지 · 광고 동의(users.marketing_consent). 관리자 시험도 못 건너뛴다
//  2. 기기           — 꺼지지 않은 기기 중 열쇠가 있는 쪽만. 없으면 끝(기록 안 함, 앱 없는 사람이 대부분이라)
//  3. 겹침           — 같은 type + key 로 이미 「보냄」이 있으면 안 보낸다(실패·막힘은 안 셈 = 다음에 다시 간다)
//  4. 사용자 설정     — 알림 설정에서 푸시를 껐으면 안 보낸다 / 정보 알림도 조용한 시간엔 보류
//  5. 상한           — 하루 3번(서울 자정 기준, 시험 발송 제외), 광고 하루 1번·주 3번
//  6. 보내기         — 기기마다 push_sends 한 줄. 애플·구글이 「죽은 번호」라 하면 그 기기를 끈다(disabled_at)
// 막힌 시도도 push_sends 에 한 줄(status=blocked, error=이유) 남긴다(기기 없음만 빼고). 나중에 「왜 안 갔나」를 셀 수 있게.

import { randomUUID } from 'node:crypto'
import { isQuietHours } from '@/domains/messaging/quiet-hours'
import {
    AD_DAILY_MAX, AD_WEEKLY_MAX, DAILY_MAX, hasAdPrefix, isAdQuietHour, kstDayStart, weekWindowStart, withAdFooter,
} from './rules'
import { DEEPLINK_HOME } from './deeplink'
import type { BlockReason, PushDeps, PushInput, PushOutcome, PushSendRow } from './types'

export async function sendPush(input: PushInput, deps: PushDeps): Promise<PushOutcome> {
    const { store, transports } = deps
    const now = (deps.now ?? (() => new Date()))()
    const newId = deps.newId ?? randomUUID

    // 0. 열쇠
    if (!transports.ios.ready() && !transports.android.ready()) return { skipped: 'not_configured' }

    const isAd = input.category === 'ad'
    const body = isAd ? withAdFooter(input.body) : input.body.trim()
    const title = input.title.trim()
    const batchId = newId()
    const base = {
        userId: input.userId, batchId, pushType: input.type, category: input.category,
        title, body, deeplink: input.deeplink || DEEPLINK_HOME, dedupeKey: input.dedupe?.key ?? null,
    }
    const block = async (reason: BlockReason): Promise<PushOutcome> => {
        await safeInsert(deps, [{ ...base, id: newId(), deviceId: null, status: 'blocked', error: reason }])
        return { status: 'blocked', reason }
    }

    // 1. 광고 규칙 (관리자 시험도 못 건너뛴다)
    if (isAd) {
        if (!hasAdPrefix(title)) return block('ad_title_prefix')
        if (isAdQuietHour(now)) return block('ad_quiet_hours')
        if (!(await store.hasMarketingConsent(input.userId))) return block('ad_no_consent')
    }

    // 2. 기기 (앱이 없는 사람은 여기서 끝. 매번 생기는 일이라 기록하지 않는다)
    const devices = (await store.listDevices(input.userId)).filter(d => transports[d.platform]?.ready())
    if (devices.length === 0) return { status: 'blocked', reason: 'no_device' }

    // 3. 겹침
    if (input.dedupe) {
        const since = input.dedupe.withinMinutes ? new Date(now.getTime() - input.dedupe.withinMinutes * 60_000) : null
        if (await store.hasSent(input.userId, input.type, input.dedupe.key, since)) return block('duplicate')
    }

    // 4. 사용자 설정 (푸시를 껐으면 관리자 시험도 안 간다)
    const prefs = await store.getPrefs(input.userId)
    if (!prefs.push) return block('push_off')
    if (!input.ignoreLimits && !isAd && isQuietHours(now, prefs.quietFrom, prefs.quietTo)) return block('quiet_hours')

    // 5. 상한 (관리자 시험은 하루 3번을 건너뛰고, 시험 발송은 상한 셈에도 안 들어간다. 광고 상한은 늘 건다)
    const today = kstDayStart(now)
    if (!input.ignoreLimits && await store.countSentBatches(input.userId, today) >= DAILY_MAX) return block('daily_cap')
    if (isAd) {
        if (await store.countSentBatches(input.userId, today, 'ad') >= AD_DAILY_MAX) return block('ad_daily_cap')
        if (await store.countSentBatches(input.userId, weekWindowStart(now), 'ad') >= AD_WEEKLY_MAX) return block('ad_weekly_cap')
    }

    // 6. 보내기
    const rows: PushSendRow[] = []
    let delivered = 0, failed = 0, disabled = 0
    for (const d of devices) {
        const id = newId()
        let r: Awaited<ReturnType<typeof transports.ios.send>>
        try {
            r = await transports[d.platform].send(d, { title, body, deeplink: base.deeplink, type: input.type, sendId: id })
        } catch (e) {
            r = { ok: false, error: e instanceof Error ? e.message : String(e), disable: false }
        }
        if (r.ok) {
            delivered++
            rows.push({ ...base, id, deviceId: d.id, status: 'sent', error: null })
        } else {
            failed++
            rows.push({ ...base, id, deviceId: d.id, status: 'failed', error: r.error.slice(0, 300) })
            if (r.disable) {
                disabled++
                await store.disableDevice(d.id, r.error).catch(e => console.warn('[push] 기기 끄기 실패', e instanceof Error ? e.message : e))
            }
        }
    }
    await safeInsert(deps, rows)
    return {
        status: delivered > 0 ? 'sent' : 'failed',
        batchId, delivered, failed, disabled,
        sendIds: rows.filter(r => r.status === 'sent').map(r => r.id),
    }
}

/** 기록 실패가 발송 결과를 뒤집지 않는다 (표가 아직 없을 때 등) */
async function safeInsert(deps: PushDeps, rows: PushSendRow[]) {
    if (rows.length === 0) return
    try { await deps.store.insertSends(rows) } catch (e) {
        console.warn('[push] 발송 기록 실패(표 없음?)', e instanceof Error ? e.message : e)
    }
}
