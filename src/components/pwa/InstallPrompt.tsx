'use client'
// 「📱 앱으로 설치」 안내. 기기마다 설치 길이 달라서 셋으로 나눈다.
//   1) 크롬·안드로이드·맥 크롬·엣지 = 브라우저가 beforeinstallprompt 를 주면 단추 하나로 설치
//   2) 아이폰·아이패드 사파리     = 설치 단추가 없다. 「공유 → 홈 화면에 추가」 3걸음을 큰 글씨로
//   3) 맥 사파리                   = 「파일 → Dock에 추가」 한 줄
// 이미 앱으로 열려 있으면(standalone) 아무것도 그리지 않는다.
// 좁은 화면(폰)에서는 왼쪽 명단이 접히므로 아래 띠로 뜨고, 닫으면 7일 동안 다시 안 뜬다.

import { useEffect, useState } from 'react'
import './pwa.css'

type Kind = 'button' | 'ios' | 'mac-safari' | 'other'

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const HIDE_KEY = 'curi-install-hide-until'

function isStandalone(): boolean {
    if (typeof window === 'undefined') return false
    const nav = window.navigator as Navigator & { standalone?: boolean }
    return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

function detectKind(): Kind {
    const ua = navigator.userAgent
    const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
    if (iOS) return 'ios'
    const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua)
    if (/Macintosh/.test(ua) && isSafari) return 'mac-safari'
    return 'other'
}

export default function InstallPrompt() {
    const [kind, setKind] = useState<Kind | null>(null)         // null = 아직 모름(서버) 또는 그릴 필요 없음
    const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
    const [guide, setGuide] = useState(false)
    const [hidden, setHidden] = useState(false)

    useEffect(() => {
        if (isStandalone()) return
        // 기기 판별은 브라우저에서만 할 수 있어 첫 그림 뒤 한 박자 늦게 정한다(서버 그림과 어긋나지 않게)
        const timer = window.setTimeout(() => {
            try {
                const until = Number(localStorage.getItem(HIDE_KEY) || 0)
                if (until > Date.now()) setHidden(true)
            } catch { /* 저장소 못 쓰면 그냥 보여준다 */ }
            setKind(detectKind())
        }, 0)

        const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); setKind('button') }
        const onInstalled = () => { setKind(null); setDeferred(null) }
        window.addEventListener('beforeinstallprompt', onPrompt)
        window.addEventListener('appinstalled', onInstalled)
        return () => {
            window.clearTimeout(timer)
            window.removeEventListener('beforeinstallprompt', onPrompt)
            window.removeEventListener('appinstalled', onInstalled)
        }
    }, [])

    if (!kind || hidden) return null
    // 설치 단추도 없고 안내할 말도 없는 브라우저(파이어폭스 등)는 그리지 않는다
    if (kind === 'other' && !deferred) return null

    const install = async () => {
        if (kind === 'button' && deferred) {
            await deferred.prompt()
            const { outcome } = await deferred.userChoice
            if (outcome === 'accepted') setKind(null)
            setDeferred(null)
            return
        }
        setGuide(true)
    }

    const dismiss = () => {
        try { localStorage.setItem(HIDE_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000)) } catch { /* 무시 */ }
        setHidden(true)
    }

    const label = kind === 'button' ? '앱으로 설치' : kind === 'ios' ? '홈 화면에 추가하는 법' : 'Dock에 추가하는 법'

    return (
        <>
            <div className="pwa-install" role="region" aria-label="앱으로 설치">
                <button type="button" className="pwa-install-btn" onClick={install}>
                    <span aria-hidden>📱</span>
                    <span className="pwa-install-text">
                        <b>앱으로 설치</b>
                        <small>{label}</small>
                    </span>
                </button>
                <button type="button" className="pwa-install-x" aria-label="7일 동안 닫기" title="7일 동안 닫기" onClick={dismiss}>×</button>
            </div>

            {guide && (
                <div className="os-sheet-back" onClick={() => setGuide(false)}>
                    <div className="os-sheet pwa-guide" role="dialog" aria-modal="true" aria-label="앱으로 설치하는 법" onClick={e => e.stopPropagation()}>
                        <h3>앱처럼 설치하기</h3>
                        {kind === 'ios' && (
                            <>
                                <div className="os-step">아이폰·아이패드 사파리에서 세 번만 누르면 끝나요.</div>
                                <ol className="pwa-steps">
                                    <li><b>1</b><span>화면 아래(또는 위) <b>공유 단추</b> <span aria-hidden>⎋</span>를 눌러요.<br /><small>네모에서 화살표가 위로 나가는 모양이에요.</small></span></li>
                                    <li><b>2</b><span>목록을 조금 내려 <b>「홈 화면에 추가」</b>를 눌러요.</span></li>
                                    <li><b>3</b><span>오른쪽 위 <b>「추가」</b>를 눌러요.<br /><small>홈 화면에 초록 네잎클로버 「큐리AI」가 생겨요.</small></span></li>
                                </ol>
                                <div className="pwa-note">크롬 앱으로 열었다면 사파리로 다시 열어 주세요. 아이폰은 사파리에서만 홈 화면에 넣을 수 있어요.</div>
                            </>
                        )}
                        {kind === 'mac-safari' && (
                            <>
                                <div className="os-step">맥 사파리는 메뉴 한 번이면 돼요.</div>
                                <ol className="pwa-steps">
                                    <li><b>1</b><span>위 메뉴 <b>파일 → Dock에 추가…</b>를 눌러요.</span></li>
                                    <li><b>2</b><span>이름이 「큐리AI」인지 보고 <b>「추가」</b>를 눌러요.</span></li>
                                </ol>
                                <div className="pwa-note">Dock(화면 아래 아이콘 줄)에 큐리AI가 생기고, 앱처럼 따로 창이 열려요.</div>
                            </>
                        )}
                        {(kind === 'button' || kind === 'other') && (
                            <>
                                <div className="os-step">크롬·엣지에서는 주소창 오른쪽 끝 설치 아이콘을 눌러도 돼요.</div>
                                <ol className="pwa-steps">
                                    <li><b>1</b><span>주소창 오른쪽 끝 <b>설치 아이콘</b>(모니터에 화살표) 또는 메뉴 ⋮ → <b>「큐리AI 설치」</b></span></li>
                                    <li><b>2</b><span><b>「설치」</b>를 눌러요.</span></li>
                                </ol>
                            </>
                        )}
                        <div className="os-sheet-foot" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" className="os-btn primary" onClick={() => setGuide(false)}>알겠어요</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
