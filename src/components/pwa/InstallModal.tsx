'use client'
/**
 * 「앱으로 설치」 안내 창 (밝은 화면용). 첫 방문에 뜬다.
 *
 * 대표 지시 0923 「앱 설치 아주 좋아. 이거 조금 더 보여지게. 클로버 70% 할인중 모달보다 훨 나으니 바꿔」
 * → 옛 「클로버 최대 70퍼센트 할인 중」 띠(MembershipBanner)를 이 창으로 바꿨다.
 *
 * 기기 판별·설치 단추는 봇 팀 화면의 InstallPrompt(pwa/InstallPrompt.tsx)와 같은 함수를 쓴다.
 *   아이폰, 아이패드 = 공유 → 홈 화면에 추가 / 안드로이드, 크롬, 엣지 = 설치 단추 / 맥 크롬 = 주소창 설치 아이콘 / 맥 사파리 = 파일 → Dock에 추가
 * 규칙: 하루 1회만 뜬다. 이미 앱으로 열려 있거나 설치가 끝났으면 다시 안 뜬다.
 * 이 화면은 밝은 톤이라 [data-theme="os"] 토큰을 안 쓰고 색을 직접 적는다.
 */
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { detectKind, isStandalone, type BeforeInstallPromptEvent, type Kind } from './InstallPrompt'

/** 오늘 이미 보였는가 (날짜 글자) */
const 오늘열쇠 = 'curi.installModal.shownOn'
/** 설치를 끝냈다는 표. 이게 있으면 영영 안 뜬다 */
const 설치끝열쇠 = 'curi.installModal.installed'

export default function InstallModal() {
    const [kind, setKind] = useState<Kind | null>(null)
    const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
    const [보임, set보임] = useState(false)

    useEffect(() => {
        if (isStandalone()) return
        try {
            if (localStorage.getItem(설치끝열쇠)) return
            const 오늘 = new Date().toDateString()
            if (localStorage.getItem(오늘열쇠) === 오늘) return
        } catch { /* 저장소를 못 읽는 브라우저면 그냥 띄운다 */ }

        // 첫 그림 뒤 한 박자 늦게 판별한다(서버 그림과 어긋나지 않게). 처음 오신 분 안내와 겹치지 않게 조금 기다린다
        const timer = window.setTimeout(() => {
            setKind(detectKind())
            set보임(true)
            try { localStorage.setItem(오늘열쇠, new Date().toDateString()) } catch { /* 무시 */ }
        }, 1200)

        const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); setKind('button') }
        const onInstalled = () => {
            try { localStorage.setItem(설치끝열쇠, '1') } catch { /* 무시 */ }
            set보임(false)
        }
        window.addEventListener('beforeinstallprompt', onPrompt)
        window.addEventListener('appinstalled', onInstalled)
        return () => {
            window.clearTimeout(timer)
            window.removeEventListener('beforeinstallprompt', onPrompt)
            window.removeEventListener('appinstalled', onInstalled)
        }
    }, [])

    if (!보임 || !kind) return null

    const 닫기 = () => set보임(false)

    const 설치 = async () => {
        if (kind === 'button' && deferred) {
            await deferred.prompt()
            const { outcome } = await deferred.userChoice
            setDeferred(null)
            if (outcome === 'accepted') {
                try { localStorage.setItem(설치끝열쇠, '1') } catch { /* 무시 */ }
                set보임(false)
            }
        }
    }

    const 걸음: { 번호: number; 글: string; 작게?: string }[] =
        kind === 'ios'
            ? [
                { 번호: 1, 글: '화면 아래(또는 위) 공유 단추를 눌러요.', 작게: '네모에서 화살표가 위로 나가는 모양이에요.' },
                { 번호: 2, 글: '목록을 조금 내려 「홈 화면에 추가」를 눌러요.' },
                { 번호: 3, 글: '오른쪽 위 「추가」를 눌러요.', 작게: '홈 화면에 초록 클로버 「큐리AI」가 생겨요.' },
            ]
            : kind === 'mac-safari'
                ? [
                    { 번호: 1, 글: '위 메뉴 파일 → Dock에 추가를 눌러요.' },
                    { 번호: 2, 글: '이름이 「큐리AI」인지 보고 「추가」를 눌러요.' },
                ]
                : [
                    { 번호: 1, 글: '주소창 오른쪽 끝 설치 아이콘(모니터에 화살표) 또는 메뉴 ⋮ → 「큐리AI 설치」를 눌러요.' },
                    { 번호: 2, 글: '「설치」를 눌러요.' },
                ]

    return (
        <>
            <div onClick={닫기} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100 }} />
            <div
                role="dialog"
                aria-modal="true"
                aria-label="앱으로 설치하기"
                style={{
                    position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                    width: 380, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto',
                    background: '#fff', borderRadius: 24, padding: '30px 24px 24px', zIndex: 101,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.18)', textAlign: 'center', wordBreak: 'keep-all',
                }}
            >
                <Image src="/icons/curi-192.png" alt="" width={72} height={72} style={{ borderRadius: 18, margin: '0 auto 14px', display: 'block' }} />
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#18181b', margin: '0 0 8px', lineHeight: 1.3 }}>
                    큐리AI를 앱으로 설치해요
                </h2>
                <p style={{ fontSize: 15.5, color: '#52525b', margin: '0 0 18px', lineHeight: 1.6 }}>
                    홈 화면에서 한 번 눌러 바로 열고, 봇이 답하면 알림으로 받아요.
                </p>

                {kind === 'button' && deferred ? (
                    <button
                        type="button"
                        onClick={설치}
                        style={{
                            width: '100%', padding: 16, borderRadius: 16, border: 'none',
                            background: '#22c55e', color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer',
                        }}
                    >
                        앱으로 설치
                    </button>
                ) : (
                    <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
                        {걸음.map((w) => (
                            <li key={w.번호} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 16, lineHeight: 1.5, color: '#18181b' }}>
                                <b style={{
                                    flex: 'none', width: 30, height: 30, borderRadius: '50%', background: '#22c55e', color: '#fff',
                                    fontWeight: 800, fontSize: 15, display: 'grid', placeItems: 'center',
                                }}>{w.번호}</b>
                                <span>
                                    {w.글}
                                    {w.작게 && <><br /><small style={{ fontSize: 13.5, color: '#71717a' }}>{w.작게}</small></>}
                                </span>
                            </li>
                        ))}
                    </ol>
                )}
                {kind === 'ios' && (
                    <p style={{ fontSize: 13.5, color: '#71717a', margin: '14px 0 0', lineHeight: 1.5, textAlign: 'left', background: '#f4f4f5', borderRadius: 12, padding: '10px 12px' }}>
                        크롬 앱으로 열었다면 사파리로 다시 열어 주세요. 아이폰은 사파리에서만 홈 화면에 넣을 수 있어요.
                    </p>
                )}

                <button
                    type="button"
                    onClick={닫기}
                    style={{ marginTop: 16, background: 'none', border: 'none', color: '#a1a1aa', fontSize: 14.5, fontWeight: 600, cursor: 'pointer', padding: 8 }}
                >
                    다음에 할게요
                </button>
            </div>
        </>
    )
}
