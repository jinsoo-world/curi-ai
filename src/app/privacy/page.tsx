

export default function PrivacyPage() {
    const sectionTitle = {
        fontSize: 20, fontWeight: 700, color: '#18181b',
        margin: '40px 0 16px', letterSpacing: '-0.01em',
    } as const;

    const subTitle = {
        fontSize: 16, fontWeight: 600, color: '#18181b',
        margin: '24px 0 8px',
    } as const;

    const tableStyle = {
        width: '100%', borderCollapse: 'collapse' as const,
        margin: '12px 0', fontSize: 14,
    };

    const thStyle = {
        padding: '10px 16px', textAlign: 'left' as const,
        borderBottom: '2px solid #e5e7eb', fontWeight: 600,
        background: '#f9fafb',
    };

    const tdStyle = {
        padding: '10px 16px', borderBottom: '1px solid #f0f0f0',
    };

    const infoBox = (bg: string, border: string) => ({
        padding: '16px 20px', background: bg,
        borderRadius: 12, border: `1px solid ${border}`,
        margin: '16px 0',
    });

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
                    height: 64, gap: 12,
                }}>
                    <a href="/mentors" style={{
                        fontSize: 14, color: '#9ca3af', textDecoration: 'none',
                    }}>← 뒤로가기</a>
                    <a href="/mentors" style={{
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
                        marginBottom: 8, letterSpacing: '-0.02em',
                    }}>
                        개인정보처리방침
                    </h1>
                    <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: 32 }}>
                        시행일: 2026년 3월 12일
                    </p>

                    {/* 목차 */}
                    <div style={infoBox('#f9fafb', '#f0f0f0')}>
                        <p style={{ margin: '0 0 12px', fontWeight: 700, fontSize: 15, color: '#18181b' }}>목차</p>
                        <ol style={{ paddingLeft: 20, margin: 0, fontSize: 14, lineHeight: 2, color: '#4b5563' }}>
                            <li>개인정보의 수집</li>
                            <li>개인정보의 이용</li>
                            <li>개인정보의 보유 및 제공</li>
                            <li>정보주체의 권리와 행사방법</li>
                            <li>개인정보의 파기</li>
                            <li>AI 학습 데이터 활용</li>
                            <li>기타 (쿠키, 보안, 아동 등)</li>
                        </ol>
                    </div>

                    <div style={{ fontSize: 15, lineHeight: 1.8, color: '#4b5563' }}>

                        {/* ===== 제1조 ===== */}
                        <h2 style={sectionTitle}>제1조 개인정보의 수집</h2>

                        <p>
                            (주)미션드리븐(이하 &quot;회사&quot;)은 이용자들의 개인정보를 중요시합니다.
                            회사가 이용자에게 제공하는 큐리 AI(이하 &quot;서비스&quot;)를 이용자가 이용함과 동시에
                            온라인상에서 회사에 제공한 개인정보가 보호받을 수 있도록 최선을 다하고 있습니다.
                            이를 위해 회사는 개인정보보호법, 통신비밀보호법, 전기통신사업법,
                            정보통신망 이용촉진 등에 관한 법률 등 관련 법규상의 개인정보보호 규정을 준수합니다.
                        </p>

                        <p style={{ marginTop: 12 }}>
                            서비스 제공을 위한 필요 최소한의 개인정보를 수집하고 있습니다.
                            이용자의 개인정보를 수집하는 경우에는 반드시 사전에 이용자에게 해당 사실을 알리고 동의를 구합니다.
                        </p>

                        <ul style={{ paddingLeft: 20, margin: '12px 0' }}>
                            <li style={{ marginBottom: 6 }}><strong>필수 정보:</strong> 해당 서비스의 본질적 기능을 수행하기 위한 정보</li>
                            <li style={{ marginBottom: 6 }}><strong>선택 정보:</strong> 보다 특화된 서비스를 제공하기 위해 추가 수집하는 정보</li>
                        </ul>

                        <p style={{ marginTop: 12 }}>본 방침에서 사용하는 용어의 정의는 다음과 같습니다:</p>
                        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                            <li style={{ marginBottom: 6 }}><strong>크리에이터:</strong> 서비스를 통해 자신의 AI 멘토를 생성하고 관리하는 이용자</li>
                            <li style={{ marginBottom: 6 }}><strong>AI 멘토:</strong> 크리에이터의 지식, 경험, 전문성 등을 학습한 AI 캐릭터</li>
                            <li style={{ marginBottom: 6 }}><strong>일반 이용자:</strong> 크리에이터가 생성한 AI 멘토와 대화하는 이용자</li>
                        </ul>

                        {/* 수집 항목 테이블 */}
                        <p style={subTitle}>서비스별 수집 항목</p>

                        <table style={tableStyle}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>구분</th>
                                    <th style={thStyle}>필수</th>
                                    <th style={thStyle}>선택</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>회원가입 (소셜 로그인)</td>
                                    <td style={tdStyle}>소셜 ID, 이메일, 이름</td>
                                    <td style={tdStyle}>성별, 생일, 출생 연도, 전화번호, 프로필 사진</td>
                                </tr>
                                <tr>
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>AI 멘토 대화</td>
                                    <td style={tdStyle}>대화 내용, 대화 시각</td>
                                    <td style={tdStyle}>메시지 피드백(좋아요/싫어요)</td>
                                </tr>
                                <tr>
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>크리에이터 AI 만들기</td>
                                    <td style={tdStyle}>AI 이름, 소개, 시스템 프롬프트</td>
                                    <td style={tdStyle}>업로드 문서(HWP/PDF/DOCX/PPT), 프로필 이미지</td>
                                </tr>
                                <tr>
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>결제 및 크레딧 충전</td>
                                    <td style={tdStyle}>결제 수단 종류, 결제 금액, 결제 일시</td>
                                    <td style={tdStyle}>—</td>
                                </tr>
                                <tr>
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>미션 보상 / 레퍼럴</td>
                                    <td style={tdStyle}>미션 수행 기록, 초대 코드</td>
                                    <td style={tdStyle}>—</td>
                                </tr>
                            </tbody>
                        </table>

                        <p style={subTitle}>자동 수집 정보</p>
                        <p>
                            서비스 이용 과정에서 다음 정보가 자동으로 수집될 수 있습니다:{' '}
                            IP 주소, 쿠키, 접속 로그, 서비스 이용 기록, 기기 정보(OS, 브라우저 정보)
                        </p>

                        <p style={subTitle}>개인정보 수집 방법</p>
                        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                            <li style={{ marginBottom: 6 }}>회원가입 및 서비스 이용 과정에서 이용자가 동의하는 경우</li>
                            <li style={{ marginBottom: 6 }}>소셜 로그인(Google, 카카오) 시 해당 소셜 미디어사로부터 제공받는 경우</li>
                            <li style={{ marginBottom: 6 }}>고객센터를 통한 상담 과정에서 수집하는 경우</li>
                        </ul>

                        {/* ===== 제2조 ===== */}
                        <h2 style={sectionTitle}>제2조 개인정보의 이용</h2>

                        <p>이용자의 개인정보를 다음과 같은 목적으로만 이용하며, 목적이 변경될 경우 반드시 사전에 동의를 구합니다.</p>
                        <ol style={{ paddingLeft: 20, margin: '12px 0' }}>
                            <li style={{ marginBottom: 8 }}>회원 식별, 가입 의사 확인, 본인 확인 및 인증</li>
                            <li style={{ marginBottom: 8 }}>AI 멘토링 대화 서비스 제공 및 개인화</li>
                            <li style={{ marginBottom: 8 }}>크리에이터 AI 멘토 생성 및 지식 학습 (문서 파싱, RAG)</li>
                            <li style={{ marginBottom: 8 }}>크레딧 충전, 결제 처리, 크리에이터 수익 정산</li>
                            <li style={{ marginBottom: 8 }}>미션 보상(🍀 클로버) 및 레퍼럴(친구 초대) 시스템 운영</li>
                            <li style={{ marginBottom: 8 }}>인구통계학적 특성과 이용자의 관심, 기호, 성향의 추정을 통한 맞춤형 멘토 추천 및 마케팅 활용</li>
                            <li style={{ marginBottom: 8 }}>서비스 개선, 신규 기능 개발, 이용 통계 분석</li>
                            <li style={{ marginBottom: 8 }}>이용자 문의 대응 및 공지사항 전달</li>
                            <li style={{ marginBottom: 8 }}>부정 이용 방지 및 서비스의 원활한 운영에 지장을 주는 행위에 대한 방지 및 제재</li>
                            <li style={{ marginBottom: 8 }}>해킹, 사기 등 관련 사고 조사 및 기타 법령상 의무 이행</li>
                        </ol>

                        {/* ===== 제3조 ===== */}
                        <h2 style={sectionTitle}>제3조 개인정보의 보유 및 제공</h2>

                        <p>
                            ① 이용자의 탈퇴 요청 혹은 수집 및 이용 목적이 달성된 때까지 보존하며,
                            이후에는 해당 정보를 지체 없이 파기합니다.
                        </p>

                        <p>② 법령에 따라 아래 기간 동안 보관합니다.</p>
                        <table style={tableStyle}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>보관 정보</th>
                                    <th style={thStyle}>보존 근거</th>
                                    <th style={thStyle}>기간</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style={tdStyle}>계약 또는 청약철회 등에 관한 기록</td>
                                    <td style={tdStyle}>전자상거래법</td>
                                    <td style={tdStyle}>5년</td>
                                </tr>
                                <tr>
                                    <td style={tdStyle}>대금결제 및 재화 등의 공급에 관한 기록</td>
                                    <td style={tdStyle}>전자상거래법</td>
                                    <td style={tdStyle}>5년</td>
                                </tr>
                                <tr>
                                    <td style={tdStyle}>소비자 불만 또는 분쟁처리에 관한 기록</td>
                                    <td style={tdStyle}>전자상거래법</td>
                                    <td style={tdStyle}>3년</td>
                                </tr>
                                <tr>
                                    <td style={tdStyle}>표시·광고에 관한 기록</td>
                                    <td style={tdStyle}>전자상거래법</td>
                                    <td style={tdStyle}>6개월</td>
                                </tr>
                                <tr>
                                    <td style={tdStyle}>서비스 이용 관련 로그인 기록</td>
                                    <td style={tdStyle}>통신비밀보호법</td>
                                    <td style={tdStyle}>3개월</td>
                                </tr>
                            </tbody>
                        </table>

                        <p>
                            ③ 개인정보 수집 및 이용에 대한 동의를 거부할 권리가 있으며, 필수 정보에 대한 동의 거부 시 서비스 이용이 제한됩니다.
                        </p>

                        <p>
                            ④ 이용자의 별도 동의가 있는 경우, 법령에 규정된 경우 등을 제외하고는
                            이용자의 개인정보를 제3자에게 제공하지 않습니다.
                        </p>

                        <p style={subTitle}>처리 위탁 현황</p>
                        <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>
                            서비스 제공을 위해 아래와 같은 업무를 위탁하고 있으며, 위탁받은 업체가 관계 법령을 준수하도록 관리·감독하고 있습니다.
                        </p>
                        <table style={tableStyle}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>수탁 업체명</th>
                                    <th style={thStyle}>위탁 업무 내용</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style={tdStyle}>Supabase Inc.</td>
                                    <td style={tdStyle}>회원 인증, 데이터 저장</td>
                                </tr>
                                <tr>
                                    <td style={tdStyle}>Google LLC</td>
                                    <td style={tdStyle}>AI 서비스 제공</td>
                                </tr>
                                <tr>
                                    <td style={tdStyle}>(주)비바리퍼블리카 (토스페이먼츠)</td>
                                    <td style={tdStyle}>결제 처리</td>
                                </tr>
                                <tr>
                                    <td style={tdStyle}>(주)카카오</td>
                                    <td style={tdStyle}>소셜 로그인</td>
                                </tr>
                            </tbody>
                        </table>

                        <p style={subTitle}>크리에이터에 대한 정보 공개</p>
                        <p>
                            AI 멘토를 생성한 크리에이터는 자신의 AI 멘토와 이용자 간의 대화 통계(대화 수, 자주 묻는 질문 등)를
                            확인할 수 있습니다. 단, 개별 이용자의 대화 내용 원문은 크리에이터에게 직접 제공되지 않습니다.
                        </p>

                        {/* ===== 제4조 ===== */}
                        <h2 style={sectionTitle}>제4조 정보주체의 권리, 의무 및 행사방법</h2>

                        <p>이용자는 개인정보주체로서 다음과 같은 권리를 행사할 수 있습니다.</p>
                        <ol style={{ paddingLeft: 20, margin: '12px 0' }}>
                            <li style={{ marginBottom: 8 }}>이용자는 회사에 대해 언제든지 개인정보 <strong>열람, 정정, 삭제, 처리정지</strong> 요구 등의 권리를 행사할 수 있습니다.</li>
                            <li style={{ marginBottom: 8 }}>권리 행사는 「개인정보 보호법」 시행규칙 별지 제8호 서식에 따라 서면, 전자우편 등을 통해 가능하며, 회사는 이에 대해 지체 없이 조치합니다.</li>
                            <li style={{ marginBottom: 8 }}>이용자는 법정대리인이나 위임을 받은 자 등 대리인을 통하여 권리를 행사할 수 있습니다.</li>
                            <li style={{ marginBottom: 8 }}>이용자 혹은 법정대리인이 개인정보의 오류에 대한 정정을 요구한 경우, 회사는 정정 또는 삭제를 완료할 때까지 당해 개인정보를 이용하거나 제공하지 않습니다.</li>
                            <li style={{ marginBottom: 8 }}>이용자는 「개인정보 보호법」 등 관계법령을 위반하여 회사가 처리하고 있는 이용자 본인이나 타인의 개인정보 및 사생활을 침해해서는 안 됩니다.</li>
                        </ol>

                        <div style={infoBox('#fef3c7', '#fde68a')}>
                            <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: 14, color: '#18181b' }}>권익침해 구제방법</p>
                            <p style={{ margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 2 }}>
                                개인정보침해 신고센터: (국번없이) 118 · <a href="https://privacy.kisa.or.kr" style={{ color: '#3b82f6' }}>privacy.kisa.or.kr</a><br/>
                                대검찰청 사이버수사과: (국번없이) 1301 · <a href="https://spo.go.kr" style={{ color: '#3b82f6' }}>spo.go.kr</a><br/>
                                경찰청 사이버안전국: (국번없이) 182 · <a href="https://ecrm.police.go.kr" style={{ color: '#3b82f6' }}>ecrm.police.go.kr</a><br/>
                                개인정보분쟁조정위원회: (국번없이) 1833-6972 · <a href="https://www.kopico.go.kr" style={{ color: '#3b82f6' }}>kopico.go.kr</a>
                            </p>
                        </div>

                        {/* ===== 제5조 ===== */}
                        <h2 style={sectionTitle}>제5조 개인정보의 파기</h2>

                        <p>
                            개인정보는 수집 및 이용 목적이 달성되면 지체 없이 재생이 불가능한 방법으로 파기합니다.
                        </p>
                        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                            <li style={{ marginBottom: 6 }}><strong>전자적 파일:</strong> 복원이 불가능한 방법으로 영구 삭제</li>
                            <li style={{ marginBottom: 6 }}><strong>종이 문서:</strong> 분쇄기로 분쇄하거나 소각</li>
                        </ul>
                        <p>
                            법령에 따라 일정 기간 보관해야 하는 개인정보는 제3조의 기간 동안 보관 후 파기합니다.
                        </p>

                        {/* ===== 제6조 ===== */}
                        <h2 style={sectionTitle}>제6조 AI 학습 데이터 활용</h2>

                        <ol style={{ paddingLeft: 20, margin: '12px 0' }}>
                            <li style={{ marginBottom: 8 }}>AI 멘토의 대화 품질 개선 및 멘토링 알고리즘 고도화를 위해 대화 데이터를 활용할 수 있습니다.</li>
                            <li style={{ marginBottom: 8 }}>수집된 대화 데이터는 <strong>비식별화(익명화) 처리</strong> 후 AI 모델 학습에 활용됩니다.</li>
                            <li style={{ marginBottom: 8 }}>크리에이터에게 대화 통계(대화 수, 주제 분포 등)가 제공될 수 있으나, 개별 이용자의 대화 원문은 전달되지 않습니다.</li>
                            <li style={{ marginBottom: 8 }}>크리에이터가 업로드한 문서(HWP/PDF/DOCX/PPT)는 <strong>해당 AI 멘토의 지식 학습에만</strong> 사용되며, 다른 AI 멘토에 활용되지 않습니다.</li>
                        </ol>

                        <div style={infoBox('#ecfdf5', '#a7f3d0')}>
                            <p style={{ margin: 0, fontSize: 14 }}>
                                💡 <strong>큐리 AI는 이용자의 데이터를 소중히 다룹니다.</strong><br/>
                                모든 대화 데이터는 비식별화 후 활용되며, 개별 이용자를 특정할 수 있는 형태로는 외부에 공유되지 않습니다.
                            </p>
                        </div>

                        {/* ===== 제7조 ===== */}
                        <h2 style={sectionTitle}>제7조 기타</h2>

                        <p>
                            ① 언제든 자신의 개인정보를 조회하거나 수정할 수 있으며, 수집·이용에 대한 동의 철회 또는 탈퇴를 요청할 수 있습니다.
                        </p>

                        <p>
                            ② 만 14세 미만 아동의 개인정보는 수집하지 않습니다. 만 14세 미만인 경우 서비스에 가입하지 마십시오.
                            만 14세 미만 아동이 개인정보를 제공한 사실을 알게 되면 해당 정보를 즉시 삭제합니다.
                        </p>

                        <p style={subTitle}>③ 쿠키(Cookie)</p>
                        <p>
                            서비스는 웹사이트 운영에 쿠키를 사용합니다. 개인화되고 맞춤화된 서비스를 제공하기 위해
                            이용자의 정보를 저장하고 수시로 불러오는 쿠키를 사용합니다.
                        </p>
                        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                            <li style={{ marginBottom: 6 }}><strong>필수 쿠키:</strong> 로그인 등 서비스 기능 제공에 필요</li>
                            <li style={{ marginBottom: 6 }}><strong>분석 쿠키:</strong> Vercel Analytics를 통한 서비스 이용 패턴 분석</li>
                        </ul>
                        <p>
                            쿠키에는 이름, 전화번호 등 개인을 식별하는 정보를 저장하지 않으며, 이용자는 쿠키 설치에 대한 선택권을 가지고 있습니다.
                        </p>
                        <div style={infoBox('#f9fafb', '#f0f0f0')}>
                            <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: 14, color: '#18181b' }}>쿠키 수집 거부 방법</p>
                            <p style={{ margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 2 }}>
                                Chrome: [설정] → [개인정보 및 보안] → [쿠키 및 기타 사이트 데이터]<br/>
                                Safari: [환경설정] → [개인정보] → [쿠키 및 웹사이트 데이터 수준]<br/>
                                Edge: [설정] → [쿠키 및 사이트 권한]
                            </p>
                        </div>

                        <p style={subTitle}>④ 보안 조치</p>
                        <p>
                            회사는 이용자의 개인정보 보호를 위해 다음의 노력을 하고 있습니다.
                        </p>
                        <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                            <li style={{ marginBottom: 6 }}>암호화된 통신구간(HTTPS/TLS)을 이용하여 개인정보 전송</li>
                            <li style={{ marginBottom: 6 }}>Supabase Row Level Security(RLS)를 적용하여 접근권한 관리</li>
                            <li style={{ marginBottom: 6 }}>개인정보를 취급하는 직원을 최소화하고 보안 교육 실시</li>
                            <li style={{ marginBottom: 6 }}>클라우드 인프라(Supabase, Vercel)의 물리적 보안 정책 준수</li>
                        </ul>

                        <p style={subTitle}>⑤ AI 멘토링 한계 안내</p>
                        <div style={infoBox('#f9fafb', '#f0f0f0')}>
                            <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
                                AI 멘토가 부정확하거나 부적절한 내용을 말할 수 있습니다.
                                멘토의 조언이 사실인지 직접 확인해 주시고, 민감한 개인정보는 알려주지 마세요.
                                의료·법률·재무 등 전문 분야 결정은 반드시 전문가와 상담하세요.
                            </p>
                        </div>

                        <p style={subTitle}>⑥ 개인정보처리방침의 변경</p>
                        <p>
                            법률이나 서비스의 변경사항을 반영하기 위해 개인정보처리방침을 수정할 수 있습니다.
                            변경 사항을 게시하며, 변경된 개인정보처리방침은 게시한 날로부터 7일 후 효력이 발생합니다.
                            수집하는 개인정보의 항목, 이용 목적의 변경 등 이용자 권리의 중대한 변경이 발생할 때에는
                            최소 30일 전에 미리 알려드리겠습니다.
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
                                        <td style={{ ...tdStyle, border: 'none' }}>jin@mission-driven.kr</td>
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
                            background: '#f9fafb', borderRadius: 12,
                            border: '1px solid #f0f0f0',
                        }}>
                            <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#6b7280' }}>
                                부칙
                            </p>
                            <p style={{ margin: '0 0 4px', fontSize: 14, color: '#9ca3af' }}>
                                본 개인정보처리방침은 2026년 3월 12일부터 시행됩니다.
                            </p>
                            <p style={{ margin: 0, fontSize: 14, color: '#9ca3af' }}>
                                문의: <strong style={{ color: '#6b7280' }}>jin@mission-driven.kr</strong>
                            </p>
                        </div>

                        <p style={{ marginTop: 24, fontSize: 13, color: '#d1d5db', textAlign: 'center' }}>
                            © 2026 (주)미션드리븐. All rights reserved.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    )
}
