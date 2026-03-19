# Ghost Kitchen — Agentic B2B Payments

A single-page demo app showcasing **multi-hop payment cascades** powered by [Tempo MPP](https://tempo.xyz). Inspired by Prospect Butcher Co in Brooklyn.

## What it does

A customer orders a sandwich. An autonomous kitchen agent handles the entire payment cascade:

```
Customer → Kitchen → Fleisher's (meat) → Runner & Stone (bread) → Laso Finance (virtual card) → DoorDash Drive → StablePhone (AI call)
```

Every hop is a real USDC payment on Tempo. The demo visualizes this across three tabs:

| Tab | What you see |
|-----|-------------|
| **Customer** | Chat with your agent, pick an item, choose pickup or delivery |
| **Kitchen** | Kanban board — incoming → prepping → ready. Zero cognitive load. |
| **Operator** | Payment cascade, wallet balances, TX log, EOD auto-reorder |

### Key features

- **Pickup vs Delivery** — Pickup skips Laso/DoorDash (3 hops). Delivery gets the full cascade (7 hops).
- **Laso Finance** — Virtual single-use Visa cards funded by Tempo USDC, used to pay DoorDash Drive.
- **DoorDash delivery tracking** — Dasher name, vehicle, rating, ETA, progress bar.
- **StablePhone AI calls** — Context-aware: "on the way with Marcus!" for delivery, "ready at the counter" for pickup.
- **EOD Auto-Reorder** — After 2+ orders, agent scans inventory against par stock and auto-fires supplier payment cascades.
- **Brooklyn suppliers** — Fleisher's Craft Butchery (Park Slope) and Runner & Stone (Gowanus).

## Quick start

```bash
npm install
cp .env.example .env    # edit with your keys
npm start               # http://localhost:3000
```

The frontend works in two modes:
- **Connected** (via `npm start` on port 3000) — fires real API calls + SSE
- **Standalone** (open `index.html` directly) — fully simulated, no server needed

## Architecture

```
:3000  Ghost Kitchen (Express + MPP server + static frontend)
:3001  Fleisher's supplier (mock MPP)
:3002  Runner & Stone supplier (mock MPP)
:3004  Laso Finance (virtual card bridge + delivery simulation)
```

## Stack

- **Frontend**: Single HTML file, vanilla JS, no build step
- **Backend**: Express, [mppx](https://www.npmjs.com/package/mppx) for MPP payments
- **Payments**: Tempo USDC via MPP (Micropayment Protocol)
- **Delivery**: Laso Finance virtual cards → DoorDash Drive API
- **Calls**: StablePhone AI via `tempo request`
- **Design**: Instrument Serif + DM Sans + JetBrains Mono, warm cream palette

## License

MIT
