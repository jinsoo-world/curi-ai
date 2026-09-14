import Image from 'next/image'
import Link from 'next/link'

/**
 * 만들 수 있는 사진 모습 — 어두운 바탕에 큰 세로 사진
 *
 * 대표 지시 2026-09-14 = 「그 다음에 이런 느낌도 좋다」(검은 바탕 큰 인물 사진 화면)
 * 사진 자체가 설명이다. 글로 「스튜디오 조명」이라고 적는 것보다
 * 그 사진을 크게 보여주는 편이 중장년에게 훨씬 빨리 읽힌다.
 */
const LOOKS = [
    { src: '/samples/look-studio.webp', label: '스튜디오' },
    { src: '/samples/look-editorial.webp', label: '에디토리얼' },
    { src: '/samples/look-office.webp', label: '오피스' },
    { src: '/samples/look-outdoor.webp', label: '야외' },
]

export default function LookShowcase() {
    return (
        <section style={{ background: '#0B0B0C', padding: '56px 16px 60px' }}>
            <div style={{ maxWidth: 1120, margin: '0 auto' }}>
                <h2
                    style={{
                        color: '#fff',
                        fontSize: 'var(--글자-대)',
                        fontWeight: 900,
                        letterSpacing: '-0.04em',
                        textAlign: 'center',
                        margin: '0 0 36px',
                        wordBreak: 'keep-all',
                    }}
                >
                    만들 수 있는 인물 사진
                </h2>

                <div className="look-grid">
                    {LOOKS.map((l) => (
                        <figure
                            key={l.src}
                            style={{
                                position: 'relative',
                                margin: 0,
                                aspectRatio: '3 / 4',
                                borderRadius: 16,
                                overflow: 'hidden',
                                background: '#18181B',
                            }}
                        >
                            <Image
                                src={l.src}
                                alt={`${l.label} 느낌 사진`}
                                fill
                                sizes="(max-width: 700px) 50vw, 260px"
                                style={{ objectFit: 'cover' }}
                            />
                            <figcaption
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    padding: '38px 14px 14px',
                                    background: 'linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))',
                                    color: '#fff',
                                    fontSize: 'var(--글자-작)',
                                    fontWeight: 700,
                                }}
                            >
                                {l.label}
                            </figcaption>
                        </figure>
                    ))}
                </div>

                <div style={{ textAlign: 'center', marginTop: 32 }}>
                    <Link
                        href="/tools/profile-photo"
                        style={{
                            display: 'inline-block',
                            background: 'var(--연두)',
                            color: '#fff',
                            fontSize: 'var(--글자-본문)',
                            fontWeight: 800,
                            padding: '15px 34px',
                            borderRadius: 999,
                            textDecoration: 'none',
                        }}
                    >
                        내 사진으로 만들어보기
                    </Link>
                </div>
            </div>
        </section>
    )
}
