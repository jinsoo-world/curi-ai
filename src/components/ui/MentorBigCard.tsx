import Link from 'next/link'
import Image from 'next/image'

/**
 * 멘토 카드
 *
 * 하나투어는 큰 여행 사진이 재료였다. 여기는 재료가 다르다 —
 * 멘토가 가진 그림은 112px 짜리 작은 프로필뿐이다.
 * 그걸 큰 사진 자리에 늘리면 흐려진다. 그래서 색면 위에
 * 원형 프로필을 얹고, 대신 이름을 크게 키웠다.
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
            {/* 색면 + 원형 프로필 */}
            <div
                style={{
                    background: '#EDF7F1',
                    padding: 'var(--틈-대) var(--틈)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--틈)',
                }}
            >
                <span
                    style={{
                        position: 'relative',
                        flex: '0 0 auto',
                        width: 84,
                        height: 84,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        background: 'var(--흰)',
                        display: 'grid',
                        placeItems: 'center',
                        boxShadow: '0 0 0 3px var(--흰)',
                    }}
                >
                    {imageSrc ? (
                        <Image src={imageSrc} alt="" fill sizes="84px" style={{ objectFit: 'cover' }} />
                    ) : (
                        <span style={{ fontSize: 36 }} aria-hidden>🍀</span>
                    )}
                </span>

                <h3
                    style={{
                        fontSize: 'var(--글자-대)',
                        fontWeight: 900,
                        letterSpacing: '-0.03em',
                        lineHeight: 1.25,
                    }}
                >
                    {name}
                </h3>
            </div>

            <div style={{ padding: 'var(--틈) var(--틈) var(--틈-대)' }}>
                <p
                    style={{
                        fontSize: 'var(--글자-본문)',
                        color: 'var(--먹연)',
                        lineHeight: 1.55,
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

                <span
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 'var(--틈)',
                        height: 'var(--손가락)',
                        borderRadius: 'var(--둥근-소)',
                        background: 'var(--연두)',
                        color: 'var(--흰)',
                        fontSize: 'var(--글자-중)',
                        fontWeight: 800,
                    }}
                >
                    대화 시작하기
                </span>
            </div>
        </Link>
    )
}
