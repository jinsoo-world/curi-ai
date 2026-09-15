import Link from 'next/link'
import Image from 'next/image'

/**
 * 멘토 카드 — 사진이 카드를 꽉 채운다
 *
 * 대표 지시 2026-09-14 = 「이미지를 겁나 크게 해 다 채워, 원형으로 짜르지말고」
 * 전에는 84px 짜리 동그란 프로필을 색면 위에 얹었다. 카드 넓이의 3분의 1도
 * 안 써서 누가 누군지 안 보였다. 지금은 세로 3:4 사진이 카드 전체이고
 * 이름·설명은 사진 아래쪽 어두운 그늘 위에 얹는다(캐릭터챗과 같은 방식).
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
            aria-label={`${name} 코치 소개 보기`}
            className="mentor-big-card"
            style={{
                position: 'relative',
                display: 'block',
                width: '100%',
                aspectRatio: '3 / 4',
                borderRadius: 'var(--둥근)',
                overflow: 'hidden',
                background: '#E8F2EC',
                boxShadow: 'var(--그림자)',
                textDecoration: 'none',
                color: 'inherit',
            }}
        >
            {imageSrc ? (
                <Image
                    src={imageSrc}
                    alt=""
                    fill
                    sizes="(max-width: 820px) 50vw, (max-width: 1180px) 33vw, 300px"
                    quality={90}
                    style={{ objectFit: 'cover', objectPosition: 'center 22%' }}
                />
            ) : (
                <span
                    aria-hidden
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 64,
                        color: 'var(--진초록)',
                        opacity: 0.25,
                        fontWeight: 900,
                    }}
                >
                    {name.slice(0, 1)}
                </span>
            )}

            {/* 아래쪽 그늘 — 글자가 사진 위에서도 읽히게 */}
            <div
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    padding: '52px 16px 16px',
                    background:
                        'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0) 100%)',
                    color: '#fff',
                }}
            >
                <h3
                    style={{
                        fontSize: 22,
                        fontWeight: 900,
                        letterSpacing: '-0.03em',
                        lineHeight: 1.2,
                        marginBottom: 4,
                        textShadow: '0 1px 6px rgba(0,0,0,0.4)',
                    }}
                >
                    {name}
                </h3>

                <p
                    style={{
                        fontSize: 'var(--글자-작)',
                        lineHeight: 1.45,
                        opacity: 0.92,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        textShadow: '0 1px 6px rgba(0,0,0,0.4)',
                    }}
                >
                    {title}
                </p>

                {chips.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                        {chips.slice(0, 2).map((c) => (
                            <span
                                key={c}
                                style={{
                                    background: 'rgba(255,255,255,0.22)',
                                    backdropFilter: 'blur(4px)',
                                    color: '#fff',
                                    fontSize: 13.5,
                                    fontWeight: 700,
                                    padding: '5px 11px',
                                    borderRadius: 999,
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
