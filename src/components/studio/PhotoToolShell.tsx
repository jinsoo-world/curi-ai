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
import Link from 'next/link'
import type { ReactNode } from 'react'
import { PhotoDrop } from './PhotoDrop'
import MakingBar from './MakingBar'
import CloverIcon from '@/components/ui/CloverIcon'
import BeforeAfter from './BeforeAfter'
import KeepNotice from '@/components/studio/KeepNotice'
import ShareTool from '@/components/studio/ShareTool'
import { 센다 } from '@/lib/track'
import { useGuest } from '@/components/studio/useGuest'
import { GUEST_CLOVERS, SIGNUP_CLOVERS } from '@/domains/trial'

export interface 견본 { src: string; label: string; /** 누르면 이 옵션이 골라진다 */ pick?: () => void }

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
    share,
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
    /** 공유 버튼에 쓸 것 — 이 도구 주소·제목·카톡 그림 */
    share: { path: string; title: string; description: string; image: string }
    /** 화질 개선처럼 전후를 견줘야 하는 도구 */
    compareWithOriginal?: boolean
}) {
    const { 손님 } = useGuest()

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

                {/* 2. 이 도구가 만드는 것 — 옆으로 흐른다 (대표 지시 0915 「이미지 쑉쑉 지나가게해」) */}
                {!preview && (
                    <section style={{ marginBottom: 8 }}>
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
                                    // 누르면 그 옵션이 골라진다 — 대표 지시 0915
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
                    </section>
                )}

                {/* 만들기 전에도 공유할 수 있게 — 대표 지적 2026-09-15 「여기 왜 카톡공유 없냐?」
                    전에는 사진을 다 만든 뒤에만 보였다. 친구에게 먼저 알리고 같이 하는 사람이 많다 */}
                {!preview && <ShareTool {...share} />}
            </div>

            <div>
                {/* 3. 고르는 것들 */}
                <div style={{ opacity: preview ? 1 : 0.45, pointerEvents: preview ? 'auto' : 'none' }}>
                    {children}
                </div>

                {errorMsg && !needCharge && (
                    <div style={{ background: '#fef2f2', color: '#dc2626', fontSize: 15, padding: '12px 16px', borderRadius: 12, marginBottom: 14, lineHeight: 1.6 }}>
                        {errorMsg}
                    </div>
                )}

                {/* 클로버가 모자랄 때 — 손님과 회원에게 할 말이 다르다. 2026-09-15
                    손님에게 「충전하러 가기」는 막다른 길이다. 계정이 없으면 충전도 못 한다. */}
                {needCharge && (
                    <div style={{ background: '#fff', border: '1.5px solid #e4e4e7', borderRadius: 14, padding: '16px 18px', marginBottom: 14, textAlign: 'center' }}>
                        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>
                            {손님 ? '오늘 몫을 다 쓰셨어요' : '클로버가 모자라요'}
                        </div>
                        <p style={{ fontSize: 15, color: '#71717a', margin: '0 0 14px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                            {손님
                                ? `로그인하시면 클로버 ${SIGNUP_CLOVERS}개를 바로 드려요. 만드신 사진도 그대로 받으실 수 있습니다.`
                                : '클로버를 채우시면 바로 이어서 만드실 수 있어요.'}
                        </p>
                        <button onClick={손님 ? onLogin : onCharge} style={{
                            width: '100%', padding: 14, borderRadius: 14, border: 'none',
                            background: '#1C2321', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
                        }}>
                            {손님 ? `로그인하고 클로버 ${SIGNUP_CLOVERS}개 받기` : '클로버 충전하기'}
                        </button>
                    </div>
                )}

                {loading ? (
                    <MakingBar 예상초={makingSeconds} />
                ) : (
                    <button onClick={onMake} disabled={!canMake || needCharge} style={{
                        width: '100%', padding: 17, borderRadius: 16, border: 'none',
                        // 클로버가 모자라면 초록으로 두지 않는다 — 대표 지적 2026-09-15 「모바일도 확인해봐」
                        // 0 인데 단추가 초록이면 눌러도 되는 줄 알고 누른다
                        background: (!canMake || needCharge) ? '#d4d4d8' : '#22c55e',
                        color: '#fff', fontSize: 17, fontWeight: 800,
                        cursor: (!canMake || needCharge) ? 'default' : 'pointer',
                    }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            {needCharge ? '클로버가 모자라요' : <>만들기 <CloverIcon size={18} color="#fff" /> {cost}개</>}
                        </span>
                    </button>
                )}

                {/* 손님에게는 클로버 대신 「오늘 몇 장까지 공짜」를 알려준다 — 대표 지적 0915
                    「클로버가 안보이는데 사진은 만들어지네?」 */}
                {!loading && 손님 && !needCharge && (
                    <p style={{ fontSize: 15, color: '#71717a', margin: '10px 0 0', textAlign: 'center', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                        가입 안 하셔도 클로버 {GUEST_CLOVERS}개로 한 장 만들어 보실 수 있어요.{' '}
                        <Link href="/login" style={{ color: 'var(--진초록)', fontWeight: 800, textDecoration: 'underline' }}>로그인하시면 {SIGNUP_CLOVERS}개를 더 드립니다.</Link>
                    </p>
                )}

                {result && (
                    <div style={{ marginTop: 26 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#18181b', marginBottom: 10 }}>다 됐어요</div>
                        {compareWithOriginal && preview ? (
                            <>
                                <p style={{ fontSize: 15, color: '#71717a', margin: '0 0 12px' }}>가운데 손잡이를 좌우로 끌어보세요.</p>
                                <BeforeAfter before={preview} after={result} ratio="1 / 1" />
                            </>
                        ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={result} alt="만든 사진" style={{ width: '100%', borderRadius: 16, border: '1px solid #e4e4e7' }} />
                        )}

                        {isPreviewResult ? (
                            <div style={{ marginTop: 12, background: '#fff', border: '1px solid #e4e4e7', borderRadius: 14, padding: '18px 18px 16px', textAlign: 'center' }}>
                                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>선명한 사진은 회원만 받을 수 있어요</div>
                                <p style={{ fontSize: 15, color: '#71717a', margin: '0 0 14px', lineHeight: 1.6 }}>
                                    지금 보이는 건 미리보기라 흐릿해요. 로그인하면 원본을 바로 내려받습니다.
                                    <br />
                                    만드신 사진은 48시간 동안 보관해 드려요. 그 안에 받으시면 됩니다.
                                </p>
                                <button onClick={onLogin} style={{
                                    width: '100%', padding: 14, borderRadius: 14, border: 'none',
                                    background: '#1C2321', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
                                }}>로그인하고 원본 받기</button>
                            </div>
                        ) : (
                            <>
                            <a href={result} download={downloadName} onClick={() => 센다('photo_download', { tool: share.path })} style={{
                                display: 'block', marginTop: 12, padding: 14, borderRadius: 14,
                                background: '#18181b', color: '#fff', fontSize: 15, fontWeight: 700,
                                textAlign: 'center', textDecoration: 'none',
                            }}>사진 내려받기</a>
                            <KeepNotice />
                            <ShareTool {...share} />
                            </>
                        )}

                        {/* 손님이 만든 뒤에도 공유할 수 있게 — 2026-09-15
                            여기가 가장 퍼지기 좋은 순간인데 미리보기일 때만 공유 칸이 없었다 */}
                        {isPreviewResult && <ShareTool {...share} />}
                    </div>
                )}
            </div>
        </div>
    )
}
