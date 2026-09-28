'use client'
/**
 * 「앱으로 설치」 안내 (밝은 화면용).
 *
 * 대표 지시 0923 「앱 설치 아주 좋아. 이거 조금 더 보여지게. 클로버 70% 할인중 모달보다 훨 나으니 바꿔」
 * → 옛 「클로버 최대 70퍼센트 할인 중」 띠(MembershipBanner)를 이 안내로 바꿨다.
 * 대표 승인 0928 사용성 10번: 첫 방문에는 띄우지 않는다. 두 번째 방문부터, 또는 봇과 첫 대화를 끝낸 뒤에
 *   화면을 가리는 창 대신 아래 작은 띠로 보인다. 「방법 보기」를 누르면 그 자리에서 설치 순서가 펼쳐진다.
 *
 * 기기 판별·설치 단추는 봇 팀 화면의 InstallPrompt(pwa/InstallPrompt.tsx)와 같은 함수를 쓴다.
 *   아이폰, 아이패드 = 공유 → 홈 화면에 추가 / 안드로이드, 크롬, 엣지 = 설치 단추 / 맥 크롬 = 주소창 설치 아이콘 / 맥 사파리 = 파일 → Dock에 추가
 * 규칙(install-rules.ts): 하루 1회만. 이미 앱으로 열려 있거나 설치가 끝났으면 다시 안 뜬다.
 * 이 화면은 밝은 톤이라 [data-theme="os"] 토큰을 안 쓰고 색을 직접 적는다.
 */
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { detectKind, isStandalone, type BeforeInstallPromptEvent, type Kind } from './InstallPrompt'
import { INSTALL_KEYS, countVisit, readInstallGate, shouldShowInstall } from './install-rules'

export default function InstallModal() {
    const [kind, setKind] = useState<Kind | null>(null)
    const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
    const [보임, set보임] = useState(false)
    const [펼침, set펼침] = useState(false)

    useEffect(() => {
        let local: Storage | null = null
        let session: Storage | null = null
        try { local = window.localStorage; session = window.sessionStorage } catch { /* 저장소 막힘 = 방문 0 으로 보고 안 띄운다 */ }
        const 오늘 = new Date().toDateString()
        const visits = countVisit(local, session)
        const gate = readInstallGate(local, 오늘, isStandalone(), visits)
        if (!shouldShowInstall(gate)) return

        // 첫 그림 뒤 한 박자 늦게 판별한다(서버 그림과 어긋나지 않게). 처음 오신 분 안내와 겹치지 않게 조금 기다린다
        const timer = window.setTimeout(() => {
            setKind(detectKind())
            set보임(true)
            try { local?.setItem(INSTALL_KEYS.shownOn, 오늘) } catch { /* 무시 */ }
        }, 1500)

        const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); setKind('button') }
        const onInstalled = () => {
            try { local?.setItem(INSTALL_KEYS.installed, '1') } catch { /* 무시 */ }
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
                try { localStorage.setItem(INSTALL_KEYS.installed, '1') } catch { /* 무시 */ }
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

    const 바로설치 = kind === 'button' && !!deferred

    return (
        <div
            role="region"
            aria-label="앱으로 설치하기"
            className="curi-install-bar"
            style={{
                position: 'fixed', left: '50%', transform: 'translateX(-50%)',
                width: 440, maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100dvh - 120px)', overflowY: 'auto',
                background: '#fff', borderRadius: 18, padding: '12px 12px 12px 14px', zIndex: 90,
                border: '1px solid #e4e4e7', boxShadow: '0 10px 30px rgba(0,0,0,0.14)', wordBreak: 'keep-all',
            }}
        >
            <style>{`
                .curi-install-bar { bottom: calc(16px + env(safe-area-inset-bottom)); }
                @media (max-width: 768px) { .curi-install-bar { bottom: calc(78px + env(safe-area-inset-bottom)); } }
            `}</style>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Image src="/icons/curi-192.png" alt="" width={40} height={40} style={{ borderRadius: 10, flex: 'none' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#18181b', lineHeight: 1.3 }}>큐리AI를 앱으로 설치해요</div>
                    <div style={{ fontSize: 15, color: '#52525b', lineHeight: 1.4 }}>홈 화면에서 한 번 눌러 바로 열어요</div>
                </div>
                <button
                    type="button"
                    onClick={바로설치 ? 설치 : () => set펼침(v => !v)}
                    aria-expanded={바로설치 ? undefined : 펼침}
                    style={{
                        flex: 'none', minHeight: 44, padding: '0 14px', borderRadius: 12, border: 'none',
                        background: '#22c55e', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer',
                    }}
                >
                    {바로설치 ? '설치' : 펼침 ? '접기' : '방법 보기'}
                </button>
                <button
                    type="button"
                    onClick={닫기}
                    aria-label="설치 안내 닫기"
                    style={{ flex: 'none', width: 44, height: 44, borderRadius: 12, border: 'none', background: 'transparent', color: '#52525b', fontSize: 20, cursor: 'pointer' }}
                >
                    ✕
                </button>
            </div>

            {펼침 && !바로설치 && (
                <div style={{ marginTop: 12 }}>
                    <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
                        {걸음.map((w) => (
                            <li key={w.번호} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 16, lineHeight: 1.5, color: '#18181b' }}>
                                <b style={{
                                    flex: 'none', width: 28, height: 28, borderRadius: '50%', background: '#22c55e', color: '#fff',
                                    fontWeight: 800, fontSize: 15, display: 'grid', placeItems: 'center',
                                }}>{w.번호}</b>
                                <span>
                                    {w.글}
                                    {w.작게 && <><br /><small style={{ fontSize: 15, color: '#52525b' }}>{w.작게}</small></>}
                                </span>
                            </li>
                        ))}
                    </ol>
                    {kind === 'ios' && (
                        <p style={{ fontSize: 15, color: '#52525b', margin: '12px 0 0', lineHeight: 1.5, textAlign: 'left', background: '#f4f4f5', borderRadius: 12, padding: '10px 12px' }}>
                            크롬 앱으로 열었다면 사파리로 다시 열어 주세요. 아이폰은 사파리에서만 홈 화면에 넣을 수 있어요.
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}
