import { prisma } from '@/lib/prisma'
import { siteConfig } from '@/config/site'
import { saveSettingsAction } from '@/app/admin/actions'
import {
  DataGrid,
  DataRow,
  Notice,
  PageHeader,
  Panel,
  SETTING_KEYS,
  adminCopy,
} from '@/components/admin/shell'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  // searchParams is async in Next 16.
  const resolved = await searchParams
  const saved = firstValue(resolved.saved) === '1'
  const errored = firstValue(resolved.error) === '1'

  const rows = await prisma.setting.findMany({
    where: { key: { in: [SETTING_KEYS.meetingLinkTemplate, SETTING_KEYS.ownerAlertEmail] } },
    select: { key: true, value: true },
  })

  const values = new Map(rows.map((row) => [row.key, row.value]))
  const meetingLinkTemplate = values.get(SETTING_KEYS.meetingLinkTemplate) ?? ''
  const ownerAlertEmail = values.get(SETTING_KEYS.ownerAlertEmail) ?? ''

  const gst = adminCopy.settings.gst
  const supplierGstin = siteConfig.tax.supplierGstin

  return (
    <>
      <PageHeader title={adminCopy.settings.title} description={adminCopy.settings.description} />

      {saved ? <Notice tone="success">{adminCopy.settings.form.saved}</Notice> : null}
      {errored ? <Notice tone="error">{adminCopy.settings.form.error}</Notice> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title={adminCopy.settings.form.legend}>
          <form action={saveSettingsAction} className="space-y-6">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="meeting-link" className="text-xs font-semibold text-muted-2 uppercase">
                {adminCopy.settings.form.meetingLinkLabel}
              </label>
              <input
                id="meeting-link"
                name="meetingLinkTemplate"
                type="text"
                maxLength={500}
                defaultValue={meetingLinkTemplate}
                placeholder={adminCopy.settings.form.meetingLinkPlaceholder}
                className="rounded-lg border border-line-strong bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted-2"
              />
              <p className="text-xs text-muted-2">{adminCopy.settings.form.meetingLinkHelp}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="owner-alert" className="text-xs font-semibold text-muted-2 uppercase">
                {adminCopy.settings.form.ownerAlertLabel}
              </label>
              <input
                id="owner-alert"
                name="ownerAlertEmail"
                type="email"
                maxLength={320}
                defaultValue={ownerAlertEmail}
                placeholder={adminCopy.settings.form.ownerAlertPlaceholder}
                className="rounded-lg border border-line-strong bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted-2"
              />
              <p className="text-xs text-muted-2">{adminCopy.settings.form.ownerAlertHelp}</p>
            </div>

            <button
              type="submit"
              className="rounded-full bg-red px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-2"
            >
              {adminCopy.settings.form.submit}
            </button>
          </form>
        </Panel>

        <Panel title={gst.title} description={gst.description}>
          <DataGrid>
            <DataRow label={gst.rate} value={`${siteConfig.tax.gstRatePercent}%`} />
            <DataRow label={gst.sac} value={siteConfig.tax.sacCode} />
            <DataRow label={gst.supplierState} value={siteConfig.tax.supplierStateName} />
            <DataRow label={gst.supplierStateCode} value={siteConfig.tax.supplierStateCode} />
            <DataRow
              label={gst.supplierGstin}
              value={
                supplierGstin.length > 0 ? (
                  <code className="text-xs">{supplierGstin}</code>
                ) : (
                  <span className="font-semibold text-red">{gst.gstinMissing}</span>
                )
              }
            />
            <DataRow
              label={gst.registered}
              value={siteConfig.tax.registered ? gst.registeredYes : gst.registeredNo}
            />
            <DataRow
              label={gst.pricesIncludeTax}
              value={siteConfig.tax.pricesIncludeTax ? gst.registeredYes : gst.registeredNo}
            />
            <DataRow label={gst.invoicePrefix} value={siteConfig.invoice.prefix} />
          </DataGrid>

          <p className="mt-5 text-xs text-muted-2">{gst.sacNote}</p>

          <div className="mt-5 rounded-card border border-red/40 bg-red/8 p-4">
            <p className="font-display text-sm font-bold text-red-deep">{gst.warningTitle}</p>
            <p className="mt-2 text-sm text-ink">{gst.warningBody}</p>
          </div>
        </Panel>
      </div>
    </>
  )
}
