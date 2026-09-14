/**
 * 화면을 넘길 때 잠깐 보이는 자리 — 대표 지시 2026-09-15 (전수조사 28번)
 *
 * 이게 없으면 흰 화면이 번쩍인다. 중장년은 그 순간을 「멈췄다」로 읽는다.
 */
export default function Loading() {
    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                minHeight: '60dvh',
                display: 'grid',
                placeItems: 'center',
                background: 'var(--종이, #FAFAF8)',
            }}
        >
            <div style={{ textAlign: 'center' }}>
                <div className="curi-loading-dot" />
                <p style={{ fontSize: 16, color: '#71717a', margin: '14px 0 0' }}>불러오는 중입니다</p>
            </div>
        </div>
    )
}
