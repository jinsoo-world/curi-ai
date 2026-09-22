'use client'

// 사업자 정보 푸터 — 전자상거래법 제10조 필수표시 + 토스 카드사 심사 하단정보 요건
//
// 심사가 요구하는 6가지(2026-09-15 토스 결제경로 가이드 230701 기준):
//   상호명 / 사업자등록번호 / 대표자명 / 사업자주소 / 상점 전화번호 / 통신판매업신고번호
// 이 여섯 개가 한 화면에 다 보여야 한다. 하나라도 빠지면 반려된다.
//
// ⚠️ 전화번호는 대표 확정 2026-09-15 「010-9716-6015로 넣어. 법인폰이야」
//    옛 1533-0701 은 착신 여부가 확인되지 않아 뺐다(허위표시 위험).
// ⚠️ 주소는 본점이전 확정(2026-09-06) 반영. 옛 신촌로2길 주소는 폐기.
//
// 로그인·리더목록·충전 세 화면이 같이 쓴다. 고칠 일이 생기면 여기만 고친다.

import Link from 'next/link'

interface Props {
    /** 가운데 정렬 폭. 화면마다 본문 폭이 달라서 받는다. */
    maxWidth?: number
    /** 위쪽 여백 */
    marginTop?: number
}

export default function BizFooter({ maxWidth = 400, marginTop = 32 }: Props) {
    return (
        <footer style={{
            position: 'relative', zIndex: 10,
            width: '100%', maxWidth,
            margin: `${marginTop}px auto 0`,
            padding: '24px 0 16px',
            borderTop: '1px solid #e5e7eb',
        }}>
            <div style={{
                fontSize: 12, color: '#9ca3af', lineHeight: 1.9,
                letterSpacing: '-0.01em',
            }}>
                <div>미션드리븐 (대표 : 김진수) ㅣ curious@mission-driven.kr</div>
                <div>사업자등록번호 : 277-88-02697 ㅣ 통신판매번호 : 2023-서울마포-2003</div>
                <div>전화번호 : 010-9716-6015</div>
                <div style={{ wordBreak: 'keep-all' }}>
                    사무실 : 서울특별시 마포구 성지길 25-11 3층 비123호
                </div>
            </div>

            <div style={{
                display: 'flex', gap: 4, marginTop: 14,
                fontSize: 12, flexWrap: 'wrap',
            }}>
                <Link href="/privacy" style={{ color: '#6b7280', textDecoration: 'none', fontWeight: 600 }}>
                    개인정보처리방침
                </Link>
                <span style={{ color: '#d1d5db' }}>ㅣ</span>
                <Link href="/terms" style={{ color: '#6b7280', textDecoration: 'none' }}>
                    서비스이용약관
                </Link>
                <span style={{ color: '#d1d5db' }}>ㅣ</span>
                <Link href="/refund" style={{ color: '#6b7280', textDecoration: 'none' }}>
                    취소/환불정책
                </Link>
                <span aria-hidden="true" style={{ color: '#d1d5db' }}>ㅣ</span>
                <Link
                    href="/en"
                    lang="en"
                    hrefLang="en"
                    style={{ color: '#6b7280', textDecoration: 'none' }}
                >
                    English
                </Link>
            </div>

            <div style={{
                fontSize: 11, color: '#d1d5db', marginTop: 12,
            }}>
                Copyright © 미션드리븐 All rights reserved.
            </div>
        </footer>
    )
}
