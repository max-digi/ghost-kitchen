import jwt from 'jsonwebtoken'

const BASE_URL = 'https://openapi.doordash.com/drive/v2'

function makeJwt() {
  const { DOORDASH_DEVELOPER_ID, DOORDASH_KEY_ID, DOORDASH_SIGNING_SECRET } = process.env
  if (!DOORDASH_DEVELOPER_ID || !DOORDASH_KEY_ID || !DOORDASH_SIGNING_SECRET) {
    throw new Error('Missing DoorDash credentials in .env')
  }
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    { aud: 'doordash', iss: DOORDASH_DEVELOPER_ID, kid: DOORDASH_KEY_ID, iat: now, exp: now + 1800 },
    Buffer.from(DOORDASH_SIGNING_SECRET, 'base64'),
    { algorithm: 'HS256', header: { alg: 'HS256', typ: 'JWT', 'dd-ver': 'DD-JWT-V1' } },
  )
}

async function ddFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${makeJwt()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`DoorDash API error ${res.status}: ${JSON.stringify(body)}`)
  return body
}

// Ghost kitchen address (pickup)
const KITCHEN_ADDRESS = process.env.KITCHEN_ADDRESS || '665 Vanderbilt Ave, Brooklyn, NY 11238'
const KITCHEN_NAME    = process.env.KITCHEN_NAME    || 'Ghost Kitchen'
const KITCHEN_PHONE   = process.env.KITCHEN_PHONE   || '+15551234567'

export async function createDelivery({ orderId, customerName, customerPhone, customerAddress, orderValue }) {
  return ddFetch('/deliveries', {
    method: 'POST',
    body: JSON.stringify({
      external_delivery_id: orderId,
      pickup_address:       KITCHEN_ADDRESS,
      pickup_business_name: KITCHEN_NAME,
      pickup_phone_number:  KITCHEN_PHONE,
      pickup_instructions:  `Order ${orderId} — ready for pickup`,
      dropoff_address:      customerAddress,
      dropoff_business_name: customerName,
      dropoff_phone_number: customerPhone,
      dropoff_instructions: 'Leave at door if no answer',
      order_value:          Math.round(orderValue * 100), // cents
    }),
  })
}

export async function getDelivery(deliveryId) {
  return ddFetch(`/deliveries/${deliveryId}`)
}
