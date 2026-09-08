/**
 * "Is this for you?" qualification section. Extracted verbatim from the source HTML.
 */

export type FitColumn = {
  readonly title: string
  readonly items: readonly string[]
}

export type Fit = {
  readonly kicker: string
  readonly heading: string
  readonly yes: FitColumn
  readonly no: FitColumn
}

export const fit = {
  kicker: 'Is this for you?',
  heading: "This partnership works best when there's a real fit.",
  yes: {
    title: 'This is for you if:',
    items: [
      'You want marketing to be run, not patched together',
      "You're spending on ads without a clear system behind them",
      'You have an event or launch coming up and no bandwidth to run it',
      "You're ready to hand off execution, not just get advice",
    ],
  },
  no: {
    title: 'This is not for you if:',
    items: [
      "You're looking for a one-off logo or single social post",
      'You want guaranteed overnight virality with no input from your side',
      "You'd rather manage five vendors yourself than trust one team",
      "You're not ready to commit to a working calendar together",
    ],
  },
} as const satisfies Fit
