import 'dotenv/config'
import express from 'express'
import { MENU } from './menu.js'
import { createOrder, updateOrder, getOrder, listOrders } from './orders.js'
import { recordUsage, getDailyUsage, getDailyUsageBySupplier } from './inventory.js'
import { runRestock, maybeScheduleRestock } from './restock.js'
import { startSuppliers } from './suppliers.js'

const PORT = process.env.PORT || 3000
const KITCHEN_NAME = process.env.KITCHEN_NAME || 'Prospect Butcher Co'

// ── Express app ──────────────────────────────────────────────────────────────
const app = express()
app.use(express.json())

// Serve static files (index.html)
app.use(express.static('.'))

// ── In-memory stats ─────────────────────────────────────────────────────────
const stats = { orders: 0, rev: 0, cogs: 0 }

// Simulated wallet balances (merchant + suppliers only)
const wallets = {
  kitchen: { name: 'PBC Kitchen',    role: 'Operator',                    addr: '0x878d…ebf3', balance: 500 },
  meat:    { name: "Fleisher's",      role: 'Craft Butchery · Park Slope', addr: '0xa31f…c902', balance: 0 },
  bread:   { name: 'Runner & Stone',  role: 'Artisan Bakery · Gowanus',   addr: '0x5e2b…d817', balance: 0 },
}

// ── SSE: real-time order events ──────────────────────────────────────────────
const sseClients = []

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of sseClients) {
    res.write(payload)
  }
}

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.write(':\n\n')
  sseClients.push(res)
  req.on('close', () => {
    const idx = sseClients.indexOf(res)
    if (idx >= 0) sseClients.splice(idx, 1)
  })
})

// ── GET /menu ────────────────────────────────────────────────────────────────
app.get('/menu', (req, res) => {
  res.json({
    kitchen: KITCHEN_NAME,
    date: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    sandwiches: MENU.map(({ slug, name, price, description }) => ({
      slug, name, price: `$${price}.00`, description,
    })),
  })
})

// ── POST /api/order/:slug — place an order from the dashboard ────────────────
app.post('/api/order/:slug', (req, res) => {
  const sandwich = MENU.find(s => s.slug === req.params.slug)
  if (!sandwich) return res.status(404).json({ error: 'Sandwich not found' })

  const { name, pickup } = req.body

  const order = createOrder({
    sandwich,
    customerName: name || 'Walk-in',
    customerAddress: pickup || 'Prospect Heights',
    status: 'received',
  })

  recordUsage(order.id, sandwich.bom)

  // Update stats
  stats.orders++
  stats.rev += sandwich.price
  const meatCost = sandwich.bom.find(b => b.supplier === 'butcher')?.price || 0
  const breadCost = sandwich.bom.find(b => b.supplier === 'bakery')?.price || 0
  stats.cogs += meatCost + breadCost

  console.log(`[${order.id}] order: ${sandwich.name} for ${name}`)
  broadcast('order', order)

  res.json(order)
})

// ── GET /api/stats — current session stats ──────────────────────────────────
app.get('/api/stats', (req, res) => {
  const margin = +(stats.rev - stats.cogs).toFixed(2)
  res.json({ ...stats, margin })
})

// ── GET /api/wallets — current simulated wallet balances ────────────────────
app.get('/api/wallets', (req, res) => {
  res.json(wallets)
})

// ── GET /orders/:id ──────────────────────────────────────────────────────────
app.get('/orders/:id', (req, res) => {
  const order = getOrder(req.params.id)
  if (!order) return res.status(404).json({ error: 'Order not found' })
  res.json(order)
})

// ── GET /orders ──────────────────────────────────────────────────────────────
app.get('/orders', (req, res) => res.json(listOrders()))

// ── Kitchen admin routes ─────────────────────────────────────────────────────
app.get('/kitchen/usage', (req, res) => {
  const usage = getDailyUsage()
  const bySupplier = getDailyUsageBySupplier()
  const totalCost = +Object.values(bySupplier).reduce((s, v) => s + v.totalCost, 0).toFixed(2)
  res.json({ date: new Date().toISOString().split('T')[0], bySupplier, totalCost, breakdown: usage })
})

app.post('/kitchen/restock', async (req, res) => {
  const { dryRun } = req.query
  try {
    const result = await runRestock({ dryRun: dryRun === 'true' })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Boot ─────────────────────────────────────────────────────────────────────
console.log('Starting supplier servers...')
startSuppliers()
maybeScheduleRestock()

app.listen(PORT, () => {
  console.log(`\n${KITCHEN_NAME} running on :${PORT}`)
  console.log(`\n  GET  /menu                   browse the menu`)
  console.log(`  POST /api/order/:slug        place an order`)
  console.log(`  GET  /api/stats              current session stats`)
  console.log(`  GET  /api/wallets            simulated wallet balances`)
  console.log(`  GET  /api/events             SSE event stream`)
  console.log(`  GET  /orders/:id             poll order status`)
  console.log(`  GET  /kitchen/usage          today's ingredient usage`)
  console.log(`  POST /kitchen/restock        trigger EOD supplier payments`)
  console.log(`\n  Restock flow: kitchen -[MPP]-> Fleisher's + Runner & Stone (EOD batch)\n`)
})
