'use client'

/**
 * 첫 방문에 뜨는 창 — 「앱으로 설치」 안내.
 *
 * 전에는 「클로버 최대 70퍼센트 할인 중」 띠였다(대표 확정 0915).
 * 대표 지시 0923 「앱 설치 아주 좋아. 이거 조금 더 보여지게. 클로버 70% 할인중 모달보다 훨 나으니 바꿔」
 * → 안내 창은 pwa/InstallModal 하나. 이름(MembershipBanner)은 그대로 둔다.
 *   화면 3곳(발견·마이페이지·대화 목록)이 이미 이 이름으로 부르고 있어서, 이름을 바꾸면 관계없는 파일을 건드리게 된다.
 * 하루 1회, 설치가 끝났으면 다시 안 뜬다(규칙은 InstallModal 안에).
 */
import InstallModal from '@/components/pwa/InstallModal'

export function MembershipBanner() {
    return <InstallModal />
}
