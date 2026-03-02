// domains/knowledge — 외부 노출 API

export type { KnowledgeSource, KnowledgeChunk, MatchedKnowledge } from './types'
export { generateEmbedding, splitIntoChunks } from './embedding'
export { matchKnowledge, getKnowledgeSources } from './queries'
export { addKnowledgeSource } from './actions'
