import Image from 'next/image'
import Link from 'next/link'

/**
 * 만들 수 있는 사진 모습 — 어두운 바탕에 큰 세로 사진
 *
 * 대표 지시 2026-09-14 = 「그 다음에 이런 느낌도 좋다」(검은 바탕 큰 인물 사진 화면)
 * 사진 자체가 설명이다. 글로 「스튜디오 조명」이라고 적는 것보다
 * 그 사진을 크게 보여주는 편이 중장년에게 훨씬 빨리 읽힌다.
 */
/**
 * 대표 지시 2026-09-15 = 「예쁘고 멋진 중장년들 더 깔아봐」 「플필도 참고해. 이미지 셋을 더 다양하게 해봐」
 * 배우 프로필 사이트(jactors·plfil)처럼 어두운 스튜디오부터 밝은 증명사진형·야외까지 섞는다.
 */
const LOOKS = [
    { src: '/samples/act-m1.webp', label: '스튜디오' },
    { src: '/samples/act-w1.webp', label: '단정하게' },
    { src: '/samples/act-m5.webp', label: '정장' },
    { src: '/samples/act-w5.webp', label: '밝게' },
    { src: '/samples/act-m2.webp', label: '지적인' },
    { src: '/samples/act-w2.webp', label: '세련되게' },
    { src: '/samples/act-m6.webp', label: '편안하게' },
    { src: '/samples/act-w6.webp', label: '부드럽게' },
    { src: '/samples/act-m3.webp', label: '창가 빛' },
    { src: '/samples/act-w3.webp', label: '웃는 얼굴' },
    { src: '/samples/act-m7.webp', label: '클래식' },
    { src: '/samples/act-w7.webp', label: '에디토리얼' },
    { src: '/samples/act-m4.webp', label: '서재' },
    { src: '/samples/act-w4.webp', label: '강한 조명' },
    { src: '/samples/act-m8.webp', label: '카페' },
    { src: '/samples/act-w8.webp', label: '야외' },
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
                <p style={{ color: 'rgba(255,255,255,0.62)', textAlign: 'center', fontSize: 'var(--글자-본문)', margin: '-24px 0 32px', lineHeight: 1.6 }}>
                    사진관에서 찍은 것처럼. 내 사진 한 장만 올리면 됩니다.
                </p>

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
                    quality={90}
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
