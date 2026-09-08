import type { Metadata } from 'next'
import { siteConfig } from '@/config/site'
import { safeNextPath } from '@/lib/auth'
import { adminCopy } from '@/components/admin/shell'

/**
 * A plain HTML form posting to /api/admin/login. No client component, no
 * fetch: the route handler sets the session cookie on a 303 and the browser
 * follows it, which also means sign-in works with JavaScript disabled.
 *
 * Errors come back as ?error=<code> on a redirect rather than as component
 * state, for the same reason. The login route rate-limits by IP in memory —
 * see the comment there: that counter resets with every lambda, so it slows a
 * casual attacker and nothing more. A real limiter belongs in the database
 * (an attempts table keyed by IP) or in an edge KV shared across instances.
 */

export const metadata: Metadata = {
  title: `${adminCopy.login.title} · ${siteConfig.name}`,
  robots: { index: false, follow: false },
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function AdminLoginPage({ searchParams }: { searchParams: SearchParams }) {
  // searchParams is async in Next 16.
  const resolved = await searchParams
  const nextPath = safeNextPath(firstValue(resolved.next))
  const errorCode = firstValue(resolved.error)
  const errorMessage = errorCode
    ? (adminCopy.login.errors[errorCode] ?? adminCopy.login.fallbackError)
    : undefined

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-2 px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red" aria-hidden="true" />
          <span className="font-display text-lg font-extrabold tracking-tight text-ink">
            {adminCopy.brand.name}
          </span>
          <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
            {adminCopy.brand.area}
          </span>
        </div>

        <div className="rounded-card border border-line bg-card p-7">
          <h1 className="font-display text-xl font-bold text-ink">{adminCopy.login.title}</h1>
          <p className="mt-2 text-sm text-muted">{adminCopy.login.description}</p>

          {errorMessage ? (
            <p role="alert" className="mt-5 rounded-card border border-red/40 bg-red/8 px-4 py-3 text-sm text-red-deep">
              {errorMessage}
            </p>
          ) : null}

          <form action="/api/admin/login" method="post" className="mt-6 space-y-5">
            <input type="hidden" name="next" value={nextPath} />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="admin-email" className="text-xs font-semibold text-muted-2 uppercase">
                {adminCopy.login.emailLabel}
              </label>
              <input
                id="admin-email"
                name="email"
                type="email"
                required
                autoComplete="username"
                autoFocus
                className="rounded-lg border border-line-strong bg-bg px-3 py-2 text-sm text-ink"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="admin-password" className="text-xs font-semibold text-muted-2 uppercase">
                {adminCopy.login.passwordLabel}
              </label>
              <input
                id="admin-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="rounded-lg border border-line-strong bg-bg px-3 py-2 text-sm text-ink"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-full bg-red px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-2"
            >
              {adminCopy.login.submit}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
