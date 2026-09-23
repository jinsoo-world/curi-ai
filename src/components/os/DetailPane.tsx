'use client'
// 오른쪽 세부칸 (그록봇 = 「봇의 화면」+ 루틴 + 멤버). 우리 P0 = 이 봇이 읽은 자료 + 승인 모드 + 루틴 자리.

import type { TeamBot } from '@/domains/os/types'
import KnowledgeList from './KnowledgeList'
import RoutinePanel from './RoutinePanel'

const ROLE_LABEL: Record<TeamBot['role'], string> = { twin: '디지털 나', chief: '비서실장', helper: '도우미' }
const APPROVAL_LABEL: Record<TeamBot['approvalMode'], string> = {
    always_ask: '보내기 전 항상 물어봐요',
    draft_only: '초안만 만들어요 (밖으로 안 나감)',
    auto_safe: '되돌릴 수 있는 일은 알아서 (지금은 항상 물어봐요와 같음)',
}

export default function DetailPane({ bot, publicName }: { bot: TeamBot | null; publicName: string | null }) {
    if (!bot) {
        return (
            <div>
                <h4>이 봇</h4>
                <div className="os-card">{publicName ? <><b>{publicName}</b>은 리더가 만든 공개 봇이에요. 내 팀에 넣는 기능은 곧 열려요.</> : '봇 정보를 불러오는 중…'}</div>
            </div>
        )
    }
    return (
        <div>
            <h4>이 봇</h4>
            <div className="os-card">
                <b>{bot.name}</b> / {ROLE_LABEL[bot.role]}<br />
                {bot.oneLiner && <span>{bot.oneLiner}</span>}
            </div>

            <h4>승인</h4>
            <div className="os-card">{APPROVAL_LABEL[bot.approvalMode]}<br /><span style={{ fontSize: 13 }}>보내기, 게시, 결제, 삭제는 카드로 물어보고, 허용해야만 나가요.</span></div>

            {/* 자료는 진짜 목록이다 (3일차). 넣고 빼는 것도 여기서 한다 */}
            <KnowledgeList mentorId={bot.mentorId} />

            {/* 루틴 = 목록, 만들기, 시험 실행 (5일차) */}
            <RoutinePanel mentorId={bot.mentorId} botName={bot.name} />

            {/* 이번 주 = 미룬 일, 승인, 체크인, 자료 (세부칸 맨 아래) */}
        </div>
    )
}
