# GST: what changed moving from event ticketing to consultancy

**Read this before the first invoice goes out.** Everything else in this port
transferred cleanly from the reference build. The tax treatment did not, and an
invoice raised under the wrong head has to be reissued — with a credit note, a
corrected invoice, and a GSTR-1 amendment.

This document is written to be handed to the CA. It states what the code does,
why, and the exact questions that need a professional answer. It is not tax
advice.

---

## 1. The headline change

| | Reference build (event ticketing) | This build (consultancy) |
|---|---|---|
| What is supplied | Admission to an event | Professional consultancy |
| Place-of-supply rule | **s.12(6)** IGST Act — where the event is held | **s.12(2)** IGST Act — the general rule |
| SAC | 9996 (recreational, cultural, sporting) | **9983** (other professional, technical, business services) |
| Usual head, UP-registered supplier | IGST, because events travel | **Often CGST+SGST**, because the client is often in-state |
| Rate | 18% | 18% |

The rate is unchanged. The **head** and the **SAC** are not.

> **Correction to the brief.** Event admission is **s.12(6)**, not s.12(4).
> s.12(4) covers restaurant/catering, personal grooming, fitness, beauty
> treatment and health services. s.12(7) is *organisation* of an event, which is
> a different rule again — and, as §4 below explains, one that this consultancy
> may actually need. Worth getting the citation right before it reaches a return.

---

## 2. Why `interState` cannot be a static config flag

The brief proposed flipping `siteConfig.tax.interState` from `true` to `false`.
That is right about the direction and wrong about the shape, and the failure is
silent — it under-collects IGST rather than erroring.

s.12(2) reads, in substance:

- **(a)** supply to a **registered person** → place of supply is the **location
  of that person**
- **(b)** supply to a person **other than a registered person** →
  - **(i)** the **location of the recipient where the address on record exists**
  - **(ii)** the **location of the supplier** in other cases

Sub-clause **(b)(i)** is the trap. "Address on record" is not a property of the
customer — it is a property of *what you recorded*. A booking form that asks for
the client's state **creates** the address on record. From that moment a B2C
client in Delhi has a Delhi place of supply, and the supply is inter-state
whether or not anyone intended it.

So a hardcoded `interState: false` would raise CGST+SGST on exactly the
out-of-state B2C bookings that should carry IGST — and the site sells to anyone
with a card.

### What the code does instead

`resolvePlaceOfSupply()` in [`src/lib/tax.ts`](src/lib/tax.ts) evaluates, in order:

| # | Condition | Place of supply | Basis recorded |
|---|---|---|---|
| 1 | Valid GSTIN supplied | State encoded in the **first two digits of the GSTIN** | `s.12(2)(a) — registered recipient` |
| 2 | No GSTIN, but a state was captured | That state | `s.12(2)(b)(i) — address on record` |
| 3 | Nothing captured | Supplier's state (UP, `09`) | `s.12(2)(b)(ii) — no address on record` |

`isInterState` is then simply *place of supply ≠ supplier state*.

For a registered client the **GSTIN wins over the dropdown**. The GSTIN is the
statutory identifier; a mis-selected dropdown must not be able to change the
head on a B2B invoice.

`siteConfig.tax.interStateFallback` survives only as the case-3 default.

Every booking stores the branch that fired, as a human-readable `basis` string
shown on the admin detail page — so any individual invoice can be audited back
to the rule that produced it, without re-deriving it from the code.

### Worked cases, supplier registered in UP (09)

| Client | GSTIN | State captured | Place of supply | Head |
|---|---|---|---|---|
| Business in Noida | `09AAAAA0000A1Z5` | — | 09 UP | CGST + SGST |
| Business in Mumbai | `27AAAAA0000A1Z5` | — | 27 MH | IGST |
| Individual, picked "Delhi" | none | 07 | 07 DL | **IGST** |
| Individual, picked "Uttar Pradesh" | none | 09 | 09 UP | CGST + SGST |
| Individual, state not collected | none | — | 09 UP | CGST + SGST |

Row 3 is the one a static flag gets wrong.

---

## 3. The arithmetic, and why the total never moves

Advertised prices are **tax-inclusive** (`siteConfig.tax.pricesIncludeTax`).
The catalogue price is the gross the client pays; tax is back-computed:

```
taxable  = round(total * 100 / (100 + rate))
taxTotal = total - taxable            // by subtraction, never rounded twice
```

Intra-state: `cgst = floor(taxTotal / 2)`, `sgst = taxTotal - cgst`.
Inter-state: `igst = taxTotal`.

This guarantees, for every input including odd paise:

```
taxable + cgst + sgst + igst === total     exactly
```

A consequence worth stating plainly, because it closes an attack: **place of
supply changes only the split, never the total.** A client who tampers with the
state field or the GSTIN changes which head appears on the invoice — it cannot
change what they are charged. All amounts are integer paise; no float touches
the payment path.

---

## 4. Three questions only the CA can answer

### 4.1 Is the GSTIN correct, and is registration even required?

`siteConfig.tax.supplierGstin` is **empty** and must be filled before the first
invoice. If turnover is below the services registration threshold and Redkido is
not registered, set `siteConfig.tax.registered = false` — the code then charges
zero GST rather than collecting tax it has no authority to collect. Collecting
GST without registration is a materially worse error than the head being wrong.

### 4.2 Do the *other ten* services share this rule? Probably not.

This is the part the brief did not cover, and it matters more than the flag.

The code path here bills **one product**: a paid consultation booked on the site.
s.12(2) is right for that. But the site advertises eleven services, and at least
two of them plausibly fall under *different* place-of-supply rules when invoiced:

| Service on the site | Likely rule | Why it differs |
|---|---|---|
| Consultancy, content, social, ads, automation | **s.12(2)** | General rule — what this code implements |
| **Workforce Training** | **s.12(5)** | Training and performance appraisal. For an **unregistered** recipient the place of supply is **where the training is actually performed** — not the client's address |
| **Event Management & Curation** | **s.12(7)** | *Organisation* of an event. For an **unregistered** recipient the place of supply is **where the event is held** |

For registered (B2B) recipients all three converge on the recipient's location,
so the exposure is on the B2C side.

Those retainer invoices are raised offline, not by this application — the site's
pricing tiers are "Custom, scoped monthly" and link to a call, not to checkout.
So this is **not a code change**; it is something the CA should know before
setting up the offline invoicing template. If paid training or paid event
booking is ever added to the site, `resolvePlaceOfSupply()` will need a
per-service rule rather than one global one, and its signature was written to
make that a widening rather than a rewrite.

### 4.3 SAC per service, and tax point on advances

- The consultation product uses **9983** (`998311` management consulting /
  `998312` business consulting are the usual six-digit refinements). Confirm the
  right one for the invoice.
- Event organisation typically sits under **9985** (`998596`), and training under
  **9992** — again, only relevant to offline invoices.
- **Advances:** for *services*, GST is payable on receipt of an advance. A
  prepaid consultation is money received before the service is rendered. Since
  the invoice is raised at payment time this is normally clean, but confirm the
  treatment where a booking is rescheduled across a month boundary — the payment
  and the delivery then fall in different return periods.

---

## 5. If the head turns out to be wrong

Change `resolvePlaceOfSupply()` in [`src/lib/tax.ts`](src/lib/tax.ts) — it is the
only place the rule is expressed, and both the quote shown on the booking page
and the amount charged read through it, so they cannot diverge.

Invoices already issued must be corrected through a credit note and a fresh
invoice, not by editing rows. Invoice serials are gapless by design (the serial
is claimed under a row lock *before* `nextval`), and silently rewriting one
breaks the consecutive series that the gapless design exists to guarantee.
