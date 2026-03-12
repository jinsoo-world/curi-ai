
export default function SignupInfoPage() {
    return (
        <div style={{ minHeight: '100dvh', background: '#f8f9fa' }}>
            <header style={{
                position: 'sticky', top: 0, zIndex: 50,
                background: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(20px)',
                borderBottom: '1px solid #f0f0f0',
            }}>
                <div style={{
                    maxWidth: 480, margin: '0 auto',
                    padding: '0 24px',
                    display: 'flex', alignItems: 'center',
                    height: 56,
                }}>
                    <span style={{
                        fontSize: 18, fontWeight: 800, letterSpacing: '-0.04em',
                        background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>
                        🤖 큐리 AI
                    </span>
                </div>
            </header>

            <main style={{
                maxWidth: 480, margin: '0 auto',
                padding: '32px 24px 80px',
            }}>
                <div style={{
                    background: '#fff', borderRadius: 20,
                    border: '1px solid #f0f0f0',
                    padding: '32px 28px',
                }}>
                    <h1 style={{
                        fontSize: 22, fontWeight: 800, color: '#18181b',
                        marginBottom: 4, letterSpacing: '-0.02em',
                        textAlign: 'center',
                    }}>
                        회원가입
                    </h1>
                    <p style={{
                        fontSize: 14, color: '#9ca3af', textAlign: 'center',
                        marginBottom: 28,
                    }}>
                        큐리 AI 서비스 이용을 위한 정보를 입력해주세요
                    </p>

                    {/* 필수 회원정보 */}
                    <div style={{
                        background: '#16a34a', color: '#fff',
                        padding: '8px 16px', borderRadius: '8px 8px 0 0',
                        fontSize: 13, fontWeight: 600,
                    }}>
                        필수 회원정보
                    </div>
                    <div style={{
                        border: '1px solid #e5e7eb', borderTop: 'none',
                        borderRadius: '0 0 8px 8px',
                        padding: '20px 16px',
                        marginBottom: 20,
                    }}>
                        {/* 이름 */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                                이름 <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <input
                                type="text"
                                placeholder=""
                                readOnly
                                style={{
                                    width: '100%', padding: '10px 12px',
                                    border: '1px solid #d1d5db', borderRadius: 8,
                                    fontSize: 14, background: '#fff',
                                    boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        {/* 연락처 */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                                연락처 <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input readOnly placeholder="" style={{
                                    flex: 1, padding: '10px 12px',
                                    border: '1px solid #d1d5db', borderRadius: 8,
                                    fontSize: 14, boxSizing: 'border-box',
                                }} />
                                <input readOnly placeholder="" style={{
                                    flex: 1, padding: '10px 12px',
                                    border: '1px solid #d1d5db', borderRadius: 8,
                                    fontSize: 14, boxSizing: 'border-box',
                                }} />
                                <input readOnly placeholder="" style={{
                                    flex: 1, padding: '10px 12px',
                                    border: '1px solid #d1d5db', borderRadius: 8,
                                    fontSize: 14, boxSizing: 'border-box',
                                }} />
                            </div>
                        </div>

                        {/* 생일 */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                                생일 <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <input
                                type="text"
                                placeholder=""
                                readOnly
                                style={{
                                    width: '100%', padding: '10px 12px',
                                    border: '1px solid #d1d5db', borderRadius: 8,
                                    fontSize: 14, boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        {/* 출생 연도 */}
                        <div>
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                                출생 연도 <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <input
                                type="text"
                                placeholder=""
                                readOnly
                                style={{
                                    width: '100%', padding: '10px 12px',
                                    border: '1px solid #d1d5db', borderRadius: 8,
                                    fontSize: 14, boxSizing: 'border-box',
                                }}
                            />
                        </div>
                    </div>

                    {/* 선택 회원정보 */}
                    <div style={{
                        background: '#6b7280', color: '#fff',
                        padding: '8px 16px', borderRadius: '8px 8px 0 0',
                        fontSize: 13, fontWeight: 600,
                    }}>
                        선택 회원정보
                    </div>
                    <div style={{
                        border: '1px solid #e5e7eb', borderTop: 'none',
                        borderRadius: '0 0 8px 8px',
                        padding: '20px 16px',
                        marginBottom: 28,
                    }}>
                        {/* 성별 */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                                성별
                            </label>
                            <input
                                type="text"
                                placeholder=""
                                readOnly
                                style={{
                                    width: '100%', padding: '10px 12px',
                                    border: '1px solid #d1d5db', borderRadius: 8,
                                    fontSize: 14, boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        {/* 관심사 */}
                        <div>
                            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                                관심사
                            </label>
                            <input
                                type="text"
                                placeholder=""
                                readOnly
                                style={{
                                    width: '100%', padding: '10px 12px',
                                    border: '1px solid #d1d5db', borderRadius: 8,
                                    fontSize: 14, boxSizing: 'border-box',
                                }}
                            />
                        </div>
                    </div>

                    {/* 약관 동의 */}
                    <div style={{
                        padding: '16px', background: '#f9fafb',
                        borderRadius: 12, border: '1px solid #f0f0f0',
                        marginBottom: 20,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <div style={{
                                width: 20, height: 20, borderRadius: 4,
                                border: '2px solid #d1d5db', background: '#fff',
                            }} />
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>전체 동의</span>
                        </div>

                        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10 }}>
                            {[
                                { label: '(필수) 만 14세 이상입니다', required: true },
                                { label: '(필수) 서비스 이용약관에 동의합니다', required: true },
                                { label: '(필수) 개인정보 수집 및 이용에 동의합니다', required: true },
                                { label: '(선택) 마케팅 정보 수신에 동의합니다', required: false },
                            ].map((item, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '6px 0',
                                }}>
                                    <div style={{
                                        width: 18, height: 18, borderRadius: 4,
                                        border: '1.5px solid #d1d5db', background: '#fff',
                                        flexShrink: 0,
                                    }} />
                                    <span style={{
                                        fontSize: 13,
                                        color: item.required ? '#374151' : '#9ca3af',
                                    }}>
                                        {item.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 가입 버튼 */}
                    <button style={{
                        width: '100%', padding: '14px',
                        background: '#e5e7eb', color: '#9ca3af',
                        border: 'none', borderRadius: 12,
                        fontSize: 16, fontWeight: 700,
                        cursor: 'default',
                    }}>
                        회원가입
                    </button>

                    <p style={{
                        fontSize: 12, color: '#d1d5db', textAlign: 'center',
                        marginTop: 16,
                    }}>
                        이 페이지는 카카오 로그인 심사용 회원가입 화면입니다.
                    </p>
                </div>
            </main>
        </div>
    )
}
