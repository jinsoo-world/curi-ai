

export default function PrivacyPage() {
    const sectionTitle = {
        fontSize: 20, fontWeight: 700, color: 'var(--color-neutral-900)',
        margin: '40px 0 16px', letterSpacing: '-0.01em',
    } as const;

    const subTitle = {
        fontSize: 16, fontWeight: 600, color: 'var(--color-neutral-900)',
        margin: '24px 0 8px',
    } as const;

    const tableStyle = {
        width: '100%', borderCollapse: 'collapse' as const,
        margin: '12px 0', fontSize: 14,
    };

    const thStyle = {
        padding: '10px 16px', textAlign: 'left' as const,
        borderBottom: '2px solid var(--color-neutral-200)', fontWeight: 600,
        background: 'var(--color-neutral-50)',
    };

    const tdStyle = {
        padding: '10px 16px', borderBottom: '1px solid var(--color-neutral-200)',
    };

    const infoBox = (bg: string, border: string) => ({
        padding: '16px 20px', background: bg,
        borderRadius: 12, border: `1px solid ${border}`,
        margin: '16px 0',
    });

    return (
        <div style={{ minHeight: '100dvh', background: 'var(--color-neutral-50)' }}>
            <header style={{
                position: 'sticky', top: 0, zIndex: 50,
                background: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(20px)',
                borderBottom: '1px solid var(--color-neutral-200)',
            }}>
                <div style={{
                    maxWidth: 800, margin: '0 auto',
                    padding: '0 clamp(16px, 4vw, 40px)',
                    display: 'flex', alignItems: 'center',
                    height: 64, gap: 12,
                }}>
                    <a href="/mentors" style={{
                        fontSize: 14, color: 'var(--color-neutral-400)', textDecoration: 'none',
                    }}>← 뒤로가기</a>
                    <a href="/mentors" style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em',
                        background: 'var(--color-primary-600)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        textDecoration: 'none',
                    }}>
                        <img src="/logo.png" alt="큐리 AI" style={{ width: 28, height: 28, borderRadius: 6 }} />
                        큐리 AI
                    </a>
                </div>
            </header>

            <main style={{
                maxWidth: 800, margin: '0 auto',
                padding: '40px clamp(16px, 4vw, 40px) 80px',
            }}>
                <div style={{
                    background: '#fff', borderRadius: 20,
                    border: '1px solid var(--color-neutral-200)',
                    padding: 'clamp(24px, 5vw, 48px)',
                }}>
                    <h1 style={{
                        fontSize: 28, fontWeight: 800, color: 'var(--color-neutral-900)',
                        marginBottom: 8, letterSpacing: '-0.02em',
                    }}>
                        개인정보처리방침
                    </h1>
                    <p style={{ fontSize: 14, color: 'var(--color-neutral-400)', marginBottom: 32 }}>
                        시행일: 2026년 10월 5일
                    </p>

                    {/* 목차 */}
                    <div style={infoBox('#f9fafb', '#f0f0f0')}>
                        <p style={{ margin: '0 0 12px', fontWeight: 700, fontSize: 15, color: 'var(--color-neutral-900)' }}>목차</p>
                        <ol style={{ paddingLeft: 20, margin: 0, fontSize: 14, lineHeight: 2, color: 'var(--color-neutral-600)' }}>
                            <li>수집하는 개인정보 항목과 수집 방법</li>
                            <li>수집 및 이용 목적</li>
                            <li>보유 및 이용 기간</li>
                            <li>리더에게 제공되는 정보</li>
                            <li>개인정보 처리의 위탁</li>
                            <li>개인정보의 국외 이전</li>
                            <li>AI 학습에 관한 약속</li>
                            <li>구독 결제와 탈퇴</li>
                            <li>자동 수집 장치와 쿠키</li>
                            <li>아동의 개인정보 보호</li>
                            <li>정보주체의 권리와 행사 방법</li>
                            <li>개인정보의 파기와 안전성 확보 조치</li>
                            <li>방침의 변경</li>
                        </ol>
                    </div>

                    <div style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--color-neutral-600)' }}>

                        <p>
                            (주)미션드리븐(이하 &quot;회사&quot;)은 큐리 AI(이하 &quot;서비스&quot;) 이용자의 개인정보를 소중히 다루며,
                            개인정보 보호법 등 관련 법령을 준수합니다. 이 방침은 회사가 어떤 개인정보를 수집하고, 어떻게 이용하고, 어떻게 보호하는지 설명합니다.
                            서비스 이용에 관한 약속은 <a href="/terms" style={{ color: 'var(--color-blue-500)' }}>이용약관</a>에서,
                            결제 취소와 환불은 <a href="/refund" style={{ color: 'var(--color-blue-500)' }}>환불 안내</a>에서 볼 수 있습니다.
                        </p>

                        {/* ===== 제1조 ===== */}
                        <h2 style={sectionTitle}>제1조 수집하는 개인정보 항목과 수집 방법</h2>
                        <table style={tableStyle}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>구분</th>
                                    <th style={thStyle}>수집 항목</th>
                                    <th style={thStyle}>수집 방법</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>회원가입(소셜 로그인)</td>
                                    <td style={tdStyle}>이메일, 이름, 프로필 이미지</td>
                                    <td style={tdStyle}>카카오, 구글, Apple 로그인 시 인증사로부터 제공받음</td>
                                </tr>
                                <tr>
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>리더 정산</td>
                                    <td style={tdStyle}>이름, 이메일, 휴대폰 번호, 생년월일, 은행명, 계좌번호</td>
                                    <td style={tdStyle}>리더 등록과 정산 신청 시 직접 입력</td>
                                </tr>
                                <tr>
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>서비스 이용</td>
                                    <td style={tdStyle}>봇과의 대화 내용, 올린 자료(파일, 링크, 유튜브 주소 등), 외부 서비스 연결 접근 토큰(암호화 저장), 기기 정보, 접속 로그(IP, 접속 일시)</td>
                                    <td style={tdStyle}>서비스 이용 과정에서 자동 생성 및 수집</td>
                                </tr>
                                <tr>
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>기억 기능</td>
                                    <td style={tdStyle}>대화에서 뽑아 저장한 짧은 기억 문장</td>
                                    <td style={tdStyle}>대화 중 자동 생성</td>
                                </tr>
                                <tr>
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>로그인 없이 이용</td>
                                    <td style={tdStyle}>질문과 답, IP, 접속 도시, 기기 종류, 방문자 표식</td>
                                    <td style={tdStyle}>로그인 없이 대화할 때 자동 수집</td>
                                </tr>
                                <tr>
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>웹 결제</td>
                                    <td style={tdStyle}>주문번호, 결제 승인번호, 결제 금액, 결제 수단 식별 정보</td>
                                    <td style={tdStyle}>토스페이먼츠로부터 처리 결과를 전달받음 (카드번호 등은 회사가 직접 수집하거나 보관하지 않음)</td>
                                </tr>
                                <tr>
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>앱 구독 결제</td>
                                    <td style={tdStyle}>구독 상품, 구독 상태, 만료일, 스토어 거래 식별자</td>
                                    <td style={tdStyle}>Apple과 RevenueCat으로부터 전달받음 (카드 정보는 받지 않음)</td>
                                </tr>
                            </tbody>
                        </table>

                        {/* ===== 제2조 ===== */}
                        <h2 style={sectionTitle}>제2조 수집 및 이용 목적</h2>
                        <ol style={{ paddingLeft: 20, margin: '12px 0' }}>
                            <li style={{ marginBottom: 8 }}>회원 식별, 가입, 계정 관리</li>
                            <li style={{ marginBottom: 8 }}>봇 대화, 자료 처리, 외부 서비스 연결 등 서비스 제공</li>
                            <li style={{ marginBottom: 8 }}>유료 서비스 결제 처리, 구독 상태 관리, 요금 정산</li>
                            <li style={{ marginBottom: 8 }}>리더 봇 수익 정산과 세무 신고 관련 자료 제공</li>
                            <li style={{ marginBottom: 8 }}>리더에게 제공하는 익명 요약 통계 작성 (제4조 참고)</li>
                            <li style={{ marginBottom: 8 }}>부정 이용 방지, 서비스 오류 대응, 보안</li>
                            <li style={{ marginBottom: 8 }}>공지사항 전달과 고객 문의 대응</li>
                            <li style={{ marginBottom: 8 }}>별도로 동의한 경우 광고성 정보 전송</li>
                        </ol>

                        {/* ===== 제3조 ===== */}
                        <h2 style={sectionTitle}>제3조 보유 및 이용 기간</h2>
                        <p>
                            개인정보는 수집 및 이용 목적이 달성될 때까지 또는 관련 법령에서 정한 기간 동안 보관하고, 그 뒤에는 지체 없이 파기합니다.
                            회원이 탈퇴하면 대화 내용, 봇, 올린 자료는 삭제합니다. 외부 서비스 연결 접근 토큰은 연결을 해제하면 폐기합니다.
                        </p>
                        <table style={tableStyle}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>보관 정보</th>
                                    <th style={thStyle}>보존 근거</th>
                                    <th style={thStyle}>기간</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td style={tdStyle}>계약 또는 청약철회 등에 관한 기록</td><td style={tdStyle}>전자상거래법</td><td style={tdStyle}>5년</td></tr>
                                <tr><td style={tdStyle}>대금결제 및 재화 등의 공급에 관한 기록</td><td style={tdStyle}>전자상거래법</td><td style={tdStyle}>5년</td></tr>
                                <tr><td style={tdStyle}>소비자 불만 또는 분쟁처리에 관한 기록</td><td style={tdStyle}>전자상거래법</td><td style={tdStyle}>3년</td></tr>
                                <tr><td style={tdStyle}>표시와 광고에 관한 기록</td><td style={tdStyle}>전자상거래법</td><td style={tdStyle}>6개월</td></tr>
                                <tr><td style={tdStyle}>서비스 이용 관련 접속 기록</td><td style={tdStyle}>통신비밀보호법</td><td style={tdStyle}>3개월</td></tr>
                            </tbody>
                        </table>
                        <p>로그인 없이 대화한 기록은 목적 달성 시까지 또는 관련 법령에서 정한 기간 동안 보관합니다.</p>
                        <p>
                            개인정보 수집 및 이용 동의를 거부할 권리가 있습니다. 다만 필수 정보에 동의하지 않으면 서비스 이용이 제한됩니다.
                            법령에 규정된 경우나 이용자가 따로 동의한 경우를 제외하고는 개인정보를 제3자에게 제공하지 않습니다.
                        </p>

                        {/* ===== 제4조 ===== */}
                        <h2 style={sectionTitle}>제4조 리더에게 제공되는 정보</h2>
                        <ol style={{ paddingLeft: 20, margin: '12px 0' }}>
                            <li style={{ marginBottom: 8 }}>회원의 대화는 기본으로 본인만 볼 수 있습니다. 리더에게 대화 원문과 회원 이름은 전달하지 않습니다.</li>
                            <li style={{ marginBottom: 8 }}>리더에게는 익명 요약만 제공합니다. 예를 들면 전체 대화 수, 많이 묻는 주제, 봇이 답하지 못한 질문입니다.</li>
                            <li style={{ marginBottom: 8 }}>봇이 답하지 못한 질문을 기록할 때는 이메일과 전화번호 형태의 내용을 가려서 저장합니다.</li>
                        </ol>

                        {/* ===== 제5조 ===== */}
                        <h2 style={sectionTitle}>제5조 개인정보 처리의 위탁</h2>
                        <p style={{ fontSize: 13, color: 'var(--color-neutral-400)', marginBottom: 8 }}>
                            서비스 제공을 위해 아래 업무를 위탁하고 있으며, 위탁받은 업체가 관계 법령을 지키도록 관리하고 감독합니다.
                        </p>
                        <table style={tableStyle}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>수탁 업체</th>
                                    <th style={thStyle}>위탁 업무</th>
                                    <th style={thStyle}>위탁 정보</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td style={tdStyle}>업스테이지(Upstage)</td><td style={tdStyle}>봇 답변을 만드는 AI 모델(솔라) 처리</td><td style={tdStyle}>대화 내용, 봇 지침, 검색된 자료 조각</td></tr>
                                <tr><td style={tdStyle}>구글(Google LLC)</td><td style={tdStyle}>AI(제미나이) 처리, 소셜 로그인, 이용 통계 분석</td><td style={tdStyle}>첨부 이미지와 관련 대화 내용, 로그인 정보, 이용 기록</td></tr>
                                <tr><td style={tdStyle}>RevenueCat</td><td style={tdStyle}>앱 구독 상태 확인과 구독 알림 처리</td><td style={tdStyle}>회원 식별번호, 구독 상품, 구독 상태, 만료일</td></tr>
                                <tr><td style={tdStyle}>Apple Inc.</td><td style={tdStyle}>Apple로 로그인, 앱 안 구독 결제와 환불 처리</td><td style={tdStyle}>로그인 식별 정보, 구독 거래 정보</td></tr>
                                <tr><td style={tdStyle}>수파베이스(Supabase Inc.)</td><td style={tdStyle}>회원 인증, 데이터 저장</td><td style={tdStyle}>회원 정보, 대화와 자료 데이터</td></tr>
                                <tr><td style={tdStyle}>버셀(Vercel Inc.)</td><td style={tdStyle}>서비스 호스팅과 운영</td><td style={tdStyle}>서비스 이용 과정의 처리 데이터</td></tr>
                                <tr><td style={tdStyle}>(주)비바리퍼블리카(토스페이먼츠)</td><td style={tdStyle}>웹 결제 처리</td><td style={tdStyle}>결제 요청 정보, 결제 승인 정보</td></tr>
                                <tr><td style={tdStyle}>(주)카카오</td><td style={tdStyle}>소셜 로그인</td><td style={tdStyle}>로그인 식별 정보</td></tr>
                            </tbody>
                        </table>
                        <p>위탁 업체나 업무가 바뀌면 이 방침을 고쳐 알립니다.</p>

                        {/* ===== 제6조 ===== */}
                        <h2 style={sectionTitle}>제6조 개인정보의 국외 이전</h2>
                        <p>서비스 운영에는 해외 사업자의 서버나 서비스를 이용하는 부분이 있어, 아래와 같이 개인정보가 국외로 이전될 수 있습니다.</p>
                        <ol style={{ paddingLeft: 20, margin: '12px 0' }}>
                            <li style={{ marginBottom: 8 }}>이전받는 자(본사 소재국): 구글, 버셀, 수파베이스, RevenueCat, Apple (모두 미국)</li>
                            <li style={{ marginBottom: 8 }}>이전 항목: 제5조 표의 위탁 정보 범위</li>
                            <li style={{ marginBottom: 8 }}>이전 목적: 서비스 호스팅, 데이터 저장, AI 응답 생성, 로그인, 구독 관리</li>
                            <li style={{ marginBottom: 8 }}>이전 시기와 방법: 서비스를 이용하는 시점에 네트워크로 전송</li>
                            <li style={{ marginBottom: 8 }}>보유 및 이용 기간: 제3조와 같음</li>
                        </ol>

                        {/* ===== 제7조 ===== */}
                        <h2 style={sectionTitle}>제7조 AI 학습에 관한 약속</h2>
                        <ol style={{ paddingLeft: 20, margin: '12px 0' }}>
                            <li style={{ marginBottom: 8 }}>회사는 회원의 대화와 올린 자료를 AI 모델의 학습에 사용하지 않습니다.</li>
                            <li style={{ marginBottom: 8 }}>리더가 올린 자료는 그 리더의 봇이 답하는 데에만 쓰이며 다른 봇에는 쓰이지 않습니다.</li>
                            <li style={{ marginBottom: 8 }}>서비스 운영, 오류 대응, 신고 처리를 위해 운영자가 필요한 범위에서 대화를 확인할 수 있습니다.</li>
                        </ol>

                        {/* ===== 제8조 ===== */}
                        <h2 style={sectionTitle}>제8조 구독 결제와 탈퇴</h2>
                        <ol style={{ paddingLeft: 20, margin: '12px 0' }}>
                            <li style={{ marginBottom: 8 }}>앱 안에서 구독하면 결제, 갱신, 해지, 환불은 Apple의 정책과 절차를 따릅니다. 웹에서 결제한 경우에는 서비스의 환불 안내를 따릅니다.</li>
                            <li style={{ marginBottom: 8 }}>회원이 탈퇴하면 대화, 봇, 자료는 삭제합니다. 결제 기록은 법령에 따라 보관하되 회원과의 연결은 끊습니다.</li>
                            <li style={{ marginBottom: 8 }}>앱 구독은 탈퇴만으로 멈추지 않습니다. 구독 해지는 Apple 계정의 구독 설정에서 따로 해야 합니다.</li>
                        </ol>

                        {/* ===== 제9조 ===== */}
                        <h2 style={sectionTitle}>제9조 자동 수집 장치와 쿠키</h2>
                        <p>
                            서비스는 로그인 유지 등 기능 제공과 이용 패턴 분석을 위해 쿠키를 사용하며, 구글 애널리틱스, 구글 태그 매니저,
                            Microsoft Clarity, PostHog, Vercel Analytics 같은 분석 도구를 사용합니다.
                            쿠키에는 이름이나 전화번호처럼 개인을 알아볼 수 있는 정보를 저장하지 않습니다.
                            브라우저 설정에서 쿠키 저장을 거부할 수 있으며, 이 경우 서비스 일부 이용이 제한될 수 있습니다.
                        </p>
                        <div style={infoBox('#f9fafb', '#f0f0f0')}>
                            <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: 14, color: 'var(--color-neutral-900)' }}>쿠키 수집 거부 방법</p>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-neutral-500)', lineHeight: 2 }}>
                                Chrome: 설정, 개인정보 및 보안, 쿠키 및 기타 사이트 데이터<br/>
                                Safari: 환경설정, 개인정보, 쿠키 및 웹사이트 데이터<br/>
                                Edge: 설정, 쿠키 및 사이트 권한
                            </p>
                        </div>

                        {/* ===== 제10조 ===== */}
                        <h2 style={sectionTitle}>제10조 아동의 개인정보 보호</h2>
                        <p>
                            만 14세 미만 아동은 가입할 수 없습니다. 만 14세 미만 아동의 개인정보가 수집된 사실을 알게 되면 지체 없이 삭제합니다.
                        </p>

                        {/* ===== 제11조 ===== */}
                        <h2 style={sectionTitle}>제11조 정보주체의 권리와 행사 방법</h2>
                        <ol style={{ paddingLeft: 20, margin: '12px 0' }}>
                            <li style={{ marginBottom: 8 }}>이용자는 언제든지 자신의 개인정보를 열람, 정정, 삭제하거나 처리정지를 요청할 수 있고, 동의를 철회하거나 탈퇴할 수 있습니다.</li>
                            <li style={{ marginBottom: 8 }}>서비스의 설정 화면 또는 이메일(curious@mission-driven.kr)로 요청할 수 있으며, 회사는 관련 법령에 따라 지체 없이 조치합니다.</li>
                            <li style={{ marginBottom: 8 }}>법정대리인이나 위임을 받은 대리인을 통해서도 권리를 행사할 수 있습니다.</li>
                        </ol>

                        <div style={infoBox('#fef3c7', '#fde68a')}>
                            <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: 14, color: 'var(--color-neutral-900)' }}>권익침해 구제방법</p>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-neutral-500)', lineHeight: 2 }}>
                                개인정보침해 신고센터: (국번없이) 118, <a href="https://privacy.kisa.or.kr" style={{ color: 'var(--color-blue-500)' }}>privacy.kisa.or.kr</a><br/>
                                대검찰청 사이버수사과: (국번없이) 1301, <a href="https://spo.go.kr" style={{ color: 'var(--color-blue-500)' }}>spo.go.kr</a><br/>
                                경찰청 사이버안전국: (국번없이) 182, <a href="https://ecrm.police.go.kr" style={{ color: 'var(--color-blue-500)' }}>ecrm.police.go.kr</a><br/>
                                개인정보분쟁조정위원회: (국번없이) 1833-6972, <a href="https://www.kopico.go.kr" style={{ color: 'var(--color-blue-500)' }}>kopico.go.kr</a>
                            </p>
                        </div>

                        {/* ===== 제12조 ===== */}
                        <h2 style={sectionTitle}>제12조 개인정보의 파기와 안전성 확보 조치</h2>
                        <p>보유 기간이 끝났거나 목적이 달성된 개인정보는 복원할 수 없는 방법으로 삭제합니다. 법령에 따라 보관해야 하는 정보는 제3조의 기간 동안 보관한 뒤 파기합니다.</p>
                        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                            <li style={{ marginBottom: 6 }}>암호화된 통신 구간(HTTPS)으로 개인정보를 전송합니다.</li>
                            <li style={{ marginBottom: 6 }}>외부 서비스 연결 접근 토큰은 암호화해 저장합니다.</li>
                            <li style={{ marginBottom: 6 }}>데이터베이스 행 단위 접근 통제(RLS)로 회원의 대화는 본인만 읽을 수 있게 합니다.</li>
                            <li style={{ marginBottom: 6 }}>개인정보를 다루는 담당자를 최소화하고 접근 권한을 관리합니다.</li>
                            <li style={{ marginBottom: 6 }}>자료를 삭제하면 원본, 나눈 조각, 검색용 데이터까지 함께 삭제합니다.</li>
                        </ul>
                        <p style={{ fontSize: 13, color: 'var(--color-neutral-500)' }}>
                            AI 봇은 부정확하거나 부적절한 말을 할 수 있습니다. 중요한 내용은 직접 확인해 주시고 민감한 개인정보는 알려주지 마세요.
                            의료, 법률, 재무 같은 전문 분야의 결정은 반드시 전문가와 상담하세요.
                        </p>

                        {/* ===== 제13조 ===== */}
                        <h2 style={sectionTitle}>제13조 방침의 변경</h2>
                        <p>
                            법령이나 서비스가 바뀌면 이 방침을 고칠 수 있습니다. 고칠 때는 시행일과 변경 내용을 서비스에 알리며,
                            이용자 권리에 중대한 변경이 있으면 시행 30일 전에 알립니다.
                        </p>

                        {/* ===== 책임자 ===== */}
                        <h2 style={sectionTitle}>개인정보 보호 책임자</h2>

                        <div style={infoBox('#f9fafb', '#f0f0f0')}>
                            <table style={{ ...tableStyle, margin: 0 }}>
                                <tbody>
                                    <tr>
                                        <td style={{ ...tdStyle, fontWeight: 600, width: 120, border: 'none' }}>성명</td>
                                        <td style={{ ...tdStyle, border: 'none' }}>김진수</td>
                                    </tr>
                                    <tr>
                                        <td style={{ ...tdStyle, fontWeight: 600, border: 'none' }}>직책</td>
                                        <td style={{ ...tdStyle, border: 'none' }}>대표</td>
                                    </tr>
                                    <tr>
                                        <td style={{ ...tdStyle, fontWeight: 600, border: 'none' }}>이메일</td>
                                        <td style={{ ...tdStyle, border: 'none' }}>curious@mission-driven.kr</td>
                                    </tr>
                                    <tr>
                                        <td style={{ ...tdStyle, fontWeight: 600, border: 'none' }}>회사명</td>
                                        <td style={{ ...tdStyle, border: 'none' }}>(주)미션드리븐</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* 부칙 */}
                        <div style={{
                            marginTop: 48, padding: '20px 24px',
                            background: 'var(--color-neutral-50)', borderRadius: 12,
                            border: '1px solid var(--color-neutral-200)',
                        }}>
                            <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--color-neutral-500)' }}>
                                부칙
                            </p>
                            <p style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--color-neutral-400)' }}>
                                본 개인정보처리방침은 2026년 10월 5일부터 시행됩니다. 이전 방침(2026년 3월 12일 시행)은 이 방침으로 대체됩니다.
                            </p>
                            <p style={{ margin: 0, fontSize: 14, color: 'var(--color-neutral-400)' }}>
                                문의: <strong style={{ color: 'var(--color-neutral-500)' }}>curious@mission-driven.kr</strong>
                            </p>
                        </div>

                        <p style={{ marginTop: 24, fontSize: 13, color: 'var(--color-neutral-300)', textAlign: 'center' }}>
                            © 2026 (주)미션드리븐. All rights reserved.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    )
}
