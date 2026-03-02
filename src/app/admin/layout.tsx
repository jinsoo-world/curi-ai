import { requireAdmin } from '@/lib/admin-guard'
import AdminSidebar from './AdminSidebar'

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    await requireAdmin()

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f' }}>
            <AdminSidebar />
            <main style={{
                flex: 1,
                marginLeft: 240,
                padding: '32px 40px',
                color: '#fff',
                minWidth: 0,
            }}>
                {children}
            </main>
        </div>
    )
}
