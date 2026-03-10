

export default function TermsPage() {
    return (
        <div style={{ minHeight: '100dvh', background: '#f8f9fa' }}>
            <header style={{
                position: 'sticky', top: 0, zIndex: 50,
                background: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(20px)',
                borderBottom: '1px solid #f0f0f0',
            }}>
                <div style={{
                    maxWidth: 800, margin: '0 auto',
                    padding: '0 clamp(16px, 4vw, 40px)',
                    display: 'flex', alignItems: 'center',
                    height: 64,
                }}>
                    <a href="/login" style={{
                        fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em',
                        background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        textDecoration: 'none',
                    }}>
                        🤖 큐리 AI
                    </a>
                </div>
            </header>

            <main style={{
                maxWidth: 800, margin: '0 auto',
                padding: '40px clamp(16px, 4vw, 40px) 80px',
            }}>
                <div style={{
                    background: '#fff', borderRadius: 20,
                    border: '1px solid #f0f0f0',
                    padding: 'clamp(24px, 5vw, 48px)',
                }}>
                    <h1 style={{
                        fontSize: 28, fontWeight: 800, color: '#18181b',
                        marginBottom: 32, letterSpacing: '-0.02em',
                    }}>
                        이용약관
                    </h1>

                    <div style={{ fontSize: 15, lineHeight: 1.8, color: '#4b5563' }}>
                        <p style={{ marginBottom: 24 }}>
                            <strong>시행일:</strong> 2026년 3월 1일
                        </p>

                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', margin: '32px 0 12px' }}>
                            제1조 (목적)
                        </h2>
                        <p>
                            본 약관은 큐리 AI(이하 &quot;서비스&quot;)가 제공하는 AI 멘토링 서비스의 이용 조건 및 절차,
                            이용자와 서비스 간의 권리·의무 등 기본적인 사항을 규정함을 목적으로 합니다.
                        </p>

                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', margin: '32px 0 12px' }}>
                            제2조 (서비스의 내용)
                        </h2>
                        <p>
                            서비스는 AI 기반 멘토링 대화, 콘텐츠 수익화 코칭, 커리어 상담 등을 제공합니다.
                            서비스의 구체적인 내용은 변경될 수 있으며, 변경 시 공지합니다.
                        </p>

                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', margin: '32px 0 12px' }}>
                            제3조 (이용자의 의무)
                        </h2>
                        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                            <li style={{ marginBottom: 8 }}>이용자는 서비스를 이용할 때 관계 법령, 본 약관의 규정, 서비스 이용 안내 등을 준수하여야 합니다.</li>
                            <li style={{ marginBottom: 8 }}>이용자는 서비스를 이용하여 얻은 정보를 서비스의 사전 승낙 없이 복제, 유통, 상업적으로 이용할 수 없습니다.</li>
                            <li style={{ marginBottom: 8 }}>이용자는 타인의 개인정보를 침해하거나 불법적인 행위에 서비스를 이용할 수 없습니다.</li>
                        </ul>

                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', margin: '32px 0 12px' }}>
                            제4조 (서비스의 제한)
                        </h2>
                        <p>
                            서비스는 AI가 생성한 응답으로, 정확성을 보장하지 않습니다.
                            AI 멘토의 조언은 참고 목적이며, 전문적인 법률·의료·재무 상담을 대체하지 않습니다.
                        </p>

                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', margin: '32px 0 12px' }}>
                            제5조 (무료 이용 제한)
                        </h2>
                        <p>
                            무료 이용자는 일일 대화 횟수가 제한됩니다 (비로그인: 5회, 로그인: 20회).
                            제한은 매일 자정(한국 시간 기준)에 초기화됩니다.
                        </p>

                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', margin: '32px 0 12px' }}>
                            제6조 (개인정보 보호)
                        </h2>
                        <p>
                            서비스는 이용자의 개인정보를 보호하기 위해 관계 법령이 정하는 바에 따라 노력합니다.
                            개인정보 관련 사항은 <a href="/privacy" style={{ color: '#16a34a', fontWeight: 600 }}>개인정보처리방침</a>에 따릅니다.
                        </p>

                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', margin: '32px 0 12px' }}>
                            제7조 (면책 조항)
                        </h2>
                        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                            <li style={{ marginBottom: 8 }}>천재지변, 서버 장애 등 불가항력으로 서비스를 제공할 수 없는 경우 책임이 면제됩니다.</li>
                            <li style={{ marginBottom: 8 }}>AI가 제공한 정보의 정확성, 신뢰성에 대해서는 보증하지 않습니다.</li>
                            <li style={{ marginBottom: 8 }}>이용자가 서비스를 통해 기대한 결과를 얻지 못한 것에 대해 책임을 지지 않습니다.</li>
                        </ul>

                        <div style={{
                            marginTop: 48, padding: '20px 24px',
                            background: '#f9fafb', borderRadius: 12,
                            border: '1px solid #f0f0f0',
                        }}>
                            <p style={{ margin: 0, fontSize: 14, color: '#9ca3af' }}>
                                본 약관에 대한 문의는 <strong style={{ color: '#6b7280' }}>jin@mission-driven.kr</strong>로 연락해주세요.
                            </p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
