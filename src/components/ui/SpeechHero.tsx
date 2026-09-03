/**
 * 말풍선 히로 — 이 개편의 시그니처
 *
 * 큐리AI의 세계에서 가장 특징적인 물건은 말풍선이다.
 * 히로를 거대한 말풍선 색면으로 만들고 꼬리가 아래를 가리키게 해서
 * '여기서 골라 말을 걸어라'를 글이 아니라 형태로 말한다.
 * 사진을 쓰지 않는다 — 중장년 휴대폰에서 가볍게 떠야 한다.
 */
export default function SpeechHero({
    eyebrow,
    title,
    tail = true,
}: {
    eyebrow?: string
    title: string
    tail?: boolean
}) {
    return (
        <section
            style={{
                padding: 'var(--틈) var(--틈) 0',
                background: 'var(--종이)',
            }}
        >
            <div
                style={{
                    position: 'relative',
                    background: 'var(--진초록)',
                    borderRadius: 'var(--둥근-대)',
                    padding: 'var(--틈-대) var(--틈-대) calc(var(--틈-대) + 4px)',
                    maxWidth: 900,
                    margin: '0 auto',
                }}
            >
                {eyebrow && (
                    <span
                        style={{
                            display: 'inline-block',
                            background: 'var(--형광)',
                            color: 'var(--진초록)',
                            fontSize: 'var(--글자-작)',
                            fontWeight: 800,
                            padding: '6px 14px',
                            borderRadius: 999,
                            marginBottom: 'var(--틈)',
                        }}
                    >
                        {eyebrow}
                    </span>
                )}
                <h1
                    style={{
                        color: 'var(--흰)',
                        fontSize: 'var(--글자-초대)',
                        fontWeight: 900,
                        lineHeight: 1.15,
                        letterSpacing: '-0.03em',
                        whiteSpace: 'pre-line',
                    }}
                >
                    {title}
                </h1>

                {/* 말풍선 꼬리 — 아래 목록을 가리킨다 */}
                {tail && (
                    <span
                        aria-hidden
                        style={{
                            position: 'absolute',
                            left: 44,
                            bottom: -18,
                            width: 0,
                            height: 0,
                            borderLeft: '18px solid transparent',
                            borderRight: '18px solid transparent',
                            borderTop: '20px solid var(--진초록)',
                        }}
                    />
                )}
            </div>
        </section>
    )
}
