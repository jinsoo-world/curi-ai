'use client'

/**
 * 사진 도구 공통 틀 — 대표 지시 2026-09-15
 * 「클릭하면 그 이미지 바로 알 수 있게. 사진 넣는 곳은 페이지 접속하면 바로 있게」
 *
 * 차례를 뒤집었다.
 *   전 = 제목 → 예시 → 사진 올리기 → 고르기 → 만들기
 *   후 = 제목 → **사진 올리기** → 예시(이 도구가 뭘 만드는지) → 고르기 → 만들기
 *
 * 왜 = 들어오자마자 할 일이 눈앞에 있어야 한다. 예시를 먼저 보여주면
 * 중장년은 스크롤을 내리다 멈춘다(0914 실측 = 채팅 화면 473번 중 308번이 한 마디도 없이 끝났다).
 */
import Image from 'next/image'
import type { ReactNode } from 'react'
import { PhotoDrop } from './PhotoDrop'
import MakingBar from './MakingBar'
import CloverIcon from '@/components/ui/CloverIcon'
import BeforeAfter from './BeforeAfter'

export interface 견본 { src: string; label: string }

export default function PhotoToolShell({
    title,
    desc,
    samples,
    preview,
    onPicked,
    onError,
    children,
    cost,
    canMake,
    loading,
    onMake,
    makingSeconds = 20,
    errorMsg,
    needCharge,
    onCharge,
    result,
    isPreviewResult,
    onLogin,
    downloadName,
    compareWithOriginal = false,
}: {
    title: string
    desc: string
    samples: 견본[]
    preview: string | null
    onPicked: (dataUrl: string, mimeType: string) => void
    onError: (msg: string) => void
    /** 고르는 칸들 */
    children: ReactNode
    cost: number
    canMake: boolean
    loading: boolean
    onMake: () => void
    makingSeconds?: number
    errorMsg: string | null
    needCharge: boolean
    onCharge: () => void
    result: string | null
    isPreviewResult: boolean
    onLogin: () => void
    downloadName: string
    /** 화질 개선처럼 전후를 견줘야 하는 도구 */
    compareWithOriginal?: boolean
}) {
    return (
        <div className="tool-page">
            <div>
                <h1 style={{ fontSize: 'var(--글자-대)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 8px', wordBreak: 'keep-all' }}>
                    {title}
                </h1>
                <p style={{ fontSize: 'var(--글자-본문)', color: 'var(--먹연)', margin: '0 0 18px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                    {desc}
                </p>

                {/* 1. 사진 넣는 곳 — 들어오자마자 여기다 */}
                <div style={{ marginBottom: 22 }}>
                    <PhotoDrop preview={preview} onPicked={onPicked} onError={onError} />
                </div>

                {/* 2. 이 도구가 만드는 것 */}
                {!preview && (
                    <section style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--먹연)', marginBottom: 10 }}>
                            이런 사진이 나와요
                        </div>
                        <div className="tool-hero-grid">
                            {samples.map((s) => (
                                <figure key={s.src} style={{ margin: 0 }}>
                                    <div style={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: 14, overflow: 'hidden', background: '#E8E8E4' }}>
                                        <Image src={s.src} alt={s.label} fill sizes="(max-width: 700px) 45vw, 220px" quality={90}
                                            style={{ objectFit: 'cover', objectPosition: 'center 18%' }} />
                                    </div>
                                    <figcaption style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--먹연)', marginTop: 7, textAlign: 'center' }}>
                                        {s.label}
                                    </figcaption>
                                </figure>
                            ))}
                        </div>
                    </section>
                )}
            </div>

            <div>
                {/* 3. 고르는 것들 */}
                <div style={{ opacity: preview ? 1 : 0.45, pointerEvents: preview ? 'auto' : 'none' }}>
                    {children}
                </div>

                {errorMsg && (
                    <div style={{ background: '#fef2f2', color: '#dc2626', fontSize: 14, padding: '12px 16px', borderRadius: 12, marginBottom: 14, lineHeight: 1.6 }}>
                        {errorMsg}
                        {needCharge && (
                            <button onClick={onCharge} style={{
                                display: 'block', marginTop: 10, background: '#dc2626', color: '#fff', border: 'none',
                                borderRadius: 10, padding: '9px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                            }}>충전하러 가기</button>
                        )}
                    </div>
                )}

                {loading ? (
                    <MakingBar 예상초={makingSeconds} />
                ) : (
                    <button onClick={onMake} disabled={!canMake} style={{
                        width: '100%', padding: 17, borderRadius: 16, border: 'none',
                        background: !canMake ? '#d4d4d8' : '#22c55e',
                        color: '#fff', fontSize: 17, fontWeight: 800,
                        cursor: !canMake ? 'default' : 'pointer',
                    }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            만들기 <CloverIcon size={18} color="#fff" /> {cost}개
                        </span>
                    </button>
                )}

                {result && (
                    <div style={{ marginTop: 26 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#18181b', marginBottom: 10 }}>다 됐어요</div>
                        {compareWithOriginal && preview ? (
                            <>
                                <p style={{ fontSize: 13, color: '#71717a', margin: '0 0 12px' }}>가운데 손잡이를 좌우로 끌어보세요.</p>
                                <BeforeAfter before={preview} after={result} ratio="1 / 1" />
                            </>
                        ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={result} alt="만든 사진" style={{ width: '100%', borderRadius: 16, border: '1px solid #e4e4e7' }} />
                        )}

                        {isPreviewResult ? (
                            <div style={{ marginTop: 12, background: '#fff', border: '1px solid #e4e4e7', borderRadius: 14, padding: '18px 18px 16px', textAlign: 'center' }}>
                                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>선명한 사진은 회원만 받을 수 있어요</div>
                                <p style={{ fontSize: 13.5, color: '#71717a', margin: '0 0 14px', lineHeight: 1.6 }}>
                                    지금 보이는 건 미리보기라 흐릿해요. 로그인하면 원본을 바로 내려받습니다.
                                </p>
                                <button onClick={onLogin} style={{
                                    width: '100%', padding: 14, borderRadius: 14, border: 'none',
                                    background: '#1C2321', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
                                }}>로그인하고 원본 받기</button>
                            </div>
                        ) : (
                            <a href={result} download={downloadName} style={{
                                display: 'block', marginTop: 12, padding: 14, borderRadius: 14,
                                background: '#18181b', color: '#fff', fontSize: 15, fontWeight: 700,
                                textAlign: 'center', textDecoration: 'none',
                            }}>사진 내려받기</a>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
