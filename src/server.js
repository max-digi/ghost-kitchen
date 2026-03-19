import 'dotenv/config'
import express from 'express'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { Mppx, tempo } from 'mppx/express'
import { USDC_TOKEN, WALLET, MENU } from './menu.js'
import { createOrder, updateOrder, getOrder, listOrders } from './orders.js'
import { recordUsage, getDailyUsage, getDailyUsageBySupplier } from './inventory.js'
import { runRestock, maybeScheduleRestock } from './restock.js'
import { startSuppliers } from './suppliers.js'

const execFileAsync = promisify(execFile)
const PORT = process.env.PORT || 3000
const KITCHEN_NAME = process.env.KITCHEN_NAME || 'Prospect Butcher Co'

// ── Server-side MPP: receive payment from customers ──────────────────────────
const mppx = Mppx.create({
  methods: [tempo({ currency: USDC_TOKEN, recipient: WALLET })],
  realm: process.env.MPP_REALM || `localhost:${PORT}`,
  secretKey: process.env.MPP_SECRET_KEY || 'ghost-kitchen-secret-change-in-prod',
})

// ── Express app ──────────────────────────────────────────────────────────────
const app = express()
app.use(express.json())

// Serve static files (index.html)
app.use(express.static('.'))

// ── In-memory stats ─────────────────────────────────────────────────────────
const stats = { orders: 0, rev: 0, cogs: 0, del: 0, comms: 0 }

// Simulated wallet balances (mirrors frontend AGENTS)
const wallets = {
  kitchen:  { name: 'PBC Kitchen',    role: 'Operator',                   addr: '0x878d…ebf3', balance: 85 },
  meat:     { name: "Fleisher's",      role: 'Craft Butchery · Park Slope', addr: '0xa31f…c902', balance: 240 },
  bread:    { name: 'Runner & Stone',  role: 'Artisan Bakery · Gowanus',   addr: '0x5e2b…d817', balance: 65 },
  laso:     { name: 'Laso Finance',    role: 'Virtual Debit Cards',         addr: '0x8c4e…a1d7', balance: 50 },
  doordash: { name: 'DoorDash Drive',  role: 'Dasher Logistics',            addr: '0xdd41…3b08', balance: 180 },
  phone:    { name: 'StablePhone',     role: 'AI Phone Calls',              addr: '0x71ae…b304', balance: 18 },
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
      orderUrl: `http://localhost:${PORT}/order/${slug}`,
    })),
    howToOrder: `tempo request "http://localhost:${PORT}/order/:slug?name=Your+Name&email=you@example.com&phone=%2B15551234567&address=123+Main+St"`,
  })
})

// ── GET /order/:slug — MPP-gated customer order ──────────────────────────────
app.get('/order/:slug', (req, res, next) => {
  const sandwich = MENU.find(s => s.slug === req.params.slug)
  if (!sandwich) return res.status(404).json({ error: 'Sandwich not found. GET /menu for options.' })
  if (!req.query.name || !req.query.email) {
    return res.status(400).json({ error: 'name, email query params required. phone recommended.' })
  }
  mppx.charge({
    amount: String(sandwich.price),
    description: `${sandwich.name} - ${KITCHEN_NAME}`,
  })(req, res, next)
}, async (req, res) => {
  const sandwich = MENU.find(s => s.slug === req.params.slug)
  const { name, email, address, phone } = req.query

  const order = createOrder({
    sandwich,
    customerName: name,
    customerEmail: email,
    customerPhone: phone || '+15550000000',
    customerAddress: address || 'pickup',
    type: address ? 'delivery' : 'pickup',
    status: 'confirmed',
  })

  recordUsage(order.id, sandwich.bom)
  console.log(`[${order.id}] confirmed: ${sandwich.name} for ${name}`)
  broadcast('order', order)

  if (address) {
    setImmediate(() => provisionDelivery(order, sandwich))
  }

  res.json({
    orderId: order.id,
    sandwich: sandwich.name,
    status: 'confirmed',
    type: address ? 'delivery' : 'pickup',
    message: address
      ? `Order confirmed! A Dasher will pick it up shortly.`
      : `Order confirmed! Pick up at the kitchen when ready.`,
    pollUrl: `http://localhost:${PORT}/orders/${order.id}`,
  })
})

// ── POST /api/order/:slug — demo UI order (no MPP gate) ─────────────────────
app.post('/api/order/:slug', (req, res) => {
  const sandwich = MENU.find(s => s.slug === req.params.slug)
  if (!sandwich) return res.status(404).json({ error: 'Sandwich not found' })

  const { name, email, phone, pickup, type } = req.body
  const orderType = type || 'pickup'

  const order = createOrder({
    sandwich,
    customerName: name || 'Demo Customer',
    customerEmail: email || 'demo@ghost.kitchen',
    customerPhone: phone || '+15550000000',
    customerAddress: pickup || 'Prospect Heights',
    type: orderType,
    status: 'received',
  })

  recordUsage(order.id, sandwich.bom)

  // Update stats
  stats.orders++
  stats.rev += sandwich.price
  const meatCost = sandwich.bom.find(b => b.supplier === 'butcher')?.price || 0
  const breadCost = sandwich.bom.find(b => b.supplier === 'bakery')?.price || 0
  stats.cogs += meatCost + breadCost

  console.log(`[${order.id}] demo order: ${sandwich.name} for ${name} (${orderType})`)
  broadcast('order', order)

  // If delivery, provision via Laso Finance
  if (orderType === 'delivery') {
    setImmediate(() => provisionDelivery(order, sandwich))
  }

  res.json(order)
})

// ── Laso Finance delivery provisioning ──────────────────────────────────────
async function provisionDelivery(order, sandwich) {
  try {
    const lasoRes = await fetch('http://localhost:3004/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: (sandwich.lasoCost || 0.01) + (sandwich.dashCost || 4.50),
        orderId: order.id,
        sandwichName: sandwich.name,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        pickupAddress: '665 Vanderbilt Ave, Brooklyn, NY 11238',
        dropoffAddress: order.customerAddress || 'Customer address',
      }),
    })

    const card = await lasoRes.json()

    stats.del += (sandwich.lasoCost || 0.01) + (sandwich.dashCost || 4.50)

    updateOrder(order.id, {
      status: 'out_for_delivery',
      delivery: {
        cardId: card.cardId,
        cardLast4: card.cardLast4,
        dasherName: card.delivery?.dasher?.name,
        dasherVehicle: card.delivery?.dasher?.vehicle,
        dasherRating: card.delivery?.dasher?.rating,
        etaMin: card.delivery?.eta?.minutes,
        trackingUrl: card.delivery?.trackingUrl,
        status: card.delivery?.status || 'dasher_assigned',
      },
    })

    broadcast('order_update', { id: order.id, status: 'out_for_delivery', delivery: order.delivery })
    console.log(`[${order.id}] Laso card ${card.cardId} → DoorDash dispatched (${card.delivery?.dasher?.name})`)

    // Poll Laso for delivery status updates
    pollDeliveryStatus(order.id, card.cardId)
  } catch (err) {
    console.error(`[${order.id}] Laso provision error:`, err.message)
    updateOrder(order.id, { delivery: { status: 'dispatch_failed', error: err.message } })
  }
}

// Poll Laso card status and broadcast delivery updates
function pollDeliveryStatus(orderId, cardId) {
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`http://localhost:3004/card/${cardId}`)
      const card = await res.json()
      const deliveryStatus = card.delivery?.status

      if (deliveryStatus) {
        const order = getOrder(orderId)
        if (order && order.delivery?.status !== deliveryStatus) {
          order.delivery.status = deliveryStatus
          updateOrder(orderId, { delivery: order.delivery })
          broadcast('delivery_update', { id: orderId, status: deliveryStatus, delivery: card.delivery })
          console.log(`[${orderId}] delivery: ${deliveryStatus}`)
        }

        if (deliveryStatus === 'delivered') {
          clearInterval(interval)
        }
      }
    } catch {
      // Laso may not be reachable — ignore
    }
  }, 5000)

  // Stop polling after 10 minutes
  setTimeout(() => clearInterval(interval), 600000)
}

// ── POST /api/order/:id/ready — cook marks ready → StablePhone call ─────────
app.post('/api/order/:id/ready', async (req, res) => {
  const order = getOrder(req.params.id)
  if (!order) return res.status(404).json({ error: 'Order not found' })

  updateOrder(order.id, { status: 'ready' })
  broadcast('order_update', { id: order.id, status: 'ready' })
  console.log(`[${order.id}] marked ready — triggering StablePhone call`)

  // Trigger StablePhone AI call
  const phone = order.customerPhone || '+15550000000'
  const sandwichName = order.sandwich?.name || 'sandwich'
  const isDelivery = order.type === 'delivery'
  const dasherName = order.delivery?.dasherName || 'your dasher'
  const etaMin = order.delivery?.etaMin || 20
  const pickup = order.customerAddress || 'Prospect Heights'

  const prompt = isDelivery
    ? `You are a friendly delivery notification agent for Prospect Butcher Co, a sandwich shop in Brooklyn. Call the customer to let them know their ${sandwichName} is on the way with ${dasherName}. They should arrive in about ${etaMin} minutes. Be brief and warm.`
    : `You are a friendly pickup notification agent for Prospect Butcher Co, a sandwich shop in Brooklyn. Call the customer to let them know their ${sandwichName} order is ready for pickup at ${pickup}. Be brief, warm, and confirm the pickup location. If they ask questions, you can tell them the shop is at 665 Vanderbilt Ave.`

  const firstMessage = isDelivery
    ? `Hi! This is Prospect Butcher Co calling. Great news — your ${sandwichName} is on the way with ${dasherName}! They'll be there in about ${etaMin} minutes.`
    : `Hi! This is Prospect Butcher Co calling. Great news — your ${sandwichName} is ready for pickup at our ${pickup} location! Just show your order code at the counter.`

  try {
    const { stdout } = await execFileAsync('tempo', [
      'request', '-X', 'POST',
      'https://stablephone.dev/api/call',
      '-H', 'Content-Type: application/json',
      '-d', JSON.stringify({ phoneNumber: phone, prompt, firstMessage }),
    ], { timeout: 30000 })

    const callData = JSON.parse(stdout)
    stats.comms += order.sandwich?.callCost || 0.54
    updateOrder(order.id, { status: 'called', call: callData })
    broadcast('order_update', { id: order.id, status: 'called', call: callData })
    console.log(`[${order.id}] StablePhone call initiated: ${callData.id}`)
    res.json({ order: order.id, status: 'called', call: callData })
  } catch (err) {
    console.error(`[${order.id}] StablePhone error:`, err.message)
    stats.comms += order.sandwich?.callCost || 0.54
    updateOrder(order.id, { status: 'called', call: { error: err.message, simulated: true } })
    broadcast('order_update', { id: order.id, status: 'called', simulated: true })
    res.json({ order: order.id, status: 'called', simulated: true, error: err.message })
  }
})

// ── GET /api/call/:id — check call status ────────────────────────────────────
app.get('/api/call/:id', async (req, res) => {
  try {
    const { stdout } = await execFileAsync('tempo', [
      'request',
      `https://stablephone.dev/api/call/${req.params.id}`,
    ], { timeout: 15000 })
    res.json(JSON.parse(stdout))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/stats — current session stats ──────────────────────────────────
app.get('/api/stats', (req, res) => {
  const margin = +(stats.rev - stats.cogs - stats.del - stats.comms).toFixed(2)
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
  console.log(`  GET  /order/:slug?...        place an order (MPP payment)`)
  console.log(`  POST /api/order/:slug        demo order (no MPP)`)
  console.log(`  POST /api/order/:id/ready    mark ready → StablePhone call`)
  console.log(`  GET  /api/call/:id           check call status`)
  console.log(`  GET  /api/stats              current session stats`)
  console.log(`  GET  /api/wallets            simulated wallet balances`)
  console.log(`  GET  /api/events             SSE event stream`)
  console.log(`  GET  /orders/:id             poll order status`)
  console.log(`  GET  /kitchen/usage          today's ingredient usage`)
  console.log(`  POST /kitchen/restock        trigger EOD supplier payments`)
  console.log(`\n  Wallet: ${WALLET}`)
  console.log(`  Payment flow: customer -[MPP]-> kitchen -[Laso]-> DoorDash -[StablePhone]-> call`)
  console.log(`  Restock flow: kitchen -[MPP]-> Fleisher's + Runner & Stone (EOD batch)\n`)
})
