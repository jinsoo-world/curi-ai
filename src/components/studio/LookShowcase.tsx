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
    { src: '/samples/act-m1.webp', label: '단단한 인물', sub: '배우 프로필', href: '/tools/actor-photo?mood=strong' },
    { src: '/samples/act-w1.webp', label: '기품 있는', sub: '배우 프로필', href: '/tools/actor-photo?mood=elegant' },
    { src: '/samples/teach-w1.webp', label: '믿음직하게', sub: '강사 프로필', href: '/tools/teacher-photo?mood=trust' },
    { src: '/samples/act-m3.webp', label: '창가 빛', sub: '배우 프로필', href: '/tools/actor-photo?bg=window' },
    { src: '/samples/act-w3.webp', label: '밝고 친근한', sub: '배우 프로필', href: '/tools/actor-photo?mood=bright' },
    { src: '/samples/act-m7.webp', label: '기품 있는', sub: '배우 프로필', href: '/tools/actor-photo?mood=elegant' },
    { src: '/samples/act-w5.webp', label: '따뜻한 어른', sub: '배우 프로필', href: '/tools/actor-photo?mood=warm' },

    { src: '/samples/teach-m1.webp', label: '편안하게', sub: '강사 프로필', href: '/tools/teacher-photo?mood=easy' },
    { src: '/samples/act-w4.webp', label: '단단한 인물', sub: '배우 프로필', href: '/tools/actor-photo?mood=strong' },
    { src: '/samples/act-m5.webp', label: '밝고 친근한', sub: '배우 프로필', href: '/tools/actor-photo?mood=bright' },
    { src: '/samples/act-m2.webp', label: '밝은 회색 배경', sub: '배우 프로필', href: '/tools/actor-photo?bg=grey' },
    { src: '/samples/act-w7.webp', label: '검은 배경', sub: '배우 프로필', href: '/tools/actor-photo?bg=dark' },
    { src: '/samples/teach-w2.webp', label: '따뜻하게', sub: '강사 프로필', href: '/tools/teacher-photo?mood=warm' },
    { src: '/samples/act-m6.webp', label: '따뜻한 어른', sub: '배우 프로필', href: '/tools/actor-photo?mood=warm' },

    { src: '/samples/act-w2.webp', label: '밝은 배경', sub: '배우 프로필', href: '/tools/actor-photo?bg=white' },
    { src: '/samples/act-m4.webp', label: '서재', sub: '강사 프로필', href: '/tools/teacher-photo?bg=study' },
    { src: '/samples/act-w6.webp', label: '따뜻한 어른', sub: '배우 프로필', href: '/tools/actor-photo?mood=warm' },
    { src: '/samples/teach-m2.webp', label: '전문가답게', sub: '강사 프로필', href: '/tools/teacher-photo?mood=expert' },
    { src: '/samples/act-m8.webp', label: '밝고 친근한', sub: '배우 프로필', href: '/tools/actor-photo?mood=bright' },
    { src: '/samples/act-w8.webp', label: '밝고 친근한', sub: '배우 프로필', href: '/tools/actor-photo?mood=bright' },
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
                                sizes="(max-width: 700px) 50vw, 220px"
                                quality={78}
                                loading="lazy"
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
                                <span style={{ display: 'block', fontSize: 13.5, opacity: 0.8, marginTop: 2 }}>{l.sub}</span>
                            </span>
                        </Link>
                    ))}
                </div>

                {/* 대표 지시 2026-09-16 「url도 어긋나면 바꾸고」
                    목록에서 뺀 도구(/tools/profile-photo)로 가고 있었다. 이제 만들기 목록으로 보낸다. */}
                <div style={{ textAlign: 'center', marginTop: 32 }}>
                    <Link
                        href="/studio"
                        style={{
                            display: 'inline-block',
                            background: '#fff',
                            color: '#111315',
                            fontSize: 'var(--글자-중)',
                            fontWeight: 900,
                            padding: '18px 42px',
                            borderRadius: 999,
                            textDecoration: 'none',
                            boxShadow: '0 10px 26px rgba(0,0,0,0.45)',
                        }}
                    >
                        내 사진으로 만들기
                    </Link>
                </div>
            </div>
        </section>
    )
}
