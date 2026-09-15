import Image from 'next/image'
import Link from 'next/link'
import { TOOLS } from '@/domains/studio/tools'
import CloverIcon from '@/components/ui/CloverIcon'

/**
 * 지금 쓸 수 있는 도구 — 사진 한 장이 곧 설명이다
 *
 * 대표 지시 2026-09-14 = 「UI 전체적으로 다시 잡아」
 * pfpmaker 는 이모지 타일을 쓰지만 이모지는 결과물을 안 보여준다.
 * 결과 사진 자체를 타일로 쓴다.
 *
 * 2026-09-15 = 목록을 손으로 적어두고 있었다(전문가 프로필·인스타 프로필·내 AI).
 * 대표가 확정한 서비스 여섯 개와 달라서 첫 화면만 옛 이름을 보여주고 있었다.
 * 이제 tools.ts 한 표만 본다.
 */

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
                        <Link key={t.id} href={t.href} className="tool-tile">
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
                                    <span
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            background: '#F4F6F3',
                                            color: 'var(--먹연)',
                                            fontSize: 12,
                                            fontWeight: 800,
                                            padding: '3px 8px',
                                            borderRadius: 999,
                                            flexShrink: 0,
                                        }}
                                    >
                                        {t.cost === 'free' ? '무료' : (<><CloverIcon size={11} />{t.cost}개</>)}
                                    </span>
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
