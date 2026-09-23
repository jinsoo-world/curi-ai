'use client'
// /landing 몸통 — 대표 지시 2026-09-23 「delphi.ai 흐름 + 21st.dev uilayout 컴포넌트로 새 랜딩」.
//
// 흐름(델파이에서 구조만 가져옴, 문장·이미지는 안 베낌):
//   히어로(한 줄 약속+데모) → 작동 방식 3단계 → 사례 → 안전 → 가격 요약 → 앱 설치 → 마지막 CTA → 푸터
// 모양(21st.dev uilayout): 배지 pill + 그라데이션 강조 헤드라인의 히어로, 번호 큰 스텝 카드, bento 카드 그리드,
// 가격 카드 3장, 심플 푸터. 실제 소스는 로그인(계정 생성) 없인 못 긁어(레지스트리 403) — 로그인 없이 열리는
// cdn.21st.dev 미리보기 렌더링으로 구조만 확인하고 우리 손으로 다시 짰다(자세한 내막은 커밋/보고에).
//
// 첫 화면(/)은 그대로 /studio 로 보낸다 — 이 페이지 교체는 대표 확인 후.
import Link from 'next/link'
import BotAvatar from '@/components/os/BotAvatar'
import BizFooter from '@/components/BizFooter'
import { PLANS } from '@/domains/os/plan'
import { JOBS } from '@/domains/os/presets'
import './landing.css'

const 기획 = JOBS.find(j => j.id === 'planning_lead')!
const 홍보 = JOBS.find(j => j.id === 'marketing_lead')!
const 개발 = JOBS.find(j => j.id === 'dev_lead')!

// 조사팀장 = 대표 지시 문구. 표준 JOBS엔 없어 자료 요약 봇(lecture_digest) 모양을 빌려 온다
const 조사 = { shape: 'square' as const, color: 'teal' as const, oneLiner: '자료를 찾아 핵심을 정리해요' }

const TEAM = [
    { name: '기획팀장', preset: 기획 },
    { name: '홍보팀장', preset: 홍보 },
    { name: '개발팀장', preset: 개발 },
    { name: '조사팀장', preset: 조사 },
]

const STEPS = [
    { num: '01', title: '자료 넣기', desc: 'PDF, 링크, 유튜브, 내 폴더를 그대로 넣어요.' },
    { num: '02', title: '봇에게 맡기기', desc: '기획, 홍보, 개발, 조사 중 필요한 봇에게 일을 시켜요.' },
    { num: '03', title: '승인 카드로 확인', desc: '밖으로 나가는 일은 승인 카드로 먼저 보고 허락해요.' },
]

const CASES = [
    { shape: 홍보.shape, color: 홍보.color, role: '홍보팀장', text: '「다음 주 화요일 저녁 8시 특강 공지 써 줘. 신청 링크는 프로필에 있다고 해 줘」 → 공지 초안 완성' },
    { shape: 조사.shape, color: 조사.color, role: '조사팀장', text: '「이 블로그 글, 핵심만 5줄로 정리해 줘」 → 요약 초안 완성' },
    { shape: 홍보.shape, color: 홍보.color, role: '홍보팀장', text: '「팬이 보낸 질문에 내 말투로 답장 초안 써 줘」 → 답장 초안 완성' },
]

const SAFETY = [
    { title: '허용해야 나가요', desc: '보내기, 게시, 결제, 삭제는 제가 먼저 확인하고 허락한 뒤에만 움직여요.' },
    { title: '내 자료는 내 것', desc: '제가 올린 자료는 다른 사람 AI 학습에 쓰지 않아요.' },
    { title: '내 계정으로 연결', desc: '노션, 슬랙 같은 연결은 제 계정 권한 안에서만 움직여요.' },
]

function formatWon(v: number) {
    return v === 0 ? '무료' : `월 ${v.toLocaleString()}원`
}

export default function LandingBody() {
    return (
        <div className="ld" data-theme="os">
            <nav className="ld-nav">
                <div className="ld-nav-inner">
                    <span className="ld-logo">큐리AI</span>
                    <Link href="/os" className="ld-nav-cta">무료로 시작하기</Link>
                </div>
            </nav>

            <main className="ld-wrap">
                {/* 히어로 */}
                <section className="ld-hero">
                    <span className="ld-badge">AI 봇 팀</span>
                    <h1 className="ld-h1">내 일을 나눠 맡는 <em>AI 봇 팀</em></h1>
                    <p className="ld-sub">
                        기획, 홍보, 개발, 조사를 맡은 봇 4명이 내 자료로 초안을 만들고,
                        밖으로 나가는 일은 내가 허용한 뒤에만 해요.
                    </p>
                    <div className="ld-cta-row">
                        <Link href="/os" className="ld-btn ld-btn-primary">내 봇 팀 무료로 시작하기</Link>
                        <Link href="/os/market" className="ld-btn ld-btn-ghost">봇 마켓 둘러보기</Link>
                    </div>

                    <div className="ld-demo" aria-hidden>
                        {TEAM.map(b => (
                            <div key={b.name} className="ld-demo-card">
                                <BotAvatar shape={b.preset.shape} color={b.preset.color} state="idle" size={72} />
                                <span className="ld-demo-name">{b.name}</span>
                                <span className="ld-demo-line">{b.preset.oneLiner}</span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 작동 방식 3단계 */}
                <section className="ld-section">
                    <p className="ld-section-kicker">작동 방식</p>
                    <h2 className="ld-h2">세 걸음이면 끝나요</h2>
                    <div className="ld-steps">
                        {STEPS.map(s => (
                            <div key={s.num} className="ld-step">
                                <span className="ld-step-num" aria-hidden>{s.num}</span>
                                <div className="ld-step-title">{s.title}</div>
                                <div className="ld-step-desc">{s.desc}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 사례 3개 */}
                <section className="ld-section">
                    <p className="ld-section-kicker">쓰는 모습</p>
                    <h2 className="ld-h2">이렇게 씁니다</h2>
                    <div className="ld-cases">
                        {CASES.map((c, i) => (
                            <div key={i} className="ld-case">
                                <div className="ld-case-top">
                                    <BotAvatar shape={c.shape} color={c.color} state="talking" size={40} />
                                    <span className="ld-case-role">{c.role}</span>
                                </div>
                                <div className="ld-case-bubble">{c.text}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 안전 */}
                <section className="ld-section">
                    <p className="ld-section-kicker">안전</p>
                    <h2 className="ld-h2">밖으로 나가는 건 제가 정해요</h2>
                    <div className="ld-safety">
                        {SAFETY.map(s => (
                            <div key={s.title} className="ld-safe-item">
                                <div className="ld-safe-icon" aria-hidden>✓</div>
                                <div className="ld-safe-title">{s.title}</div>
                                <div className="ld-safe-desc">{s.desc}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 가격 요약 — 숫자는 손으로 안 적고 요금제 표(PLANS)에서 그대로 읽는다 */}
                <section className="ld-section">
                    <p className="ld-section-kicker">가격</p>
                    <h2 className="ld-h2">가격 요약</h2>
                    <div className="ld-pricing">
                        {PLANS.map(p => (
                            <div key={p.id} className={`ld-price-card${p.recommended ? ' recommended' : ''}`}>
                                {p.recommended && <span className="ld-price-badge">가장 많이 골라요</span>}
                                <div className="ld-price-name">{p.name}</div>
                                <div className="ld-price-amount">{formatWon(p.price)}</div>
                                <ul className="ld-price-perks">
                                    {p.perks.slice(0, 3).map(perk => <li key={perk}>{perk}</li>)}
                                </ul>
                            </div>
                        ))}
                    </div>
                    <p className="ld-price-more"><Link href="/os/charge">자세히 보기 →</Link></p>
                </section>

                <p className="ld-install">
                    아이폰·안드로이드 홈 화면에 추가하면 앱처럼 바로 열려요.
                </p>

                {/* 마지막 CTA */}
                <section className="ld-final">
                    <h2 className="ld-h2">지금 내 봇 팀을 만들어 보세요</h2>
                    <div className="ld-cta-row">
                        <Link href="/os" className="ld-btn ld-btn-primary">내 봇 팀 무료로 시작하기</Link>
                    </div>
                </section>
            </main>

            <footer style={{ borderTop: '1px solid var(--ld-border)', padding: '28px 0' }}>
                <div className="ld-wrap" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', fontSize: 13, color: 'var(--ld-fg-dim)' }}>
                    <Link href="/terms" style={{ color: 'inherit' }}>서비스이용약관</Link>
                    <Link href="/privacy" style={{ color: 'inherit' }}>개인정보처리방침</Link>
                    <Link href="/refund" style={{ color: 'inherit' }}>취소/환불정책</Link>
                </div>
            </footer>

            {/* 사업자 필수표시 — 전자상거래법. 밝은 화면용 컴포넌트라 다크 래퍼 밖(기본 밝은 배경)에 그대로 둔다 */}
            <div style={{ background: 'var(--종이)', padding: '1px 20px' }}>
                <BizFooter maxWidth={640} marginTop={16} />
            </div>
        </div>
    )
}
