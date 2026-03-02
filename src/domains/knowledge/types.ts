// domains/knowledge — 타입 정의

export interface KnowledgeSource {
    id: string
    mentor_id: string
    source_type: 'pdf' | 'url' | 'youtube' | 'text'
    title: string
    original_url?: string
    content?: string
    processing_status: 'pending' | 'processing' | 'completed' | 'failed'
    chunk_count: number
    created_at: string
}

export interface KnowledgeChunk {
    id: string
    source_id: string
    mentor_id: string
    content: string
    chunk_index: number
    created_at: string
}

export interface MatchedKnowledge {
    content: string
    similarity: number
}

export type { } // isolatedModules
