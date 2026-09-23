'use client'
// 연결 (/os/connect) = 설정에서 떼어 낸 독립 화면. 탭 2개: 「서비스」(내 계정 13개 붙이기) / 「스킬」(깃허브에서 가져온 봇 기술).
// 손님 = 4060 강사, 작가. 글자는 크게, 단추는 44px 이상, 색은 [data-theme="os"] 토큰만.
// 왼쪽 명단의 단추(OsShell)는 다른 손이 단다. 설정 화면에는 「연결 관리 → /os/connect」 링크만 남는다.

import { useEffect, useState } from 'react'
import ConnectorsPanel from '@/components/os/ConnectorsPanel'
import SkillsPanel from './SkillsPanel'
import '@/components/os/connect.css'

type Tab = 'services' | 'skills'

export default function OsConnectPage() {
    const [tab, setTab] = useState<Tab>('services')

    // ?tab=skills 로 들어오면 스킬 탭을 먼저 연다(효과 본문에서 바로 setState 하지 않는다)
    useEffect(() => {
        void Promise.resolve().then(() => {
            if (new URLSearchParams(window.location.search).get('tab') === 'skills') setTab('skills')
        })
    }, [])

    return (
        <div className="os-connect">
            <h1>연결</h1>
            <p className="os-connect-lead">
                {tab === 'services'
                    ? '내 계정으로 로그인해서 붙여요. 읽기는 봇이 알아서, 밖으로 보내기는 꼭 물어보고 해요.'
                    : '깃허브에 올라온 스킬 글을 가져와 봇에게 붙여요. 스킬은 참고 자료라서 승인 카드를 건너뛸 수 없어요.'}
            </p>

            <div className="os-connect-tabs" role="tablist" aria-label="연결 종류">
                <button type="button" role="tab" className="os-connect-tab" aria-selected={tab === 'services'} onClick={() => setTab('services')}>서비스</button>
                <button type="button" role="tab" className="os-connect-tab" aria-selected={tab === 'skills'} onClick={() => setTab('skills')}>스킬</button>
            </div>

            {tab === 'services' ? <ConnectorsPanel /> : <SkillsPanel />}
        </div>
    )
}
