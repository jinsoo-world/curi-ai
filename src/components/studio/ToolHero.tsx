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
    /** 보여줄 결과 예시 — 여덟이면 넉넉하다. pick 을 주면 눌러서 그 옵션을 고를 수 있다 */
    samples: { src: string; label: string; pick?: () => void }[]
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

            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--먹연)', marginBottom: 10 }}>
                이런 사진이 나와요
            </div>
            <div className="photo-marquee">
                <div className="photo-marquee-track">
                    {[...samples, ...samples].map((s, i) => {
                        const 속 = (
                            <>
                                <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 5', borderRadius: 14, overflow: 'hidden', background: '#E8E8E4' }}>
                                    <Image src={s.src} alt={s.label} fill sizes="200px" quality={90}
                                        style={{ objectFit: 'cover', objectPosition: 'center 26%' }} />
                                </div>
                                <figcaption style={{ fontSize: 15, fontWeight: 700, color: 'var(--먹연)', marginTop: 7, textAlign: 'center' }}>
                                    {s.label}
                                </figcaption>
                            </>
                        )
                        // 누르면 그 옵션이 골라진다 — 대표 지시 0915 「클릭하면 그 옵션으로 가게 해야지」
                        return s.pick ? (
                            <button key={`${s.src}-${i}`} type="button" onClick={s.pick}
                                className="photo-marquee-item"
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'block' }}>
                                {속}
                            </button>
                        ) : (
                            <figure key={`${s.src}-${i}`} className="photo-marquee-item">{속}</figure>
                        )
                    })}
                </div>
            </div>

            <p style={{ fontSize: 15, color: 'var(--먹연)', margin: '14px 0 0', lineHeight: 1.6 }}>
                전부 이 도구로 만든 사진입니다. 마음에 드는 것을 누르면 그대로 골라집니다.
            </p>
        </section>
    )
}
