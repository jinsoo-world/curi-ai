// domains/os — 외부 노출 API
export * from './types'
export { JOBS, AUTONOMY, SHAPES, COLORS, suggestName, findJob, buildBotPrompt } from './presets'
export { listTeam, createTeamBot, updateTeamBot, removeTeamBot, getOwnedTeamBotMentor, TeamTableMissing } from './team'
export type { VoiceProfile } from './voice'
export { analyzeVoice, buildVoiceGuide, splitSentences, stripParticle, isPolite } from './voice'
export type { TwinProfile } from './twin'
export { buildTwinPrompt, TWIN_HARD_LIMITS } from './twin'
