// In-memory order store (swap for DB in prod)
const orders = new Map()

export function createOrder(data) {
  const id = `GK-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const order = { id, status: 'pending', createdAt: new Date().toISOString(), ...data }
  orders.set(id, order)
  return order
}

export function updateOrder(id, patch) {
  const order = orders.get(id)
  if (!order) throw new Error(`Order ${id} not found`)
  Object.assign(order, patch)
  return order
}

export function getOrder(id) {
  return orders.get(id)
}

export function listOrders() {
  return [...orders.values()]
}
