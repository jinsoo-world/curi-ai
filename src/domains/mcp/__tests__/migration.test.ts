// 마이그레이션 = 서버 전용 표 (회원 직접 읽기·쓰기 0)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const sql = readFileSync(path.resolve(__dirname, '../../../../supabase/migrations/20261018_mcp_servers.sql'), 'utf8')

describe('20261018_mcp_servers.sql', () => {
    it('RLS 켬, 정책을 만들지 않고, anon·authenticated 권한을 회수한다', () => {
        expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
        expect(sql).not.toMatch(/CREATE POLICY/i)
        expect(sql).toMatch(/REVOKE ALL ON public\.mcp_servers FROM anon, authenticated/)
        expect(sql).toMatch(/GRANT ALL ON public\.mcp_servers TO service_role/)
    })
    it('쓰기 허용 도구 칸이 있다', () => {
        expect(sql).toMatch(/allowed_tools\s+TEXT\[\] NOT NULL DEFAULT '\{\}'/)
    })
})

const taintSql = readFileSync(path.resolve(__dirname, '../../../../supabase/migrations/20261019_mcp_session_taint.sql'), 'utf8')
describe('20261019_mcp_session_taint.sql', () => {
    it('서버 전용 표: RLS 켬, 정책 없음, 회원 권한 회수, 세션 지우면 같이 지움', () => {
        expect(taintSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.mcp_session_taint/)
        expect(taintSql).toMatch(/REFERENCES public\.chat_sessions\(id\) ON DELETE CASCADE/)
        expect(taintSql).toMatch(/ENABLE ROW LEVEL SECURITY/)
        expect(taintSql).not.toMatch(/CREATE POLICY/i)
        expect(taintSql).toMatch(/REVOKE ALL ON public\.mcp_session_taint FROM anon, authenticated/)
    })
})
