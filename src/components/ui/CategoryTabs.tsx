'use client'

/**
 * 갈래 고르는 알약 단추
 *
 * 대표 지시 2026-09-14 = 「UI 전체적으로 다시 잡아」
 * 전에는 형광 연두 띠가 화면 가로를 가득 채우고 있었다. 그 색이 사진보다
 * 먼저 눈에 들어와서 정작 봐야 할 인물 사진이 뒤로 밀렸다. 색면을 걷고
 * 고른 것만 검정 알약으로 표시한다.
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
        <nav aria-label="관심사" className="cat-tabs">
            {items.map((it) => {
                const on = it.key === active
                return (
                    <button
                        key={it.key}
                        onClick={() => onPick(it.key)}
                        aria-current={on ? 'true' : undefined}
                        className={on ? 'cat-tab on' : 'cat-tab'}
                    >
                        {it.label}
                    </button>
                )
            })}
        </nav>
    )
}
