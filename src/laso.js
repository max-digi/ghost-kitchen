/**
 * Laso Finance — Virtual Debit Card Bridge
 *
 * Accepts USDC on Tempo via MPP, provisions a single-use virtual Visa card,
 * and uses that card to pay legacy APIs (DoorDash Drive).
 *
 * Flow:
 *   1. Kitchen Agent pays Laso via MPP  (Tempo USDC)
 *   2. Laso provisions a virtual Visa   (single-use, exact amount)
 *   3. Laso calls DoorDash Drive API    (pays with virtual card)
 *   4. Returns delivery confirmation + tracking URL
 *
 * Endpoints:
 *   POST /provision   — create virtual card + dispatch delivery (MPP-gated)
 *   GET  /card/:id    — check card status + delivery status
 *   GET  /health      — service health
 */
import express from 'express'
import { Mppx, tempo } from 'mppx/express'
import { USDC_TOKEN } from './menu.js'

const LASO_WALLET = '0x8c4eaf91b20c5e0000000000000000000000a1d7'
const LASO_PORT = 3004

// In-memory card store
const cards = new Map()
let cardSeq = 4000

// Simulated Dasher names + vehicles
const DASHERS = [
  { name: 'Marcus T.', vehicle: 'Bike', rating: 4.9 },
  { name: 'Priya K.',  vehicle: 'Car',  rating: 4.8 },
  { name: 'Diego R.',  vehicle: 'Bike', rating: 4.7 },
  { name: 'Aisha M.',  vehicle: 'Car',  rating: 4.9 },
  { name: 'Tommy L.',  vehicle: 'E-Bike', rating: 4.6 },
]

function randomDasher() {
  return DASHERS[Math.floor(Math.random() * DASHERS.length)]
}

function generateCardNumber() {
  // Simulated Visa: 4xxx xxxx xxxx xxxx
  const groups = ['4917', ...Array(3).fill(0).map(() => String(Math.floor(1000 + Math.random() * 9000)))]
  return groups.join(' ')
}

export function startLaso() {
  const app = express()
  app.use(express.json())

  const mppx = Mppx.create({
    methods: [tempo({ currency: USDC_TOKEN, recipient: LASO_WALLET })],
    realm: 'laso.finance.local',
    secretKey: 'laso-finance-secret-change-in-prod',
  })

  // GET /health
  app.get('/health', (req, res) => {
    res.json({ service: 'Laso Finance', status: 'operational', cardsIssued: cards.size })
  })

  // POST /provision — MPP-gated: provision virtual card + dispatch DoorDash delivery
  app.post('/provision', (req, res, next) => {
    const { amount } = req.body ?? {}
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'amount required (total delivery cost)' })
    }
    mppx.charge({
      amount: String(amount),
      description: `Virtual card provision — Laso Finance`,
    })(req, res, next)
  }, (req, res) => {
    const { amount, orderId, pickupAddress, dropoffAddress, customerName, customerPhone, sandwichName } = req.body

    cardSeq++
    const cardId = `LASO-${cardSeq}`
    const cardNumber = generateCardNumber()
    const expMonth = String(new Date().getMonth() + 2).padStart(2, '0')
    const expYear = String(new Date().getFullYear()).slice(-2)
    const cvv = String(100 + Math.floor(Math.random() * 900))
    const dasher = randomDasher()

    // Simulated ETA: 15-30 min
    const etaMinutes = 15 + Math.floor(Math.random() * 16)
    const etaTime = new Date(Date.now() + etaMinutes * 60000)

    const card = {
      cardId,
      cardNumber,
      cardLast4: cardNumber.slice(-4),
      expiry: `${expMonth}/${expYear}`,
      cvv: '***',
      network: 'Visa',
      type: 'single-use',
      limit: amount,
      funded: amount,
      status: 'active',
      createdAt: new Date().toISOString(),

      // Delivery details
      delivery: {
        id: `DD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        status: 'dasher_assigned',
        orderId: orderId || cardId,
        sandwichName: sandwichName || 'Sandwich',
        pickup: pickupAddress || '665 Vanderbilt Ave, Brooklyn, NY 11238',
        dropoff: dropoffAddress || 'Customer address',
        customerName: customerName || 'Customer',
        customerPhone: customerPhone || '+15550000000',
        dasher: {
          name: dasher.name,
          vehicle: dasher.vehicle,
          rating: dasher.rating,
        },
        eta: {
          minutes: etaMinutes,
          arrival: etaTime.toISOString(),
          display: `${etaMinutes} min`,
        },
        trackingUrl: `https://track.doordash.com/${cardId.toLowerCase()}`,
        timeline: [
          { status: 'confirmed', time: new Date().toISOString(), message: 'Delivery confirmed' },
          { status: 'dasher_assigned', time: new Date(Date.now() + 2000).toISOString(), message: `${dasher.name} assigned (${dasher.vehicle})` },
        ],
      },

      // Payment bridge audit trail
      bridge: {
        source: 'Tempo USDC (MPP)',
        intermediary: 'Laso Finance Virtual Card',
        destination: 'DoorDash Drive API',
        sourceAmount: amount,
        cardAmount: amount - 0.01,
        fee: 0.01,
        feeDescription: 'Card issuance fee',
      },
    }

    cards.set(cardId, card)
    console.log(`  [laso] Card ${cardId} issued: $${amount} → Visa ****${card.cardLast4} → DoorDash (${dasher.name}, ${etaMinutes}min ETA)`)

    // Simulate delivery progress over time
    simulateDeliveryProgress(cardId, etaMinutes)

    res.json(card)
  })

  // GET /card/:id — check card + delivery status
  app.get('/card/:id', (req, res) => {
    const card = cards.get(req.params.id)
    if (!card) return res.status(404).json({ error: 'Card not found' })
    res.json(card)
  })

  // GET /deliveries — list all active deliveries
  app.get('/deliveries', (req, res) => {
    const active = [...cards.values()].filter(c => c.delivery && c.delivery.status !== 'delivered')
    res.json({ active: active.length, deliveries: active.map(c => c.delivery) })
  })

  app.listen(LASO_PORT, () => {
    console.log(`  [laso-finance] :${LASO_PORT} — virtual card bridge`)
  })

  return app
}

// Simulate delivery status progression
function simulateDeliveryProgress(cardId, etaMinutes) {
  const card = cards.get(cardId)
  if (!card) return

  // Phase 1: Dasher heading to restaurant (30% of ETA)
  const pickupMs = Math.round(etaMinutes * 0.3 * 60000)
  setTimeout(() => {
    if (!cards.has(cardId)) return
    card.delivery.status = 'dasher_at_store'
    card.delivery.timeline.push({
      status: 'dasher_at_store',
      time: new Date().toISOString(),
      message: `${card.delivery.dasher.name} arrived at restaurant`,
    })
    console.log(`  [laso] ${cardId}: Dasher at store`)
  }, Math.min(pickupMs, 8000)) // Cap at 8s for demo

  // Phase 2: Picked up (50% of ETA)
  const pickedUpMs = Math.round(etaMinutes * 0.5 * 60000)
  setTimeout(() => {
    if (!cards.has(cardId)) return
    card.delivery.status = 'picked_up'
    card.delivery.timeline.push({
      status: 'picked_up',
      time: new Date().toISOString(),
      message: `Order picked up — en route to ${card.delivery.customerName}`,
    })
    console.log(`  [laso] ${cardId}: Picked up, en route`)
  }, Math.min(pickedUpMs, 15000))

  // Phase 3: Approaching (80% of ETA)
  const approachMs = Math.round(etaMinutes * 0.8 * 60000)
  setTimeout(() => {
    if (!cards.has(cardId)) return
    card.delivery.status = 'approaching'
    card.delivery.timeline.push({
      status: 'approaching',
      time: new Date().toISOString(),
      message: `${card.delivery.dasher.name} is nearby`,
    })
    console.log(`  [laso] ${cardId}: Approaching`)
  }, Math.min(approachMs, 25000))

  // Phase 4: Delivered (100% of ETA)
  const deliveredMs = etaMinutes * 60000
  setTimeout(() => {
    if (!cards.has(cardId)) return
    card.delivery.status = 'delivered'
    card.status = 'spent'
    card.delivery.timeline.push({
      status: 'delivered',
      time: new Date().toISOString(),
      message: 'Order delivered!',
    })
    console.log(`  [laso] ${cardId}: Delivered ✓`)
  }, Math.min(deliveredMs, 35000))
}
