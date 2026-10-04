'use client'
// 월 자료 넣기: 퍼센트 한 줄과 한도 카드. 쪽 수, 클로버 개수는 보이지 않습니다 (대표 지시 0929).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useIosApp } from '@/hooks/useIosApp'

export interface DocSpaceBlock {
    code: 'doc_space_full' | 'no_clovers' | 'file_too_long' | 'cap'
    message: string
    canPayClovers: boolean
}

/** 창구 응답이 한도 카드로 보여야 하는 경우만 꺼냅니다 */
export function readDocSpaceBlock(status: number, body: unknown): DocSpaceBlock | null {
    const b = (body ?? {}) as { code?: unknown; error?: unknown; canPayClovers?: unknown }
    if (status !== 402 || (b.code !== 'doc_space_full' && b.code !== 'no_clovers')) return null
    return { code: b.code, message: String(b.error ?? ''), canPayClovers: b.canPayClovers === true }
}

/** 파일 칸 위 퍼센트 한 줄. 기능이 꺼져 있으면 아무것도 안 보입니다 */
export function DocSpaceLine({ refreshKey = 0 }: { refreshKey?: number }) {
    const [pct, setPct] = useState<number | null>(null)
    useEffect(() => {
        let alive = true
        fetch('/api/os/knowledge/doc-space').then(r => r.ok ? r.json() : null).then(d => {
            if (alive && d?.enabled && typeof d.percent === 'number') setPct(d.percent)
        }).catch(() => {})
        return () => { alive = false }
    }, [refreshKey])
    if (pct === null) return null
    return (
        <div style={{ marginTop: 10 }} aria-label={`이번 달 자료 넣기 ${pct}%`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--os-글-흐림)' }}>
                <span>이번 달 자료 넣기 {pct}%</span>
                {pct >= 80 && pct < 100 && <span>곧 다 차요</span>}
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--os-선)', marginTop: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? 'var(--os-경고, #e5484d)' : 'var(--os-클로버)' }} />
            </div>
        </div>
    )
}

/** 한도 카드: 무료는 요금제 보기만, 유료는 클로버(화면 이름 「모아 둔 대화」)로 이어 넣기도. 클로버 판매 끝(대표 결정 1002)이라 채우기 단추는 요금제로 */
export function DocSpaceCard({ block, busy, onPayClovers }: { block: DocSpaceBlock; busy?: boolean; onPayClovers: () => void }) {
    const [ask, setAsk] = useState(false)
    const iosApp = useIosApp()   // 아이폰 앱 안에서는 요금제 올리기 링크를 숨긴다(앱스토어 3.1.1)
    return (
        <div className="os-notice" style={{ margin: '14px 0 0', display: 'grid', gap: 10 }} role="alert">
            <div>{ask ? '이 파일을 넣는 데 모아 둔 대화가 쓰여요. 넣은 뒤 남은 대화는 요금제 화면에서 보실 수 있어요.' : block.message}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {block.code === 'doc_space_full' && block.canPayClovers && !ask && (
                    <button type="button" className="os-btn primary" disabled={busy} onClick={() => setAsk(true)}>모아 둔 대화로 이어 넣기</button>
                )}
                {ask && (
                    <>
                        <button type="button" className="os-btn primary" disabled={busy} onClick={onPayClovers}>넣기</button>
                        <button type="button" className="os-btn" disabled={busy} onClick={() => setAsk(false)}>취소</button>
                    </>
                )}
                {!ask && iosApp === false && (
                    <Link className="os-btn" href="/os/charge">
                        {block.code === 'no_clovers' || block.canPayClovers ? '요금제 올리기' : '유료로 바꾸기'}
                    </Link>
                )}
            </div>
        </div>
    )
}
