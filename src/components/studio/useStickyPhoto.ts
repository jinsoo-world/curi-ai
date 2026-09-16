'use client'

/**
 * 올린 사진을 기억한다 — 파파님 피드백 2026-09-16
 *
 * 「충전 화면으로 갔다가 돌아오는 이전 버튼이 없어서 다시 초기 설정을 해야 합니다」
 *
 * 돌아가기 단추만 달아서는 절반이다. 고른 값(배경·나이)은 useSticky 가 이미 기억하는데
 * 정작 **올린 사진**이 날아갔다. 사진을 다시 찾아 올리는 게 중장년에게는 가장 큰 일이다.
 *
 * 세션 저장소에 둔다(브라우저 탭을 닫으면 사라진다). 사진은 남의 눈에 보이면 안 되는 것이라
 * localStorage 처럼 오래 남기지 않는다.
 *
 * ⚠️ 저장소 한도(보통 5MB)를 넘으면 조용히 저장을 포기한다. 저장 실패가 도구를 멈추면 안 된다.
 */
import { useEffect, useRef, useState } from 'react'

/** 이 크기를 넘는 사진은 저장하지 않는다 — 한도를 넘겨 다른 저장까지 깨뜨리지 않으려고 */
const 저장한계 = 3_500_000

export interface 보관사진 { dataUrl: string; mimeType: string }

export function useStickyPhoto(키: string): [보관사진 | null, (v: 보관사진 | null) => void, boolean] {
    const [사진, set사진] = useState<보관사진 | null>(null)
    const [불러왔다, set불러왔다] = useState(false)
    const 저장키 = useRef(`curi_photo_${키}`)

    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(저장키.current)
            if (raw) {
                const v = JSON.parse(raw) as 보관사진
                if (typeof v?.dataUrl === 'string' && v.dataUrl.startsWith('data:image/')) set사진(v)
            }
        } catch {
            // 사생활 보호 모드 등에서 막힐 수 있다. 그냥 새로 올리게 둔다.
        }
        set불러왔다(true)
    }, [])

    const 바꾸기 = (v: 보관사진 | null) => {
        set사진(v)
        try {
            if (!v) sessionStorage.removeItem(저장키.current)
            else if (v.dataUrl.length <= 저장한계) sessionStorage.setItem(저장키.current, JSON.stringify(v))
            else sessionStorage.removeItem(저장키.current)
        } catch {}
    }

    return [사진, 바꾸기, 불러왔다]
}
