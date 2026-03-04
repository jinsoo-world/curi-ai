

export default function PrivacyPage() {
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
                        🎓 큐리 AI
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
                        개인정보처리방침
                    </h1>

                    <div style={{ fontSize: 15, lineHeight: 1.8, color: '#4b5563' }}>
                        <p style={{ marginBottom: 24 }}>
                            <strong>시행일:</strong> 2026년 3월 1일
                        </p>

                        <p style={{ marginBottom: 24 }}>
                            큐리 AI(이하 &quot;서비스&quot;)는 이용자의 개인정보를 중요시하며,
                            「개인정보 보호법」 등 관련 법령을 준수하고 있습니다.
                        </p>

                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', margin: '32px 0 12px' }}>
                            1. 수집하는 개인정보 항목
                        </h2>
                        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                            <li style={{ marginBottom: 8 }}><strong>필수 항목:</strong> 이메일, Google 계정 이름, 프로필 사진 URL</li>
                            <li style={{ marginBottom: 8 }}><strong>선택 항목:</strong> 닉네임, 관심사, 성별, 출생 연도</li>
                            <li style={{ marginBottom: 8 }}><strong>자동 수집:</strong> 서비스 이용 기록, 대화 내역, 접속 로그</li>
                        </ul>

                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', margin: '32px 0 12px' }}>
                            2. 개인정보의 수집 및 이용 목적
                        </h2>
                        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                            <li style={{ marginBottom: 8 }}>AI 멘토링 서비스 제공 및 개인화</li>
                            <li style={{ marginBottom: 8 }}>서비스 개선 및 신규 기능 개발</li>
                            <li style={{ marginBottom: 8 }}>이용자 문의 대응 및 공지사항 전달</li>
                            <li style={{ marginBottom: 8 }}>서비스 이용 통계 분석</li>
                        </ul>

                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', margin: '32px 0 12px' }}>
                            3. 개인정보의 보유 및 이용 기간
                        </h2>
                        <p>
                            이용자의 개인정보는 서비스 탈퇴 시까지 보유·이용됩니다.
                            단, 관계 법령에 따라 보존이 필요한 경우 해당 법령에서 정한 기간 동안 보관합니다.
                        </p>
                        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                            <li style={{ marginBottom: 8 }}>계약 또는 청약 철회에 관한 기록: 5년</li>
                            <li style={{ marginBottom: 8 }}>접속 로그: 3개월</li>
                        </ul>

                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', margin: '32px 0 12px' }}>
                            4. 개인정보의 제3자 제공
                        </h2>
                        <p>
                            서비스는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다.
                            단, 법령에 따른 요청이 있는 경우에는 예외로 합니다.
                        </p>

                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', margin: '32px 0 12px' }}>
                            5. 개인정보의 처리 위탁
                        </h2>
                        <table style={{
                            width: '100%', borderCollapse: 'collapse',
                            margin: '12px 0', fontSize: 14,
                        }}>
                            <thead>
                                <tr style={{ background: '#f9fafb' }}>
                                    <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: 600 }}>수탁업체</th>
                                    <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: 600 }}>위탁 내용</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>Google (Firebase/Supabase)</td>
                                    <td style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>인증 및 데이터 저장</td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>Google (Gemini API)</td>
                                    <td style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>AI 대화 처리</td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>Vercel</td>
                                    <td style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>서비스 호스팅</td>
                                </tr>
                            </tbody>
                        </table>

                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', margin: '32px 0 12px' }}>
                            6. 이용자의 권리
                        </h2>
                        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                            <li style={{ marginBottom: 8 }}>개인정보 열람, 수정, 삭제를 요청할 수 있습니다.</li>
                            <li style={{ marginBottom: 8 }}>개인정보의 처리 정지를 요청할 수 있습니다.</li>
                            <li style={{ marginBottom: 8 }}>서비스 탈퇴를 통해 개인정보 삭제를 요청할 수 있습니다.</li>
                        </ul>

                        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', margin: '32px 0 12px' }}>
                            7. 개인정보 보호 책임자
                        </h2>
                        <div style={{
                            padding: '16px 20px', background: '#f9fafb',
                            borderRadius: 12, border: '1px solid #f0f0f0',
                            margin: '12px 0',
                        }}>
                            <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#18181b' }}>개인정보 보호 책임자</p>
                            <p style={{ margin: 0, fontSize: 14 }}>이메일: jin@mission-driven.kr</p>
                        </div>

                        <div style={{
                            marginTop: 48, padding: '20px 24px',
                            background: '#f9fafb', borderRadius: 12,
                            border: '1px solid #f0f0f0',
                        }}>
                            <p style={{ margin: 0, fontSize: 14, color: '#9ca3af' }}>
                                본 개인정보처리방침에 대한 문의는 <strong style={{ color: '#6b7280' }}>jin@mission-driven.kr</strong>로 연락해주세요.
                            </p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
