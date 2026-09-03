import Link from 'next/link'
import Image from 'next/image'

/**
 * 멘토 큰 카드
 * 사진을 크게, 이름을 굵게, 무엇을 도와주는지 한 줄.
 * 칩은 '무슨 이야기를 할 수 있나'를 미리 보여준다.
 */
export default function MentorBigCard({
    href,
    name,
    title,
    imageSrc,
    chips = [],
}: {
    href: string
    name: string
    title: string
    imageSrc: string | null
    chips?: string[]
}) {
    return (
        <Link
            href={href}
            aria-label={`${name} 멘토와 대화하기`}
            style={{
                display: 'block',
                background: 'var(--흰)',
                borderRadius: 'var(--둥근)',
                overflow: 'hidden',
                boxShadow: 'var(--그림자)',
                textDecoration: 'none',
                color: 'inherit',
            }}
        >
            <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: '#E8EDE9' }}>
                {imageSrc ? (
                    <Image src={imageSrc} alt="" fill sizes="(max-width: 760px) 100vw, 420px" style={{ objectFit: 'cover' }} />
                ) : (
                    <span
                        style={{
                            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                            fontSize: 44,
                        }}
                        aria-hidden
                    >
                        🍀
                    </span>
                )}
            </div>

            <div style={{ padding: 'var(--틈) var(--틈) var(--틈-대)' }}>
                <h3
                    style={{
                        fontSize: 'var(--글자-대)',
                        fontWeight: 900,
                        letterSpacing: '-0.03em',
                        marginBottom: 6,
                    }}
                >
                    {name}
                </h3>
                <p
                    style={{
                        fontSize: 'var(--글자-본문)',
                        color: 'var(--먹연)',
                        lineHeight: 1.5,
                        marginBottom: chips.length ? 'var(--틈)' : 0,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                    }}
                >
                    {title}
                </p>

                {chips.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--틈-소)' }}>
                        {chips.slice(0, 3).map((c) => (
                            <span
                                key={c}
                                style={{
                                    background: '#EDF7F1',
                                    color: 'var(--진초록)',
                                    fontSize: 'var(--글자-작)',
                                    fontWeight: 700,
                                    padding: '6px 12px',
                                    borderRadius: 'var(--둥근-소)',
                                }}
                            >
                                {c}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </Link>
    )
}
