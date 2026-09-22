// domains/os — 외부 노출 API
export * from './types'
export { JOBS, AUTONOMY, SHAPES, COLORS, suggestName, findJob, buildBotPrompt } from './presets'
export { listTeam, createTeamBot, updateTeamBot, removeTeamBot, getOwnedTeamBotMentor, TeamTableMissing } from './team'

// 4일차 — 루틴·체크인·미룬 일·주간 카드 (순수 규칙은 schedule/checkin/weekly, DB 는 routines/nextSteps)
export * from './schedule'
export * from './checkin'
export * from './weekly'
export { listRoutines, getRoutine, createRoutine, updateRoutine, deleteRoutine, listEnabledRoutines, pickDue, runRoutineOnce, RoutineTableMissing } from './routines'
export type { BotRoutine, NewRoutineInput, RunResult } from './routines'
export { listNextSteps, createNextStep, patchNextStep, guessNextStep, NextStepTableMissing } from './nextSteps'
export type { NextStep } from './nextSteps'
