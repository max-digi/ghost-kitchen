/**
 * EOD restock: tallies the day's ingredient usage and pays each supplier
 * a single bulk MPP payment covering everything they supplied.
 *
 * Run manually: POST /kitchen/restock
 * Or schedule: set RESTOCK_CRON=true in .env and it runs at 11pm nightly
 */
import { Mppx, tempo } from 'mppx/client'
import { getDailyUsageBySupplier, clearUsageLog } from './inventory.js'
import { SUPPLIERS } from './menu.js'

const client = Mppx.create({
  methods: [tempo({ account: process.env.MPPX_ACCOUNT || 'default' })],
  polyfill: false,
})

export async function runRestock({ dryRun = false } = {}) {
  const bySupplier = getDailyUsageBySupplier()
  const supplierKeys = Object.keys(bySupplier)

  if (supplierKeys.length === 0) {
    return { status: 'nothing_to_restock', payments: [] }
  }

  const results = []

  for (const supplierKey of supplierKeys) {
    const { items, totalCost } = bySupplier[supplierKey]
    const supplier = SUPPLIERS[supplierKey]

    if (!supplier) {
      results.push({ supplier: supplierKey, status: 'error', error: 'Unknown supplier' })
      continue
    }

    const summary = items.map(i => `${i.qty}x ${i.ingredient}`).join(', ')
    const url = `${supplier.url}/restock`

    console.log(`[restock] ${supplierKey}: $${totalCost} for ${summary}${dryRun ? ' (dry run)' : ''}`)

    if (dryRun) {
      results.push({ supplier: supplierKey, totalCost, items, status: 'dry_run' })
      continue
    }

    try {
      const res = await client.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, totalCost }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? res.statusText)
      }

      const data = await res.json()
      results.push({ supplier: supplierKey, totalCost, items, status: 'paid', receipt: data })
      console.log(`[restock] ✓ ${supplierKey} paid $${totalCost}`)
    } catch (err) {
      results.push({ supplier: supplierKey, totalCost, items, status: 'failed', error: err.message })
      console.error(`[restock] ✗ ${supplierKey} failed: ${err.message}`)
    }
  }

  // Clear usage log after successful restock
  if (!dryRun) clearUsageLog()

  return {
    status: 'complete',
    date: new Date().toISOString().split('T')[0],
    payments: results,
    totalSpend: +results.reduce((sum, r) => sum + (r.totalCost ?? 0), 0).toFixed(2),
  }
}

// Optional nightly cron (set RESTOCK_CRON=true in .env)
export function maybeScheduleRestock() {
  if (process.env.RESTOCK_CRON !== 'true') return

  function msUntil11pm() {
    const now = new Date()
    const target = new Date()
    target.setHours(23, 0, 0, 0)
    if (target <= now) target.setDate(target.getDate() + 1)
    return target - now
  }

  function schedule() {
    setTimeout(async () => {
      console.log('[restock] running nightly restock...')
      const result = await runRestock()
      console.log('[restock] done:', JSON.stringify(result, null, 2))
      schedule() // schedule next day
    }, msUntil11pm())
  }

  schedule()
  console.log('  [restock] nightly cron scheduled for 11pm')
}
