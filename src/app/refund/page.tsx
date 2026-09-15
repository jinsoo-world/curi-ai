// 취소·환불 정책 — 2026-09-15 신설
//
// 왜 만들었나 = 토스 카드사 심사가 「환불규정 화면」 캡처를 요구하는데 큐리AI 에는 환불 문구가
// 한 줄도 없었다(약관 전수 검색 0건). 심사 3단계가 여기서 막힌다.
//
// 기준 = 전자상거래법 제17조. 클로버는 나눠 쓸 수 있는 재화라 「쓴 만큼 빼고 남은 만큼 돌려준다」가
// 성립한다. 전부 못 돌려준다고 쓰면 법에 걸리고, 다 돌려준다고 쓰면 우리가 원가를 떠안는다.
//
// ⚠️ 숫자를 고칠 때 = 유효기간 5년은 상법상 상사채권 소멸시효에 맞춘 값이다. 줄이려면 법률 확인 먼저.

import Link from 'next/link'

const 회색 = '#4b5563'
const 검정 = '#18181b'

function 조({ 제목, children }: { 제목: string; children: React.ReactNode }) {
    return (
        <>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 검정, margin: '32px 0 12px' }}>
                {제목}
            </h2>
            {children}
        </>
    )
}

export default function RefundPage() {
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
                    <Link href="/login" style={{
                        fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em',
                        background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        textDecoration: 'none',
                    }}>
                        🤖 큐리 AI
                    </Link>
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
                        fontSize: 28, fontWeight: 800, color: 검정,
                        marginBottom: 32, letterSpacing: '-0.02em',
                    }}>
                        취소·환불 정책
                    </h1>

                    <div style={{ fontSize: 15, lineHeight: 1.8, color: 회색 }}>
                        <p style={{ marginBottom: 24 }}>
                            <strong>시행일:</strong> 2026년 9월 15일
                        </p>

                        <조 제목="제1조 (클로버란)">
                            <p>
                                클로버는 큐리 AI 안에서 대화와 이미지 만들기에 쓰는 이용권입니다.
                                현금처럼 쓰거나 다른 사람에게 넘길 수 없고, 큐리 AI 밖에서는 사용할 수 없습니다.
                            </p>
                        </조>

                        <조 제목="제2조 (구매 취소와 환불 기준)">
                            <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                                <li style={{ marginBottom: 8 }}>
                                    구매일로부터 <strong>7일 이내</strong>이고 산 클로버를 <strong>한 개도 쓰지 않았다면</strong> 전액 돌려드립니다.
                                </li>
                                <li style={{ marginBottom: 8 }}>
                                    일부만 썼다면 <strong>남은 클로버에 해당하는 금액</strong>을 돌려드립니다.
                                    계산은 <strong>결제금액 × (남은 클로버 ÷ 받은 클로버)</strong>입니다.
                                </li>
                                <li style={{ marginBottom: 8 }}>
                                    이미 쓴 클로버는 돌려드릴 수 없습니다. 대화나 이미지가 이미 만들어졌기 때문입니다.
                                </li>
                                <li style={{ marginBottom: 8 }}>
                                    행사나 이벤트로 무료로 드린 클로버는 환불 대상이 아닙니다.
                                </li>
                            </ul>
                            <p style={{ marginTop: 12 }}>
                                예) 19,900원에 1,000클로버를 사고 400클로버를 썼다면, 남은 600클로버에 해당하는
                                11,940원을 돌려드립니다.
                            </p>
                        </조>

                        <조 제목="제3조 (환불 신청 방법)">
                            <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                                <li style={{ marginBottom: 8 }}>
                                    <strong>curious@mission-driven.kr</strong> 또는 <strong>010-9716-6015</strong>로 신청해 주세요.
                                </li>
                                <li style={{ marginBottom: 8 }}>
                                    신청하실 때 가입하신 계정과 결제하신 날짜를 함께 알려주세요.
                                </li>
                                <li style={{ marginBottom: 8 }}>
                                    접수 후 <strong>3영업일 이내</strong>에 처리하고 결과를 알려드립니다.
                                </li>
                                <li style={{ marginBottom: 8 }}>
                                    환불은 결제하신 수단으로 돌려드립니다. 카드로 결제하신 경우 카드사 사정에 따라
                                    취소가 카드 명세에 뜨기까지 3~5영업일이 더 걸릴 수 있습니다.
                                </li>
                            </ul>
                        </조>

                        <조 제목="제4조 (클로버 유효기간)">
                            <p>
                                클로버는 마지막으로 충전한 날로부터 <strong>5년</strong> 동안 쓸 수 있습니다.
                                기간이 끝나기 전에 미리 알려드립니다.
                            </p>
                        </조>

                        <조 제목="제5조 (서비스가 멈추는 경우)">
                            <p>
                                회사 사정으로 서비스를 더 제공할 수 없게 되면, 남아 있는 클로버는 사용 여부와 관계없이
                                해당 금액을 전액 돌려드립니다.
                            </p>
                        </조>

                        <조 제목="제6조 (회사 잘못으로 못 쓴 경우)">
                            <p>
                                서버 장애처럼 회사 잘못으로 클로버가 잘못 빠져나갔다면, 확인한 뒤 같은 양을 다시 넣어드리거나
                                해당 금액을 돌려드립니다.
                            </p>
                        </조>

                        <div style={{
                            marginTop: 48, padding: '20px 24px',
                            background: '#f9fafb', borderRadius: 12,
                            fontSize: 14, lineHeight: 1.8,
                        }}>
                            <strong style={{ color: 검정 }}>문의</strong>
                            <div style={{ marginTop: 8 }}>
                                미션드리븐 (대표 : 김진수)<br />
                                사업자등록번호 : 277-88-02697 ㅣ 통신판매번호 : 2023-서울마포-2003<br />
                                전화번호 : 010-9716-6015 ㅣ 이메일 : curious@mission-driven.kr<br />
                                주소 : 서울특별시 마포구 성지길 25-11 3층 비123호
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
