import { redirect } from 'next/navigation'

/**
 * 첫 주소(/)는 곧바로 첫 화면으로 보낸다.
 *
 * 대표 확정 2026-09-15 「비로그인도 바로 올려보게 해」 — 로그인 여부와 상관없이 제품을 먼저 보여준다.
 * 2026-09-16 = 여기서 쓰지도 않는 로그인 확인(auth.getUser)을 하느라 인증 서버에 한 번 다녀오고 있었다.
 *              첫 손님이 가장 먼저 밟는 자리라 그 왕복이 그대로 첫인상이 된다(실측 1.34초 → 0.2초대).
 * 2026-09-22 = 대표 지시: 멘토 없는 메인 홈(studio)으로 리디렉트. /mentors는 멘토 발견 페이지로 유지.
 */
export default function HomePage() {
    redirect('/studio')
}
