/**
 * Inngest API Route
 * Next.js App Router에서 Inngest 이벤트 서빙
 */

import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { parseAndEmbedDocument } from '@/inngest/functions'

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [parseAndEmbedDocument],
})
