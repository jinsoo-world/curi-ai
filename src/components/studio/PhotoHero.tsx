'use client'

/**
 * 첫 화면 — 사진 한 장 올리는 것부터 시작한다
 *
 * 대표 지시 2026-09-14 = 「처음에는 이게 좋겠다. 바로 직관적이고」 「이게 메인으로」
 * (모니카 AI 링크드인 사진 생성기 화면을 보여주며)
 *
 * 왜 = 전에는 첫 화면이 「오늘은 어떤 이야기를 나눠볼까요」였다. 말을 걸라는 뜻인데
 * 무슨 말을 걸지는 사람이 알아서 생각해야 했다. 사진 올리기는 생각할 게 없다.
 * 왼쪽에 바뀐 결과를 먼저 보여주고 오른쪽에 올릴 자리를 크게 연다.
 */
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { PhotoDrop } from './PhotoDrop'

/** 올린 사진을 다음 화면으로 넘기는 열쇠 */
export const HERO_PHOTO_KEY = 'curi.heroPhoto'

/** 남녀 한 쌍씩 — 대표 지시 0914 「이미지 너무 후킹하고 좋은데, 여자 버전으로도 하나 만들어바」 */
const 짝 = [
    { before: '/samples/before-man.webp', after: '/samples/after-man.webp' },
    { before: '/samples/before-woman.webp', after: '/samples/after-woman.webp' },
]

export default function PhotoHero() {
    const router = useRouter()
    const [err, setErr] = useState<string | null>(null)
    const [지금, set지금] = useState(0)

    // 5초마다 남녀를 번갈아 보여준다. 한 화면에 넷을 늘어놓으면 작아져서 안 보인다.
    useEffect(() => {
        const t = setInterval(() => set지금(i => (i + 1) % 짝.length), 5000)
        return () => clearInterval(t)
    }, [])

    const 받았을때 = (dataUrl: string, mimeType: string) => {
        try {
            sessionStorage.setItem(HERO_PHOTO_KEY, JSON.stringify({ dataUrl, mimeType }))
        } catch {
            // 저장이 막힌 브라우저면 그냥 빈 화면으로 넘긴다
        }
        router.push('/tools/profile-photo')
    }

    return (
        <section style={{ background: 'var(--종이)', padding: '40px 16px 8px' }}>
            <div style={{ maxWidth: 1120, margin: '0 auto' }}>
                <h1
                    style={{
                        fontSize: 'var(--글자-초대)',
                        fontWeight: 900,
                        letterSpacing: '-0.04em',
                        textAlign: 'center',
                        lineHeight: 1.15,
                        margin: '0 0 12px',
                        wordBreak: 'keep-all',
                    }}
                >
                    <span style={{ color: 'var(--진초록)' }}>AI 프로필 사진</span> 만들기
                </h1>
                <p
                    style={{
                        textAlign: 'center',
                        fontSize: 'var(--글자-본문)',
                        color: 'var(--먹연)',
                        margin: '0 0 32px',
                        lineHeight: 1.6,
                        wordBreak: 'keep-all',
                    }}
                >
                    내 사진 한 장만 올리면 됩니다. 얼굴은 그대로 두고 옷과 배경만 바꿔드려요.
                </p>

                <div className="photo-hero-row">
                    {/* 왼쪽 — 바뀌기 전과 후 */}
                    <div className="photo-hero-samples">
                        {[
                            { src: 짝[지금].before, label: '올린 사진' },
                            { src: 짝[지금].after, label: '만든 사진' },
                        ].map((s) => (
                            <figure
                                key={s.src}
                                style={{
                                    position: 'relative',
                                    margin: 0,
                                    aspectRatio: '3 / 4',
                                    borderRadius: 'var(--둥근)',
                                    overflow: 'hidden',
                                    background: '#E8E8E4',
                                }}
                            >
                                <Image
                                    src={s.src}
                                    alt={s.label}
                                    fill
                                    sizes="(max-width: 900px) 45vw, 260px"
                    quality={90}
                                    style={{ objectFit: 'cover', transition: 'opacity 400ms ease' }}
                                />
                                <figcaption
                                    style={{
                                        position: 'absolute',
                                        left: 10,
                                        bottom: 10,
                                        background: 'rgba(0,0,0,0.62)',
                                        color: '#fff',
                                        fontSize: 13,
                                        fontWeight: 700,
                                        padding: '5px 11px',
                                        borderRadius: 999,
                                    }}
                                >
                                    {s.label}
                                </figcaption>
                            </figure>
                        ))}
                    </div>

                    {/* 오른쪽 — 올리는 자리 */}
                    <div className="photo-hero-drop">
                        <PhotoDrop preview={null} onPicked={받았을때} onError={setErr} />
                        {err && (
                            <p style={{ color: '#dc2626', fontSize: 'var(--글자-작)', marginTop: 10, textAlign: 'center' }}>
                                {err}
                            </p>
                        )}
                        <p
                            style={{
                                fontSize: 13,
                                color: 'var(--먹연)',
                                textAlign: 'center',
                                marginTop: 12,
                                lineHeight: 1.6,
                            }}
                        >
                            JPG · PNG · 4MB 이하 · 올린 사진은 만들고 나면 지웁니다
                        </p>
                    </div>
                </div>
            </div>
        </section>
    )
}
