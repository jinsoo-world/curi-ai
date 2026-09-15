export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 대표 확정 2026-09-15 「비로그인도 바로 올려보게 해」
  //
  // 전에는 로그인을 안 했으면 아무것도 못 보고 /login 으로 튕겼다.
  // 우리가 파는 말은 「가입 없이도 하루 세 장」인데 대문에서 가입부터 요구한 셈이다.
  // 이제 로그인 여부와 상관없이 제품을 먼저 보여준다. 로그인은 원본을 받을 때 요구한다.
  void user
  redirect('/mentors')
}
