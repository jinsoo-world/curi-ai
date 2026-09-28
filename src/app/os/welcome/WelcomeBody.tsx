'use client'
// 손님용 첫 화면 몸통. 손님 = 4060 강사, 작가, 크리에이터. 글자 17px 이상, 단추 52px 이상, 색은 [data-theme="os"] 토큰만.
// OsShell 은 이 주소에서 뼈대(왼쪽 명단)를 그리지 않는다 → 여기서 data-theme 을 직접 씌운다. 글자는 전부 사전(i18n)에서.

import Link from 'next/link'
import BotAvatar from '@/components/os/BotAvatar'
import { KakaoMark, GoogleMark } from '@/components/brand/SocialMarks'
import { useLocale } from '@/components/os/LocaleProvider'
import { JOBS } from '@/domains/os/presets'
import type { TKey } from '@/domains/os/i18n'
import './welcome.css'

// 첫 화면에 세울 봇 3명 = 프리셋 그대로 (답장봇, 글감봇, 비서실장). 이름과 한 줄은 언어별 사전에서
const SHOWCASE = [
    { job: 'planning_lead', state: 'talking' as const },
    { job: 'marketing_lead', state: 'thinking' as const },
    { job: 'dev_lead', state: 'idle' as const },
    { job: 'research_lead', state: 'idle' as const },
].map(s => ({ ...s, preset: JOBS.find(j => j.id === s.job) })).filter((s): s is typeof s & { preset: NonNullable<typeof s.preset> } => !!s.preset)

/** 사전 글의 줄바꿈(\n)을 <br /> 로 */
function Lines({ text }: { text: string }) {
    const parts = text.split('\n')
    return <>{parts.map((p, i) => <span key={i}>{i > 0 && <br />}{p}</span>)}</>
}

export default function WelcomeBody() {
    const { t } = useLocale()
    return (
        <main className="wel" data-theme="os">
            {/* ① 첫 화면(폰 한 장) 안에 제목, 한 줄 설명, 「카카오로 시작」, 「먼저 둘러보기」 (대표 승인 0928 사용성 3번).
                봇 얼굴은 그 아래 작게 한 줄. 긴 설명은 얼굴 아래로 내렸다 */}
            <section className="wel-sec wel-hero">
                <p className="wel-kicker">{t('wel.kicker')}</p>
                <h1 className="wel-h1"><Lines text={t('wel.h1short')} /></h1>
                <Link href="/login?next=%2Fos&provider=kakao" className="wel-cta wel-cta-kakao"><KakaoMark size={22} /><span>{t('wel.ctaKakao')}</span></Link>
                {/* 위계 (대표 0928): 카카오 = 구글(같은 크기, 바로 아래) > 먼저 둘러보기(작은 글자 단추) */}
                <Link href="/login?next=%2Fos&provider=google" className="wel-google wel-google-wide"><GoogleMark size={22} /><span>{t('wel.ctaGoogle')}</span></Link>
                <Link href="/os?demo=1" className="wel-tour">{t('wel.tour')}</Link>
                <div className="wel-bots" aria-hidden>
                    {SHOWCASE.map(s => (
                        <div key={s.job} className="wel-bot">
                            <BotAvatar shape={s.preset.shape} color={s.preset.color} state={s.state} size={56} />
                            <span className="wel-bot-name">{t(`wel.bot.${s.job}` as TKey)}</span>
                        </div>
                    ))}
                </div>
                <p className="wel-team">{t('wel.team')}</p>
            </section>

            {/* ③ 시작은 봇 하나, 일 하나 */}
            <section className="wel-sec wel-last">
                <h2 className="wel-h2">{t('wel.h3')}</h2>
                <p className="wel-p">{t('wel.p3')}</p>
                <ol className="wel-steps">
                    <li><b>1</b><span>{t('wel.step1')}</span></li>
                    <li><b>2</b><span>{t('wel.step3')}</span></li>
                </ol>
                <p className="wel-p">{t('wel.p4')}</p>
                <Link href="/login?next=%2Fos&provider=kakao" className="wel-cta wel-cta-kakao"><KakaoMark size={22} /><span>{t('wel.ctaKakao')}</span></Link>
                <Link href="/login?next=%2Fos&provider=google" className="wel-google wel-google-wide"><GoogleMark size={22} /><span>{t('wel.ctaGoogle')}</span></Link>
                <Link href="/os?demo=1" className="wel-tour">{t('wel.tour')}</Link>
                <p className="wel-foot">
                    <Link href="/terms">{t('wel.terms')}</Link>
                    <Link href="/privacy">{t('wel.privacy')}</Link>
                </p>
            </section>
        </main>
    )
}
