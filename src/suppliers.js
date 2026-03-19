/**
 * Mock supplier MPP servers.
 * Each exposes:
 *   GET  /catalog           - list available ingredients
 *   POST /restock           - EOD bulk MPP payment (pays totalCost in one shot)
 */
import express from 'express'
import { Mppx, tempo } from 'mppx/express'
import { USDC_TOKEN, WALLET } from './menu.js'

const CATALOG = {
  butcher: {
    'smoked-turkey-bacon-jam': { price: 5.50, description: 'Smoked turkey breast + bacon jam pack' },
    'rare-roast-beef':         { price: 6.00, description: 'Rare roast beef, Barber\'s aged cheddar ready' },
    'chicken-salad-mix':       { price: 4.00, description: 'Housemade chicken salad with dijon & Old Bay' },
    'gochujang-beef':          { price: 6.50, description: 'Gochujang shredded beef 200g' },
    'cajun-boudin':            { price: 5.80, description: 'Cajun boudin sausage link' },
    'chopped-liver':           { price: 3.50, description: 'Smooth chopped liver spread' },
    'housemade-ham':           { price: 5.00, description: 'House-cured ham sliced' },
    'rolled-beef':             { price: 6.00, description: 'Rolled beef (roasted pastrami) sliced' },
  },
  bakery: {
    'ciabatta-roll': { price: 1.20, description: 'Fresh ciabatta roll — Runner & Stone' },
  },
}

function makeSupplierApp(name, catalog) {
  const app = express()
  app.use(express.json())

  const mppx = Mppx.create({
    methods: [tempo({ currency: USDC_TOKEN, recipient: WALLET })],
    realm: `${name}.supplier.local`,
    secretKey: `${name}-supplier-secret-change-in-prod`,
  })

  // GET /catalog
  app.get('/catalog', (req, res) => {
    res.json({ supplier: name, items: Object.entries(catalog).map(([slug, info]) => ({ slug, ...info })) })
  })

  // POST /restock — EOD bulk payment
  // Ghost kitchen pays totalCost in a single MPP charge covering the day's usage
  app.post('/restock', (req, res, next) => {
    const { totalCost } = req.body ?? {}
    if (!totalCost || totalCost <= 0) {
      return res.status(400).json({ error: 'totalCost required' })
    }
    mppx.charge({
      amount: String(totalCost),
      description: `EOD restock - ${name} supplier`,
    })(req, res, next)
  }, (req, res) => {
    const { items, totalCost } = req.body
    console.log(`  [${name}] received EOD restock: $${totalCost}`)
    res.json({
      supplier: name,
      status: 'restocked',
      items,
      totalCost,
      restockedAt: new Date().toISOString(),
      expectedDelivery: 'tomorrow 6am',
    })
  })

  return app
}

export function startSuppliers() {
  const defs = [
    { key: 'butcher', port: 3001 },
    { key: 'bakery',  port: 3002 },
  ]
  for (const { key, port } of defs) {
    makeSupplierApp(key, CATALOG[key]).listen(port, () => {
      console.log(`  [supplier:${key}] :${port}`)
    })
  }
}
