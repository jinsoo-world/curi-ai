'use client'
// 오른쪽 세부칸 (그록봇 = 「봇의 화면」+ 루틴 + 멤버). 우리 P0 = 이 봇이 읽은 자료 + 승인 모드 + 루틴 자리.

import { useState } from 'react'
import type { TeamBot } from '@/domains/os/types'
import KnowledgeList from './KnowledgeList'
import RoutinePanel from './RoutinePanel'
import ResponseSettingsSheet from './ResponseSettingsSheet'

const ROLE_LABEL: Record<TeamBot['role'], string> = { twin: '디지털 나', chief: '비서실장', helper: '도우미' }
const APPROVAL_LABEL: Record<TeamBot['approvalMode'], string> = {
    always_ask: '보내기 전 항상 물어봐요',
    draft_only: '초안만 만들어요 (밖으로 안 나감)',
    auto_safe: '되돌릴 수 있는 일은 알아서 (지금은 항상 물어봐요와 같음)',
}

/** demo = 시연(/os?demo=1). 시연 봇은 내 봇이 아니라 자료 창구가 403 을 내니 목록을 부르지 않고 한 줄만 보인다.
 *  OsChat 이 demo 를 안 넘겨도 시연 봇은 id 가 demo- 로 시작하니 스스로 알아본다 */
export default function DetailPane({ bot, publicName, demo = false }: { bot: TeamBot | null; publicName: string | null; demo?: boolean }) {
    const 시연 = demo || !!bot?.id.startsWith('demo-')
    const [답변설정열림, set답변설정열림] = useState(false)
    const [답변설정펼침, set답변설정펼침] = useState(false)
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

            {/* 답변 설정(델파이급) — 목적·지침·말투·길이·창의성·출처·안내문·최신성. 접어 두고 필요할 때만 편다 */}
            {시연 ? null : (
                <>
                    <button type="button" className="os-card" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                        aria-expanded={답변설정펼침} onClick={() => set답변설정펼침(v => !v)}>
                        <b>답변 설정</b>{' '}<span style={{ fontSize: 13, color: 'var(--os-글-흐림)' }}>{답변설정펼침 ? '접기 ▲' : '목적·말투·길이·창의성 등 ▼'}</span>
                    </button>
                    {답변설정펼침 && (
                        <div className="os-card" style={{ marginTop: -8 }}>
                            자료에 없는 질문에 어디까지 답할지, 답 길이·말투를 이 봇만 따로 정할 수 있어요.
                            <button className="os-btn primary" style={{ width: '100%', marginTop: 10, minHeight: 44 }}
                                onClick={() => set답변설정열림(true)}>답변 설정 열기</button>
                        </div>
                    )}
                    {답변설정열림 && (
                        <ResponseSettingsSheet mentorId={bot.mentorId} botName={bot.name} onClose={() => set답변설정열림(false)} />
                    )}
                </>
            )}

            {/* 자료는 진짜 목록이다 (3일차). 넣고 빼는 것도 여기서 한다. 시연 봇은 목록을 부르지 않는다 */}
            {시연
                ? <><h4>자료</h4><div className="os-card">시연 봇에는 자료를 넣을 수 없어요. 내 팀 봇에서 넣어 주세요.</div></>
                : <KnowledgeList mentorId={bot.mentorId} />}

            {/* 루틴 = 목록, 만들기, 시험 실행 (5일차) */}
            <RoutinePanel mentorId={bot.mentorId} botName={bot.name} />

            {/* 이번 주 = 미룬 일, 승인, 체크인, 자료 (세부칸 맨 아래) */}
        </div>
    )
}
