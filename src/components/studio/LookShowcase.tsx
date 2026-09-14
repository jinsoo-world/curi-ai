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
/**
 * 실제로 고를 수 있는 것만 보여준다 — 대표 지적 2026-09-15
 * 「이거 다 설정에 있어? 옵션에서 할 수 있냐고. 저 버튼 누르면」
 *
 * 전에는 견본 사진 16장을 늘어놓고 「에디토리얼·서재·카페」 같은 이름을 붙였는데,
 * 도구 안에는 그런 선택지가 없었다. 눌러도 그렇게 안 나온다 = 거짓말이다.
 * 지금은 도구가 실제로 가진 것만 적고, 누르면 그 도구로 간다.
 */
const LOOKS: { src: string; label: string; sub: string; href: string }[] = [
    { src: '/samples/teach-w1.webp', label: '믿음직하게', sub: '강사 프로필', href: '/tools/teacher-photo?mood=trust' },
    { src: '/samples/teach-m1.webp', label: '편안하게', sub: '강사 프로필', href: '/tools/teacher-photo?mood=easy' },
    { src: '/samples/teach-w2.webp', label: '따뜻하게', sub: '강사 프로필', href: '/tools/teacher-photo?mood=warm' },
    { src: '/samples/teach-m2.webp', label: '전문가답게', sub: '강사 프로필', href: '/tools/teacher-photo?mood=expert' },
    { src: '/samples/act-m1.webp', label: '단단한 인물', sub: '배우 프로필', href: '/tools/actor-photo?mood=strong' },
    { src: '/samples/act-w2.webp', label: '기품 있는', sub: '배우 프로필', href: '/tools/actor-photo?mood=elegant' },
    { src: '/samples/act-m3.webp', label: '창가 빛', sub: '배우 프로필', href: '/tools/actor-photo?bg=window' },
    { src: '/samples/act-w5.webp', label: '밝고 친근한', sub: '배우 프로필', href: '/tools/actor-photo?mood=bright' },
    { src: '/samples/id-m1.webp', label: '흰 배경', sub: '증명사진', href: '/tools/id-photo?bg=white' },
    { src: '/samples/id-w1.webp', label: '재킷', sub: '증명사진', href: '/tools/id-photo?outfit=jacket' },
    { src: '/samples/id-m2.webp', label: '회색 배경', sub: '증명사진', href: '/tools/id-photo?bg=lightgrey' },
    { src: '/samples/id-w2.webp', label: '반명함', sub: '증명사진', href: '/tools/id-photo?size=half' },
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
                    전부 지금 고를 수 있는 것들입니다. 누르면 바로 만들러 갑니다.
                </p>

                <div className="look-grid">
                    {LOOKS.map((l) => (
                        <Link
                            key={l.src}
                            href={l.href}
                            style={{
                                position: 'relative',
                                margin: 0,
                                aspectRatio: '3 / 4',
                                borderRadius: 16,
                                overflow: 'hidden',
                                background: '#18181B',
                                display: 'block',
                                textDecoration: 'none',
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
                            <span
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    padding: '38px 12px 12px',
                                    background: 'linear-gradient(to top, rgba(0,0,0,0.78), rgba(0,0,0,0))',
                                    color: '#fff',
                                }}
                            >
                                <span style={{ display: 'block', fontSize: 'var(--글자-작)', fontWeight: 800 }}>{l.label}</span>
                                <span style={{ display: 'block', fontSize: 12, opacity: 0.75, marginTop: 2 }}>{l.sub}</span>
                            </span>
                        </Link>
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
