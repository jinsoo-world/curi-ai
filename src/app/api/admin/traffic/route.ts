/**
 * 어디서 몇 명이 들어왔나 — 관리자용 (기간을 바꿀 때 부른다)
 * 세는 법은 domains/traffic/query.ts 한 곳에 있다. 화면(서버)도 같은 함수를 쓴다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { 유입세기 } from '@/domains/traffic/query'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    await requireAdmin()
    const 일수 = Number(req.nextUrl.searchParams.get('days') ?? 7)
    return NextResponse.json(await 유입세기(일수))
}
