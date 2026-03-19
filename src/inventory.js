/**
 * Tracks ingredient usage across the day.
 * EOD: ghost kitchen pays suppliers based on usage totals.
 */

// Usage log: { ingredient, supplier, qty, priceEach, orderId, timestamp }
const usageLog = []

// Record ingredient usage when an order is fulfilled
export function recordUsage(orderId, bom) {
  for (const item of bom) {
    usageLog.push({ ...item, qty: 1, orderId, timestamp: new Date().toISOString() })
  }
}

// Aggregate usage by supplier + ingredient for EOD ordering
export function getDailyUsage() {
  const totals = {}
  for (const entry of usageLog) {
    const key = `${entry.supplier}:${entry.ingredient}`
    if (!totals[key]) {
      totals[key] = { supplier: entry.supplier, ingredient: entry.ingredient, qty: 0, totalCost: 0, priceEach: entry.price }
    }
    totals[key].qty++
    totals[key].totalCost = +(totals[key].qty * entry.price).toFixed(2)
  }
  return Object.values(totals)
}

// Group daily usage by supplier (for batched supplier payments)
export function getDailyUsageBySupplier() {
  const usage = getDailyUsage()
  const bySupplier = {}
  for (const item of usage) {
    if (!bySupplier[item.supplier]) bySupplier[item.supplier] = { items: [], totalCost: 0 }
    bySupplier[item.supplier].items.push(item)
    bySupplier[item.supplier].totalCost = +(bySupplier[item.supplier].totalCost + item.totalCost).toFixed(2)
  }
  return bySupplier
}

export function clearUsageLog() {
  usageLog.length = 0
}

export function getUsageLog() {
  return [...usageLog]
}
