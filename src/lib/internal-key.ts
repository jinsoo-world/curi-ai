// 서버가 자기 자신의 창구를 부를 때 쓰는 내부 열쇠 (머리글 x-internal-key = CRON_SECRET).
// 브라우저 로그인 쿠키가 없는 예약 작업이 학습 창구(/api/creator/knowledge/process)를 부르다 401 나던 병의 수리(2026-10-06).
// 비교는 시간 차로 열쇠를 알아내지 못하게 타이밍 안전 비교. 열쇠가 설정돼 있지 않으면 항상 거절.
import { createHash, timingSafeEqual } from 'node:crypto'

export const INTERNAL_KEY_HEADER = 'x-internal-key'

export function internalKeyMatches(given: string | null | undefined, secret = process.env.CRON_SECRET): boolean {
    if (!secret || !given) return false
    // 길이가 달라도 같은 시간이 걸리게 지문(sha256)끼리 비교한다
    const a = createHash('sha256').update(given).digest()
    const b = createHash('sha256').update(secret).digest()
    return timingSafeEqual(a, b)
}

export function isInternalRequest(req: { headers: { get(name: string): string | null } }, secret = process.env.CRON_SECRET): boolean {
    return internalKeyMatches(req.headers.get(INTERNAL_KEY_HEADER), secret)
}
