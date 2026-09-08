/**
 * "How we work" — the five-step process. Extracted verbatim from the source HTML.
 * `num` is copy, not an index: it is rendered as written ("01", "02", ...).
 */

export type ProcessStep = {
  readonly num: string
  readonly title: string
  readonly body: string
}

export type Process = {
  readonly kicker: string
  readonly heading: string
  readonly sub: string
  readonly steps: readonly ProcessStep[]
}

export const process = {
  kicker: 'How we work',
  heading: 'From "we need help with everything" to a running system.',
  sub: 'Same process whether you bring us one function or all eleven.',
  steps: [
    {
      num: '01',
      title: 'Audit',
      body: "We map what's already running, what's broken, and what's missing across your funnel.",
    },
    {
      num: '02',
      title: 'Design the system',
      body: 'A plan for which functions we run, in what order, and how they connect to each other.',
    },
    {
      num: '03',
      title: 'Build & launch',
      body: 'Content, pages, campaigns, and workflows go live on an agreed calendar — not "soon."',
    },
    {
      num: '04',
      title: 'Run & optimize',
      body: 'Weekly execution and iteration, with one team accountable across every channel.',
    },
    {
      num: '05',
      title: 'Report & scale',
      body: "Monthly reporting tied to pipeline and revenue, then we scale what's working.",
    },
  ],
} as const satisfies Process
