'use client'

/**
 * Funnel 1 — the free enquiry form.
 *
 * Client component because it owns submit state, field errors and a success
 * view. Not one word of copy lives here: every label, placeholder, hint, button
 * state and error message is read from src/content/forms.ts, which is also
 * where the server-side schema reads its messages, so the text under an input
 * is the same string whether the browser or the API rejected the value.
 *
 * The honeypot is the last field in the form and is invisible to a human: it is
 * off-screen, aria-hidden, not tabbable and not autofilled. A bot that fills
 * every input it finds gets a perfectly ordinary success response and no Lead
 * row — see src/app/api/enquiry/route.ts.
 */

import { useCallback, useId, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { enquiryForm, type FormField, type SuccessCopy } from '@/content/forms'

/**
 * The authored copy is `as const`, so a field that omits `helper` has no such
 * property at all. Widening to FormField once here makes the optional keys
 * reachable and keeps every read below uniform.
 */
const fields: Record<'name' | 'email' | 'phone' | 'company' | 'message', FormField> =
  enquiryForm.fields
const success: SuccessCopy = enquiryForm.success

/** Machine codes from src/app/api/enquiry/route.ts. Protocol, not copy. */
const API_CODE = {
  validation: 'VALIDATION',
  rateLimited: 'RATE_LIMITED',
} as const

const ENDPOINT = '/api/enquiry'

/** Mirrors the bounds in src/lib/validation.ts so both reject the same input. */
const NAME_MIN = 2
const MESSAGE_MIN = 10

type FieldErrors = Record<string, string>

type Status = 'idle' | 'submitting' | 'success'

type ApiResponse = {
  ok?: boolean
  code?: string
  fieldErrors?: FieldErrors
}

const labelClass = 'flex items-baseline justify-between gap-3 text-[13.5px] font-semibold'
const optionalClass = 'text-[12px] font-normal not-italic text-muted-2'
const controlClass =
  'w-full rounded-xl border border-line bg-bg px-4 py-3 text-[15px] text-ink outline-none transition placeholder:text-muted-2 focus:border-red focus:ring-2 focus:ring-red/20 aria-[invalid=true]:border-red'
const hintClass = 'text-[12.5px] text-muted'
const errorClass = 'text-[12.5px] font-medium text-red'

function Field({
  id,
  label,
  optionalTag,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  optionalTag?: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className={labelClass} htmlFor={id}>
        <span>{label}</span>
        {optionalTag ? <em className={optionalClass}>{optionalTag}</em> : null}
      </label>
      {children}
      {error ? (
        <p className={errorClass} id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className={hintClass} id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function describedBy(id: string, error: string | undefined, hint: string | undefined) {
  if (error) return `${id}-error`
  if (hint) return `${id}-hint`
  return undefined
}

/** The same minimums the server enforces, so the common mistakes never leave the page. */
function validateLocally(values: {
  name: string
  email: string
  message: string
}): FieldErrors {
  const errors: FieldErrors = {}
  const { name, email, message } = enquiryForm.errors

  if (values.name.length === 0) errors.name = name.required
  else if (values.name.length < NAME_MIN) errors.name = name.tooShort

  if (values.email.length === 0) errors.email = email.required
  else if (!values.email.includes('@')) errors.email = email.invalid

  if (values.message.length === 0) errors.message = message.required
  else if (values.message.length < MESSAGE_MIN) errors.message = message.tooShort

  return errors
}

export function EnquiryForm({ withIntro = true }: { withIntro?: boolean }) {
  const uid = useId()
  const [status, setStatus] = useState<Status>('idle')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  /**
   * Consent is the one field with no authored error message, so instead of
   * inventing copy for it the submit stays disabled until it is given. The
   * checkbox sits directly above the button, so the reason is never a mystery.
   */
  const [consented, setConsented] = useState(false)

  const fieldId = useCallback((name: string) => `${uid}-${name}`, [uid])

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      // Captured before the first await: currentTarget is cleared afterwards.
      const form = event.currentTarget
      const data = new FormData(form)
      const read = (key: string): string => {
        const value = data.get(key)
        return typeof value === 'string' ? value.trim() : ''
      }

      const values = {
        name: read('name'),
        email: read('email'),
        message: read('message'),
      }

      const localErrors = validateLocally(values)
      if (Object.keys(localErrors).length > 0) {
        setFieldErrors(localErrors)
        setFormError(enquiryForm.errors.form.validation)
        return
      }

      const phone = read('phone')
      const company = read('company')

      setStatus('submitting')
      setFieldErrors({})
      setFormError(null)

      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...values,
            ...(phone.length > 0 ? { phone } : {}),
            ...(company.length > 0 ? { company } : {}),
            // Empty for a human. Declared so the strict schema accepts the key.
            website: read('website'),
            consent: data.get('consent') !== null,
          }),
        })

        const payload: ApiResponse = await response.json().catch(() => ({}))

        if (response.ok && payload.ok === true) {
          form.reset()
          setConsented(false)
          setStatus('success')
          return
        }

        setStatus('idle')
        if (payload.code === API_CODE.validation) {
          setFieldErrors(payload.fieldErrors ?? {})
          setFormError(enquiryForm.errors.form.validation)
          return
        }
        if (response.status === 429 || payload.code === API_CODE.rateLimited) {
          setFormError(enquiryForm.errors.form.rateLimited)
          return
        }
        setFormError(enquiryForm.errors.form.generic)
      } catch {
        // fetch() only rejects on a transport failure, never on a 4xx/5xx.
        setStatus('idle')
        setFormError(enquiryForm.errors.form.network)
      }
    },
    [],
  )

  if (status === 'success') {
    return (
      <div className="rounded-card border border-line bg-card p-8 shadow-[0_2px_10px_rgba(20,10,10,0.05)]">
        <h3 className="font-display text-[22px]">{success.title}</h3>
        <p className="mt-3 max-w-[52ch] text-[15px] text-muted">{success.body}</p>
        {success.action ? (
          <button
            className="btn btn-ghost mt-6"
            onClick={() => {
              setStatus('idle')
              setFieldErrors({})
              setFormError(null)
              setConsented(false)
            }}
            type="button"
          >
            {success.action}
          </button>
        ) : null}
      </div>
    )
  }

  const submitting = status === 'submitting'

  return (
    <div className="flex flex-col gap-7">
      {withIntro ? (
        <div>
          <div className="kicker" style={{ justifyContent: 'flex-start' }}>
            {enquiryForm.kicker}
          </div>
          <h2 className="font-display text-[clamp(26px,3.4vw,38px)]">{enquiryForm.heading}</h2>
          <p className="mt-4 max-w-[52ch] text-[16px] text-muted">{enquiryForm.sub}</p>
        </div>
      ) : null}

      <form
        className="rounded-card border border-line bg-card p-7 shadow-[0_2px_10px_rgba(20,10,10,0.05)]"
        noValidate
        onSubmit={handleSubmit}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            error={fieldErrors.name}
            hint={fields.name.helper}
            id={fieldId('name')}
            label={fields.name.label}
            optionalTag={fields.name.optionalTag}
          >
            <input
              aria-describedby={describedBy(fieldId('name'), fieldErrors.name, fields.name.helper)}
              aria-invalid={fieldErrors.name !== undefined}
              autoComplete="name"
              className={controlClass}
              disabled={submitting}
              id={fieldId('name')}
              name="name"
              placeholder={fields.name.placeholder}
              type="text"
            />
          </Field>

          <Field
            error={fieldErrors.email}
            hint={fields.email.helper}
            id={fieldId('email')}
            label={fields.email.label}
          >
            <input
              aria-describedby={describedBy(
                fieldId('email'),
                fieldErrors.email,
                fields.email.helper,
              )}
              aria-invalid={fieldErrors.email !== undefined}
              autoComplete="email"
              className={controlClass}
              disabled={submitting}
              id={fieldId('email')}
              name="email"
              placeholder={fields.email.placeholder}
              type="email"
            />
          </Field>

          <Field
            error={fieldErrors.phone}
            hint={fields.phone.helper}
            id={fieldId('phone')}
            label={fields.phone.label}
            optionalTag={fields.phone.optionalTag}
          >
            <input
              aria-describedby={describedBy(
                fieldId('phone'),
                fieldErrors.phone,
                fields.phone.helper,
              )}
              aria-invalid={fieldErrors.phone !== undefined}
              autoComplete="tel"
              className={controlClass}
              disabled={submitting}
              id={fieldId('phone')}
              name="phone"
              placeholder={fields.phone.placeholder}
              type="tel"
            />
          </Field>

          <Field
            error={fieldErrors.company}
            hint={fields.company.helper}
            id={fieldId('company')}
            label={fields.company.label}
            optionalTag={fields.company.optionalTag}
          >
            <input
              aria-describedby={describedBy(
                fieldId('company'),
                fieldErrors.company,
                fields.company.helper,
              )}
              aria-invalid={fieldErrors.company !== undefined}
              autoComplete="organization"
              className={controlClass}
              disabled={submitting}
              id={fieldId('company')}
              name="company"
              placeholder={fields.company.placeholder}
              type="text"
            />
          </Field>

          <div className="sm:col-span-2">
            <Field
              error={fieldErrors.message}
              hint={fields.message.helper}
              id={fieldId('message')}
              label={fields.message.label}
            >
              <textarea
                aria-describedby={describedBy(
                  fieldId('message'),
                  fieldErrors.message,
                  fields.message.helper,
                )}
                aria-invalid={fieldErrors.message !== undefined}
                className={`${controlClass} min-h-[132px] resize-y`}
                disabled={submitting}
                id={fieldId('message')}
                name="message"
                placeholder={fields.message.placeholder}
                rows={5}
              />
            </Field>
          </div>
        </div>

        <label
          className="mt-6 flex cursor-pointer items-start gap-3 text-[13px] text-muted"
          htmlFor={fieldId('consent')}
        >
          <input
            checked={consented}
            className="mt-1 h-4 w-4 flex-shrink-0 accent-red"
            disabled={submitting}
            id={fieldId('consent')}
            name="consent"
            onChange={(event) => setConsented(event.currentTarget.checked)}
            required
            type="checkbox"
          />
          <span>{enquiryForm.consent}</span>
        </label>

        {formError ? (
          <p className={`${errorClass} mt-5`} role="alert">
            {formError}
          </p>
        ) : null}

        <button
          className="btn mt-6 w-full disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
          disabled={submitting || !consented}
          type="submit"
        >
          {submitting ? enquiryForm.submit.pending : enquiryForm.submit.idle}
        </button>

        {/*
          Honeypot. Off-screen, hidden from assistive technology, skipped by the
          tab order and excluded from autofill — a human never sees or fills it.
        */}
        <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <input autoComplete="off" name="website" tabIndex={-1} type="text" />
        </div>
      </form>
    </div>
  )
}
