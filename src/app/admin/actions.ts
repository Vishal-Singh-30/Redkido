'use server'

/**
 * Admin server actions.
 *
 * Every action re-checks the session. Middleware guards navigations, but a
 * server action is a POST to the same route tree and must not rely on the page
 * that rendered its form having been guarded — the form's action id is a public
 * endpoint once it has been served.
 *
 * Every action validates with zod before it touches Prisma, and reports back
 * through a redirect query flag rather than returned state, so the pages stay
 * server components with no client-side form state.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth'
import { LEAD_STATUSES, SETTING_KEYS } from '@/components/admin/shell'

const NOTES_MAX_LENGTH = 5000
const MEETING_LINK_MAX_LENGTH = 500

const updateLeadSchema = z.object({
  leadId: z.string().trim().min(1).max(64),
  status: z.enum(LEAD_STATUSES),
  notes: z.string().max(NOTES_MAX_LENGTH),
})

const settingsSchema = z.object({
  meetingLinkTemplate: z.string().trim().max(MEETING_LINK_MAX_LENGTH),
  ownerAlertEmail: z.union([z.literal(''), z.email().max(320)]),
})

function readString(formData: FormData, field: string): string {
  const value = formData.get(field)
  return typeof value === 'string' ? value : ''
}

/** Editable fields on a lead: workflow status and the internal notes. */
export async function updateLeadAction(formData: FormData): Promise<void> {
  await requireSession()

  const parsed = updateLeadSchema.safeParse({
    leadId: readString(formData, 'leadId'),
    status: readString(formData, 'status'),
    notes: readString(formData, 'notes'),
  })

  if (!parsed.success) {
    const fallbackId = readString(formData, 'leadId')
    redirect(fallbackId ? `/admin/leads/${encodeURIComponent(fallbackId)}?error=1` : '/admin/leads?error=1')
  }

  const { leadId, status, notes } = parsed.data
  const trimmedNotes = notes.trim()

  let updated = false
  try {
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        status,
        notes: trimmedNotes.length > 0 ? trimmedNotes : null,
      },
    })
    updated = true
  } catch {
    updated = false
  }

  if (!updated) {
    redirect(`/admin/leads/${encodeURIComponent(leadId)}?error=1`)
  }

  revalidatePath('/admin')
  revalidatePath('/admin/leads')
  revalidatePath(`/admin/leads/${leadId}`)
  redirect(`/admin/leads/${encodeURIComponent(leadId)}?saved=1`)
}

/**
 * Writes the operational key/value settings the booking flow reads at runtime.
 * Both rows are written in one transaction so a half-applied save is impossible.
 */
export async function saveSettingsAction(formData: FormData): Promise<void> {
  await requireSession()

  const parsed = settingsSchema.safeParse({
    meetingLinkTemplate: readString(formData, 'meetingLinkTemplate'),
    ownerAlertEmail: readString(formData, 'ownerAlertEmail').trim(),
  })

  if (!parsed.success) {
    redirect('/admin/settings?error=1')
  }

  const { meetingLinkTemplate, ownerAlertEmail } = parsed.data

  let saved = false
  try {
    await prisma.$transaction([
      prisma.setting.upsert({
        where: { key: SETTING_KEYS.meetingLinkTemplate },
        create: { key: SETTING_KEYS.meetingLinkTemplate, value: meetingLinkTemplate },
        update: { value: meetingLinkTemplate },
      }),
      prisma.setting.upsert({
        where: { key: SETTING_KEYS.ownerAlertEmail },
        create: { key: SETTING_KEYS.ownerAlertEmail, value: ownerAlertEmail },
        update: { value: ownerAlertEmail },
      }),
    ])
    saved = true
  } catch {
    saved = false
  }

  if (!saved) {
    redirect('/admin/settings?error=1')
  }

  revalidatePath('/admin/settings')
  redirect('/admin/settings?saved=1')
}
