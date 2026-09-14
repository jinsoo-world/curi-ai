import Image from 'next/image'

/**
 * 도구 첫머리 — 무엇을 해주는 곳인지 사진으로 먼저 보여준다
 *
 * 대표 지적 2026-09-15 = 「랜딩들 다 어디갔냐」 「클릭하면 예시들이 잘 보여야지」
 *
 * 도구 화면에 제목 한 줄만 있고 바로 「사진을 올리세요」가 나왔다.
 * 무엇이 나오는지 못 본 채로 자기 얼굴을 올리라고 한 셈이다.
 */
export default function ToolHero({
    title,
    desc,
    samples,
}: {
    title: string
    desc: string
    /** 보여줄 결과 예시 — 넷이면 딱 좋다 */
    samples: { src: string; label: string }[]
}) {
    return (
        <section style={{ gridColumn: '1 / -1', marginBottom: 8 }}>
            <h1
                style={{
                    fontSize: 'var(--글자-대)',
                    fontWeight: 900,
                    letterSpacing: '-0.04em',
                    margin: '0 0 8px',
                    wordBreak: 'keep-all',
                }}
            >
                {title}
            </h1>
            <p
                style={{
                    fontSize: 'var(--글자-본문)',
                    color: 'var(--먹연)',
                    margin: '0 0 18px',
                    lineHeight: 1.6,
                    wordBreak: 'keep-all',
                }}
            >
                {desc}
            </p>

            <div className="tool-hero-grid">
                {samples.map((s) => (
                    <figure key={s.src} style={{ margin: 0 }}>
                        <div
                            style={{
                                position: 'relative',
                                aspectRatio: '3 / 4',
                                borderRadius: 14,
                                overflow: 'hidden',
                                background: '#E8E8E4',
                            }}
                        >
                            <Image
                                src={s.src}
                                alt={s.label}
                                fill
                                sizes="(max-width: 700px) 45vw, 240px"
                                quality={90}
                                style={{ objectFit: 'cover', objectPosition: 'center 18%' }}
                            />
                        </div>
                        <figcaption style={{ fontSize: 14, fontWeight: 700, color: 'var(--먹연)', marginTop: 8, textAlign: 'center' }}>
                            {s.label}
                        </figcaption>
                    </figure>
                ))}
            </div>

            <p style={{ fontSize: 14, color: 'var(--먹연)', margin: '14px 0 0', lineHeight: 1.6 }}>
                전부 이 도구로 만든 사진입니다. 아래에서 내 사진을 올려보세요.
            </p>
        </section>
    )
}
