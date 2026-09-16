/**
 * 만든 사진 보관 안내 — 대표 지시 2026-09-15
 * 「새로 생성한 거 다운로드는 48시간 이내까지 다운 가능. 그 이후에는 없어진다고 해」
 *
 * 중장년은 「나중에 받지」 하고 창을 닫는다. 그러면 사진이 없어진다.
 * 그래서 내려받기 단추 바로 밑에, 겁주지 않는 말로 한 줄 붙인다.
 */
import Link from 'next/link'

export default function KeepNotice() {
    return (
        <p
            style={{
                margin: '10px 0 0',
                fontSize: 15,
                lineHeight: 1.6,
                color: '#71717a',
                textAlign: 'center',
                wordBreak: 'keep-all',
            }}
        >
            만든 사진은 48시간까지만 보관합니다. 창을 닫으면 사라지니 지금 내려받아 두세요.
            <br />
            {/* 보관함으로 가는 길 — 파파님 피드백 2026-09-16
                「작업물을 모아볼 수 있는 마이페이지나 작업물 보관함이 있으면 좋겠습니다」
                보관함은 있었는데 위 메뉴를 열어야만 보여서 아무도 못 찾았다. 만든 자리에 길을 낸다. */}
            <Link
                href="/photos"
                style={{ color: 'var(--진초록)', fontWeight: 800, textDecoration: 'underline' }}
            >
                지금까지 만든 사진 모아 보기
            </Link>
        </p>
    )
}
