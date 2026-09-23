'use client'
// 손님용 첫 화면 몸통. 손님 = 4060 강사, 작가, 크리에이터. 글자 17px 이상, 단추 52px 이상, 색은 [data-theme="os"] 토큰만.
// OsShell 은 이 주소에서 뼈대(왼쪽 명단)를 그리지 않는다 → 여기서 data-theme 을 직접 씌운다. 글자는 전부 사전(i18n)에서.

import Link from 'next/link'
import BotAvatar from '@/components/os/BotAvatar'
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
            {/* ① 이름 있는 봇 팀 */}
            <section className="wel-sec wel-hero">
                <div className="wel-bots" aria-hidden>
                    {SHOWCASE.map(s => (
                        <div key={s.job} className="wel-bot">
                            <BotAvatar shape={s.preset.shape} color={s.preset.color} state={s.state} size={96} />
                            <span className="wel-bot-name">{t(`wel.bot.${s.job}` as TKey)}</span>
                            <span className="wel-bot-line">{t(`wel.bot.${s.job}.line` as TKey)}</span>
                        </div>
                    ))}
                </div>
                <p className="wel-kicker">{t('wel.kicker')}</p>
                <h1 className="wel-h1"><Lines text={t('wel.h1')} /></h1>
                <p className="wel-p">{t('wel.p1')}</p>
                <Link href="/login?next=/os" className="wel-cta">{t('wel.cta')}</Link>
                <Link href="/os?demo=1" className="wel-sub">{t('wel.tour')}</Link>
            </section>

            {/* ② 승인 카드 */}
            <section className="wel-sec">
                <h2 className="wel-h2"><Lines text={t('wel.h2')} /></h2>
                <p className="wel-p">{t('wel.p2')}</p>
                <div className="wel-card" role="img" aria-label={t('wel.cardAria')}>
                    <div className="wel-card-head">
                        <BotAvatar shape="circle" color="orange" state="waiting_approval" size={40} />
                        <div>
                            <div className="wel-card-title">{t('wel.cardTitle')}</div>
                            <div className="wel-card-sub">{t('wel.cardSub')}</div>
                        </div>
                    </div>
                    <div className="wel-card-preview">
                        {t('wel.cardPreview')}
                        <span className="wel-card-more">{t('wel.cardMore')}</span>
                    </div>
                    <div className="wel-card-btns" aria-hidden>
                        <span className="wel-card-btn ok">{t('wel.allow')}</span>
                        <span className="wel-card-btn">{t('wel.deny')}</span>
                        <span className="wel-card-btn">{t('wel.editAllow')}</span>
                    </div>
                </div>
                <p className="wel-note">{t('wel.note')}</p>
            </section>

            {/* ③ 시작은 봇 하나, 일 하나 */}
            <section className="wel-sec wel-last">
                <h2 className="wel-h2">{t('wel.h3')}</h2>
                <p className="wel-p">{t('wel.p3')}</p>
                <ol className="wel-steps">
                    <li><b>1</b><span>{t('wel.step1')}</span></li>
                    <li><b>2</b><span>{t('wel.step2')}</span></li>
                    <li><b>3</b><span>{t('wel.step3')}</span></li>
                </ol>
                <p className="wel-p">{t('wel.p4')}</p>
                <Link href="/login?next=/os" className="wel-cta">{t('wel.cta')}</Link>
                <Link href="/os?demo=1" className="wel-sub">{t('wel.tour')}</Link>
                <p className="wel-foot">
                    <Link href="/terms">{t('wel.terms')}</Link>
                    <Link href="/privacy">{t('wel.privacy')}</Link>
                </p>
            </section>
        </main>
    )
}
