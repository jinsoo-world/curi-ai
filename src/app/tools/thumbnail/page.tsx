import { redirect } from 'next/navigation'

/**
 * 썸네일 만들기 — 2026-09-22 Hub에서 제거
 * 
 * CEO 확정: Hub는 강사/배우/화질개선 3개만 유지
 * 주소를 죽이지 않고 리다이렉트 — 외부에서 온 링크가 404 뜨지 않게
 */
export default function ThumbnailRedirect() {
    redirect('/tools')
}
