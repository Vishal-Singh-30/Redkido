import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { siteConfig } from '@/config/site'
import { requireSession } from '@/lib/auth'
import { AdminShell, adminCopy } from '@/components/admin/shell'

/**
 * Stamped on the request by src/middleware.ts. Duplicated as a literal rather
 * than imported, because importing the middleware module would pull the Edge
 * runtime entrypoint into the server bundle. Keep the two in sync.
 */
const ADMIN_PATHNAME_HEADER = 'x-admin-pathname'

const LOGIN_PATH = '/admin/login'

export const metadata: Metadata = {
  title: `${adminCopy.brand.area} · ${siteConfig.name}`,
  robots: { index: false, follow: false },
}

/** Nothing in the admin may ever be served from a static cache. */
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const headerList = await headers()
  const pathname = headerList.get(ADMIN_PATHNAME_HEADER) ?? '/admin'

  // The login page shares this layout but must not be wrapped in the signed-in
  // chrome, and must not call requireSession — that would be a redirect loop.
  if (pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`)) {
    return <>{children}</>
  }

  const session = await requireSession(pathname)

  return (
    <AdminShell pathname={pathname} email={session.email}>
      {children}
    </AdminShell>
  )
}
