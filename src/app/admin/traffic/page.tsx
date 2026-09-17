/**
 * 들어온 길 (서버) — 첫 화면에 숫자를 담아 보낸다
 *
 * 대표 지적 2026-09-17 「그 화면 10초 걸리는거 고쳐줘」
 * 전에는 화면이 다 뜬 뒤 브라우저가 창구를 부르기 시작해 「세는 중」이 오래 남았다.
 */
import { requireAdmin } from '@/lib/admin-guard'
import { 유입세기 } from '@/domains/traffic/query'
import TrafficView from './TrafficView'

export const dynamic = 'force-dynamic'

export default async function TrafficPage() {
    await requireAdmin()
    const 첫자료 = await 유입세기(7)
    return <TrafficView 첫자료={첫자료} />
}
