'use client'

/**
 * 가로 스크롤 카테고리 탭 (화면 위에 붙어 따라온다)
 * 고른 탭만 진한 색으로 덮어 지금 어디를 보는지 한눈에 보이게 한다.
 */
export default function CategoryTabs({
    items,
    active,
    onPick,
}: {
    items: { key: string; label: string }[]
    active: string
    onPick: (key: string) => void
}) {
    return (
        <nav
            aria-label="관심사"
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 20,
                background: 'var(--형광)',
                display: 'flex',
                overflowX: 'auto',
                scrollbarWidth: 'none',
                marginTop: 'var(--틈-대)',
            }}
        >
            {items.map((it) => {
                const on = it.key === active
                return (
                    <button
                        key={it.key}
                        onClick={() => onPick(it.key)}
                        aria-current={on ? 'true' : undefined}
                        style={{
                            flex: '0 0 auto',
                            padding: '0 22px',
                            border: 'none',
                            cursor: 'pointer',
                            background: on ? 'var(--진초록)' : 'transparent',
                            color: on ? 'var(--흰)' : 'var(--진초록)',
                            fontSize: 'var(--글자-중)',
                            fontWeight: on ? 900 : 700,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {it.label}
                    </button>
                )
            })}
        </nav>
    )
}
