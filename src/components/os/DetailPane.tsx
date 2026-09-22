'use client'
// 오른쪽 세부칸 (그록봇 = 「봇의 화면」+ 루틴 + 멤버). 우리 P0 = 이 봇이 읽은 자료 + 승인 모드 + 루틴 자리.

import type { TeamBot } from '@/domains/os/types'

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
                <b>{bot.name}</b> · {ROLE_LABEL[bot.role]}<br />
                {bot.oneLiner && <span>{bot.oneLiner}</span>}
            </div>

            <h4>승인</h4>
            <div className="os-card">{APPROVAL_LABEL[bot.approvalMode]}<br /><span style={{ fontSize: 13 }}>보내기·게시·결제·삭제는 카드로 물어보고, 허용해야만 나가요.</span></div>

            <h4>이 봇이 읽은 자료</h4>
            <div className="os-card">
                {bot.knowledgeCount > 0 ? <><b>{bot.knowledgeCount}개</b> 읽었어요.</> : '아직 읽은 자료가 없어요.'}<br />
                <span style={{ fontSize: 13 }}>자료 넣기는 3일차에 여기 열려요 (PDF·링크·유튜브).</span>
            </div>

            <h4>루틴</h4>
            <div className="os-card">루틴은 이 봇이 정해진 때에 반복하는 일이에요. 만들려면 대화로 요청해 주세요. (4일차)</div>
        </div>
    )
}
