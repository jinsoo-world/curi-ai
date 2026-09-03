import Link from 'next/link'
import Image from 'next/image'

/**
 * 멘토 카드 — 4열(휴대폰 2열) 배열에 맞춘 세로형
 *
 * 하나투어는 큰 여행 사진이 재료였다. 여기는 멘토가 가진 그림이
 * 112px 짜리 작은 프로필뿐이라(실측) 큰 사진 자리에 늘리면 흐려진다.
 * 그래서 색면 위에 원형 프로필을 얹었다.
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
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--흰)',
                borderRadius: 'var(--둥근)',
                overflow: 'hidden',
                boxShadow: 'var(--그림자)',
                textDecoration: 'none',
                color: 'inherit',
                height: '100%',
            }}
        >
            {/* 색면 + 원형 프로필 */}
            <div
                style={{
                    background: '#EDF7F1',
                    padding: '22px 0',
                    display: 'grid',
                    placeItems: 'center',
                }}
            >
                <span
                    style={{
                        position: 'relative',
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
            </div>

            <div
                style={{
                    padding: 'var(--틈)',
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                }}
            >
                <h3
                    style={{
                        fontSize: 'var(--글자-중)',
                        fontWeight: 900,
                        letterSpacing: '-0.03em',
                        lineHeight: 1.3,
                        marginBottom: 6,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                    }}
                >
                    {name}
                </h3>

                <p
                    style={{
                        fontSize: 'var(--글자-작)',
                        color: 'var(--먹연)',
                        lineHeight: 1.5,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                    }}
                >
                    {title}
                </p>

                {chips.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'var(--틈-소)' }}>
                        {chips.slice(0, 2).map((c) => (
                            <span
                                key={c}
                                style={{
                                    background: '#EDF7F1',
                                    color: 'var(--진초록)',
                                    fontSize: 13,
                                    fontWeight: 700,
                                    padding: '4px 10px',
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
                        marginTop: 'auto',
                        paddingTop: 'var(--틈)',
                    }}
                >
                    <span
                        style={{
                            width: '100%',
                            height: 46,
                            display: 'grid',
                            placeItems: 'center',
                            borderRadius: 'var(--둥근-소)',
                            background: 'var(--연두)',
                            color: 'var(--흰)',
                            fontSize: 'var(--글자-작)',
                            fontWeight: 800,
                        }}
                    >
                        대화하기
                    </span>
                </span>
            </div>
        </Link>
    )
}
