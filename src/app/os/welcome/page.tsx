// 손님용 첫 화면 (/os/welcome) = 큐리AI 가 무엇인지 3화면 분량을 한 페이지에.
// 손님 = 4060 강사·작가·크리에이터. 글자 17px 이상, 단추 52px 이상, 색은 [data-theme="os"] 토큰만.
// OsShell 은 이 주소에서 뼈대(왼쪽 명단)를 그리지 않는다 → 여기서 data-theme 을 직접 씌운다.

import type { Metadata } from 'next'
import Link from 'next/link'
import BotAvatar from '@/components/os/BotAvatar'
import { JOBS } from '@/domains/os/presets'
import './welcome.css'

export const metadata: Metadata = {
    title: '큐리AI, 내 봇 팀',
    description: '이름 있는 AI 팀원(봇)이 내 자료로 답하고 초안을 만듭니다. 밖으로 나가는 일은 내가 허용한 뒤에만.',
    robots: { index: true },   // 손님이 처음 밟는 소개 화면이라 검색에 올린다
}

// 첫 화면에 세울 봇 3명 = 프리셋 그대로 (답장봇·글감봇·비서실장)
const SHOWCASE = [
    { job: 'fan_reply', name: '답장봇', state: 'talking' as const },
    { job: 'content_ideas', name: '글감봇', state: 'thinking' as const },
    { job: 'chief', name: '비서실장', state: 'idle' as const },
].map(s => ({ ...s, preset: JOBS.find(j => j.id === s.job)! }))

export default function WelcomePage() {
    return (
        <main className="wel" data-theme="os">
            {/* ① 이름 있는 봇 팀 */}
            <section className="wel-sec wel-hero">
                <div className="wel-bots" aria-hidden>
                    {SHOWCASE.map(s => (
                        <div key={s.job} className="wel-bot">
                            <BotAvatar shape={s.preset.shape} color={s.preset.color} state={s.state} size={96} />
                            <span className="wel-bot-name">{s.name}</span>
                            <span className="wel-bot-line">{s.preset.oneLiner}</span>
                        </div>
                    ))}
                </div>
                <p className="wel-kicker">큐리AI</p>
                <h1 className="wel-h1">이름 있는 AI 팀원(봇)이<br />내 자료로 답하고 초안을 만들어요</h1>
                <p className="wel-p">
                    강의 자료, 써 둔 글, 유튜브 원고를 올려 두면 봇이 그 안에서만 답합니다.
                    팬 질문 답장, 이번 주 글감, 자료 요약 같은 일을 봇 하나가 하나씩 맡아요.
                    자료에 없는 건 지어내지 않고 「제가 가진 자료에는 없어요」라고 말합니다.
                </p>
                <Link href="/login?next=/os" className="wel-cta">카카오/구글로 시작</Link>
                <Link href="/os?demo=1" className="wel-sub">먼저 둘러보기</Link>
            </section>

            {/* ② 승인 카드 */}
            <section className="wel-sec">
                <h2 className="wel-h2">밖으로 나가는 건<br />내가 허용한 뒤에만</h2>
                <p className="wel-p">
                    정리하고 요약하고 초안 쓰는 일은 봇이 알아서 끝냅니다.
                    하지만 메시지를 보내거나, 글을 올리거나, 돈이 움직이는 일은 이 카드가 먼저 뜹니다.
                    허용을 누르기 전에는 한 글자도 밖으로 나가지 않아요.
                </p>
                <div className="wel-card" role="img" aria-label="승인 카드 예시. 팬 3명에게 답장 보내기. 허용, 거절, 고쳐서 허용 단추">
                    <div className="wel-card-head">
                        <BotAvatar shape="circle" color="orange" state="waiting_approval" size={40} />
                        <div>
                            <div className="wel-card-title">답장봇이 허락을 기다려요</div>
                            <div className="wel-card-sub">팬 3명에게 답장 보내기</div>
                        </div>
                    </div>
                    <div className="wel-card-preview">
                        「질문 주셔서 감사해요. 강의 영상은 마이페이지에서 다시 볼 수 있어요. 안 보이면 저한테 바로 말씀 주세요.」
                        <span className="wel-card-more">외 2건</span>
                    </div>
                    <div className="wel-card-btns" aria-hidden>
                        <span className="wel-card-btn ok">허용</span>
                        <span className="wel-card-btn">거절</span>
                        <span className="wel-card-btn">고쳐서 허용</span>
                    </div>
                </div>
                <p className="wel-note">카드에 답한 기록은 전부 남아요. 언제 무엇을 허용했는지 나중에 다시 볼 수 있습니다.</p>
            </section>

            {/* ③ 시작은 봇 하나, 일 하나 */}
            <section className="wel-sec wel-last">
                <h2 className="wel-h2">시작은 봇 하나, 일 하나</h2>
                <p className="wel-p">
                    처음엔 내가 매일 말하는 한 명만 만들면 됩니다. 칩 세 번만 누르면 끝나요.
                </p>
                <ol className="wel-steps">
                    <li><b>1</b><span>이 봇이 맡을 일 한 가지를 고른다</span></li>
                    <li><b>2</b><span>어디까지 알아서 할지 정한다. 기본은 「보내기 전 항상 물어봐」</span></li>
                    <li><b>3</b><span>모양과 색을 고르고 이름을 붙인다</span></li>
                </ol>
                <p className="wel-p">만들자마자 봇이 첫 인사를 하고, 30초면 확인할 수 있는 첫 일을 추천해 줍니다.</p>
                <Link href="/login?next=/os" className="wel-cta">카카오/구글로 시작</Link>
                <Link href="/os?demo=1" className="wel-sub">먼저 둘러보기</Link>
                <p className="wel-foot">
                    <Link href="/terms">이용약관</Link>
                    <Link href="/privacy">개인정보 처리방침</Link>
                </p>
            </section>
        </main>
    )
}
