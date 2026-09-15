import Image from 'next/image'
import Link from 'next/link'

/**
 * 지금 쓸 수 있는 도구 — 사진 한 장이 곧 설명이다
 *
 * 대표 지시 2026-09-14 = 「UI 전체적으로 다시 잡아」
 * pfpmaker 는 이모지 타일을 쓰지만 이모지는 결과물을 안 보여준다.
 * 결과 사진 자체를 타일로 쓴다.
 */
const TOOLS = [
    {
        href: '/tools/profile-photo',
        img: '/samples/after-man.webp',
        title: '전문가 프로필 사진',
        desc: '얼굴은 그대로, 옷과 배경만 바꿔요',
        badge: '가장 많이 씀',
    },
    {
        href: '/tools/insta-profile',
        img: '/samples/look-outdoor.webp',
        title: '인스타 프로필 사진',
        desc: '동그랗게 잘려도 얼굴이 잘 나오게',
        badge: null,
    },
    {
        href: '/creator/create',
        img: '/samples/look-office.webp',
        title: '내 AI 만들기',
        desc: '내 경험으로 말하는 AI 를 만들고 팔아요',
        badge: null,
    },
]

export default function ToolTiles() {
    return (
        <section data-guide="guide-tools" style={{ background: 'var(--종이)', padding: '28px 16px 8px' }}>
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                <h2
                    style={{
                        fontSize: 'var(--글자-대)',
                        fontWeight: 900,
                        letterSpacing: '-0.04em',
                        margin: '0 0 14px',
                    }}
                >
                    오늘 뭘 만들까요
                </h2>

                <div className="tool-tiles">
                    {TOOLS.map((t) => (
                        <Link key={t.href} href={t.href} className="tool-tile">
                            <span className="tool-tile-img">
                                <Image
                                    src={t.img}
                                    alt=""
                                    fill
                                    sizes="120px"
                                    style={{ objectFit: 'cover', objectPosition: 'center 20%' }}
                                />
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                                    <span style={{ fontSize: 'var(--글자-중)', fontWeight: 800, letterSpacing: '-0.03em' }}>
                                        {t.title}
                                    </span>
                                    {t.badge && (
                                        <span
                                            style={{
                                                background: '#EAF7EF',
                                                color: 'var(--진초록)',
                                                fontSize: 11,
                                                fontWeight: 800,
                                                padding: '3px 8px',
                                                borderRadius: 999,
                                            }}
                                        >
                                            {t.badge}
                                        </span>
                                    )}
                                </span>
                                <span
                                    style={{
                                        display: 'block',
                                        fontSize: 'var(--글자-작)',
                                        color: 'var(--먹연)',
                                        lineHeight: 1.5,
                                        wordBreak: 'keep-all',
                                    }}
                                >
                                    {t.desc}
                                </span>
                            </span>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    )
}
