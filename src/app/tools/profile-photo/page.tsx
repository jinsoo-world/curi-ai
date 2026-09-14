import { redirect } from 'next/navigation'

// 대표 확정 2026-09-15 = 서비스는 여섯 개다. 이 도구는 「teacher-photo」로 합쳤다.
// 주소를 지우지 않고 보내는 이유 = 카톡으로 이미 나간 링크가 죽으면 안 된다.
export default function Page() {
    redirect('/tools/teacher-photo')
}
