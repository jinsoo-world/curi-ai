import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// 저장소 업로드·대량 쓰기·월 합계·돈 호출·예약 작업은 5초 기본 마감이 아니라 긴 마감(60초) 연결을 쓴다 (2026-10-06 검토 1번)
// 돈 호출은 5초에 끊겨도 DB 는 커밋될 수 있다 = 「차감됐는데 환불도 없음」. 그래서 긴 마감.
const LONG_ONLY = [
    'src/lib/photo-store.ts',
    'src/app/api/cron/syncs/route.ts',
    'src/app/api/os/knowledge/cloud/route.ts',
    'src/app/api/os/knowledge/cloud/list/route.ts',
    'src/app/api/admin/refresh-views/route.ts',
    'src/app/api/account/delete/route.ts',
    'src/app/api/cron/retention-purge/route.ts',
    'src/app/api/cron/campaigns/route.ts',
    'src/app/api/cron/push-checkin/route.ts',
    'src/app/api/cron/feeds/route.ts',
    'src/app/api/os/feeds/route.ts',
    'src/app/api/os/feeds/sync/route.ts',
    'src/app/api/os/team/[id]/sns/learn/route.ts',
    'src/app/api/os/sns-link/route.ts',
    'src/app/api/admin/os/campaigns/route.ts',
    'src/app/api/admin/os/messages/route.ts',
    'src/app/api/admin/os/overview/route.ts',
    'src/app/api/admin/metrics/route.ts',
    'src/app/api/admin/users/route.ts',
    'src/app/api/admin/users/[userId]/route.ts',
    'src/app/api/admin/users/[userId]/clovers/route.ts',
    'src/app/api/admin/onboarding/csv/route.ts',
    'src/app/admin/acquisition/page.tsx',
    'src/app/admin/onboarding/page.tsx',
    'src/domains/traffic/query.ts',
    'src/app/api/chat/export-ebook/route.ts',
    'src/app/api/photos/claim/route.ts',
    'src/app/api/photos/list/route.ts',
    'src/app/api/os/knowledge/upload-url/route.ts',
    'src/app/api/credits/charge/route.ts',
    'src/app/api/tools/enhance/route.ts',
    'src/app/api/tools/id-photo/route.ts',
    'src/app/api/tools/profile-photo/route.ts',
    'src/app/api/tools/thumbnail/route.ts',
    'src/app/api/trial/verify/route.ts',
    'src/app/api/os/plan/route.ts',
    'src/app/api/billing/revenuecat/webhook/route.ts',
    'src/app/api/billing/entitlement/route.ts',
    'src/domains/credit/actions.ts',
]

describe('긴 마감 연결을 써야 하는 곳', () => {
    for (const f of LONG_ONLY) {
        it(f, () => {
            const src = readFileSync(f, 'utf8')
            expect(src).toContain('createAdminClient({ longRunning: true })')
            expect(src).not.toMatch(/createAdminClient\(\)/)
        })
    }

    it('대화의 돈 호출(클로버 차감·되돌림)과 예산 합계 읽기도 긴 마감', () => {
        const src = readFileSync('src/app/api/chat/route.ts', 'utf8')
        expect(src).toMatch(/createAdminClient\(\{ longRunning: true \}\)\.rpc\('spend_clovers_for_chat'/)
        expect(src).toMatch(/const db = createAdminClient\(\{ longRunning: true \}\)\n\s+const \{ data: left \} = await db\.rpc\('클로버_더하기'/)
        expect(src.match(/checkAiBudget\(createAdminClient\(\{ longRunning: true \}\)/g)?.length).toBe(2)
    })
})
