// /support 고객센터 (2026-10-02). 앱스토어 심사 「지원 주소」가 진짜 연락 창구로 이어지게 한다.
// 앱은 /support?platform=ios&v=1.0.0 으로 연다. 그 값은 문의에 몰래 붙는다(답할 때 기기 확인용).
// 회사 정보는 사업자 푸터(BizFooter)와 개인정보처리방침에 이미 공개한 값을 그대로 쓴다.
import Link from 'next/link'
import SupportForm from './SupportForm'

const h2: React.CSSProperties = { fontSize: 18, fontWeight: 700, color: '#18181b', margin: '36px 0 12px' }
const card: React.CSSProperties = { background: '#fff', borderRadius: 20, border: '1px solid #f0f0f0', padding: 'clamp(20px, 5vw, 40px)', marginBottom: 16 }

const FAQ: { q: string; a: string }[] = [
    {
        q: '로그인이 안 돼요',
        a: '카카오, 구글, 애플 계정 중 화면에 보이는 방법으로 로그인해요. 처음 가입할 때 쓴 방법과 같은 방법을 골라야 같은 계정으로 들어가요. 그래도 안 되면 아래에서 「계정」을 골라 문의를 남겨 주세요.',
    },
    {
        q: '봇은 어떻게 만들어요?',
        a: '로그인한 뒤 봇 만들기를 누르고 이름과 하는 일을 적으면 돼요. 내 글이나 파일, 링크를 자료로 넣으면 봇이 그 자료를 보고 답해요. 만든 봇은 처음에는 나만 볼 수 있고, 원할 때 공개할 수 있어요.',
    },
    {
        q: '클로버와 요금은 어떻게 되나요?',
        a: '클로버는 큐리 AI 안에서 쓰는 사용권이에요. 매달 주는 사용량을 다 쓰면 클로버로 이어서 쓸 수 있어요. 지금 가진 클로버와 요금제는 설정의 사용량 메뉴에서 볼 수 있어요. 결제나 환불이 궁금하면 「결제와 환불」을 골라 문의해 주세요.',
    },
    {
        q: '구독은 어디서 해지해요?',
        a: '웹에서 결제한 구독은 프로필 화면에서 해지해요. 프로필 맨 아래 「회원 탈퇴」를 누르면 남은 구독이 있을 때 바로 해지할 수 있어요. 앱스토어나 플레이스토어에서 결제한 구독은 휴대폰의 앱스토어 또는 플레이스토어 설정에서 해지해 주세요.',
    },
    {
        q: '탈퇴는 어떻게 해요?',
        a: '웹에서는 설정이나 프로필 화면 맨 아래의 「회원 탈퇴」를, 앱에서는 설정 화면 맨 아래의 「회원 탈퇴」를 누르면 돼요. 확인 칸에 탈퇴 라고 적으면 탈퇴할 수 있어요. 내가 만든 봇, 대화, 자료가 모두 지워지고 되돌릴 수 없어요. 결제 기록은 법에 따라 5년 보관돼요.',
    },
    {
        q: '내 개인정보는 어떻게 다뤄지나요?',
        a: '서비스에 꼭 필요한 정보만 받고, 정해진 목적에만 써요. 자세한 내용은 개인정보처리방침에 적어 두었어요. 내 정보를 보거나 고치거나 지워 달라는 요청도 아래 문의로 받아요.',
    },
]

export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const sp = await searchParams
    const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
    const platform = one(sp.platform).slice(0, 16)
    const appVersion = one(sp.v).slice(0, 32)

    return (
        <div style={{ minHeight: '100dvh', background: '#f8f9fa' }}>
            <header style={{
                position: 'sticky', top: 0, zIndex: 50,
                background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid #f0f0f0',
            }}>
                <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 clamp(16px, 4vw, 40px)', display: 'flex', alignItems: 'center', height: 64 }}>
                    <Link href="/login" style={{
                        fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--먹, #111813)',
                        textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
                    }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo.png" alt="" style={{ width: 28, height: 28, borderRadius: 6 }} />
                        큐리 AI
                    </Link>
                </div>
            </header>

            <main style={{ maxWidth: 800, margin: '0 auto', padding: '32px clamp(16px, 4vw, 40px) 80px' }}>
                <div style={card}>
                    <h1 style={{ fontSize: 28, fontWeight: 800, color: '#18181b', margin: '0 0 12px', letterSpacing: '-0.02em' }}>고객센터</h1>
                    <p style={{ fontSize: 15, lineHeight: 1.8, color: '#4b5563', margin: 0 }}>
                        궁금한 점이나 불편한 점을 남겨 주세요. 영업일 기준 2일 안에 이메일로 답해 드려요.
                        <br />
                        메일로 바로 보내셔도 돼요. <a href="mailto:curious@mission-driven.kr" style={{ color: '#03C124', fontWeight: 600 }}>curious@mission-driven.kr</a>
                    </p>
                </div>

                <section style={card} aria-labelledby="faq-title">
                    <h2 id="faq-title" style={{ ...h2, marginTop: 0 }}>자주 묻는 질문</h2>
                    {FAQ.map(f => (
                        <details key={f.q} style={{ borderTop: '1px solid #f0f0f0', padding: '14px 0' }}>
                            <summary style={{ fontSize: 16, fontWeight: 600, color: '#18181b', cursor: 'pointer', minHeight: 28 }}>{f.q}</summary>
                            <p style={{ fontSize: 15, lineHeight: 1.8, color: '#4b5563', margin: '10px 0 0' }}>{f.a}</p>
                        </details>
                    ))}
                    <p style={{ fontSize: 14, color: '#6b7280', margin: '16px 0 0' }}>
                        <Link href="/privacy" style={{ color: '#6b7280' }}>개인정보처리방침</Link>
                        <span aria-hidden="true">{'  ㅣ  '}</span>
                        <Link href="/terms" style={{ color: '#6b7280' }}>서비스이용약관</Link>
                        <span aria-hidden="true">{'  ㅣ  '}</span>
                        <Link href="/refund" style={{ color: '#6b7280' }}>취소/환불정책</Link>
                    </p>
                </section>

                <section style={card} aria-labelledby="form-title">
                    <h2 id="form-title" style={{ ...h2, marginTop: 0 }}>문의 남기기</h2>
                    <SupportForm platform={platform} appVersion={appVersion} />
                </section>

                <section style={card} aria-labelledby="company-title">
                    <h2 id="company-title" style={{ ...h2, marginTop: 0 }}>회사 정보</h2>
                    <dl style={{ fontSize: 14, lineHeight: 1.9, color: '#4b5563', margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 16 }}>
                        <dt style={{ color: '#9ca3af' }}>상호</dt><dd style={{ margin: 0 }}>(주)미션드리븐</dd>
                        <dt style={{ color: '#9ca3af' }}>대표</dt><dd style={{ margin: 0 }}>김진수</dd>
                        <dt style={{ color: '#9ca3af' }}>고객센터</dt><dd style={{ margin: 0 }}>curious@mission-driven.kr</dd>
                        <dt style={{ color: '#9ca3af' }}>전화</dt><dd style={{ margin: 0 }}>010-9716-6015</dd>
                        <dt style={{ color: '#9ca3af' }}>사업자등록번호</dt><dd style={{ margin: 0 }}>277-88-02697</dd>
                        <dt style={{ color: '#9ca3af' }}>통신판매번호</dt><dd style={{ margin: 0 }}>2023-서울마포-2003</dd>
                        <dt style={{ color: '#9ca3af' }}>주소</dt><dd style={{ margin: 0, wordBreak: 'keep-all' }}>서울특별시 마포구 성지길 25-11 3층 비123호</dd>
                    </dl>
                </section>
            </main>
        </div>
    )
}
