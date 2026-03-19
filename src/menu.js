// Token + wallet constants (Tempo mainnet)
export const USDC_TOKEN = '0x20c000000000000000000000b9537d11c60e8b50'
export const CHAIN_ID = 4217
export const WALLET = '0x878def74393d9979eb6747b15d40ca3f1577ebf3'

// Supplier ports
export const SUPPLIERS = {
  butcher: { url: 'http://localhost:3001', name: "Fleisher's", note: 'Craft Butchery · Park Slope' },
  bakery:  { url: 'http://localhost:3002', name: 'Runner & Stone', note: 'Artisan Bakery · Gowanus' },
}

// Menu with bill of materials (BOM)
// price in USDC (human units, e.g. 15 = $15)
export const MENU = [
  {
    slug: 'turkey-bacon-jam',
    name: 'Turkey & Bacon Jam',
    price: 15,
    description: 'Smoked turkey breast, bacon jam, white American cheese, Duke\'s mayo, Crystal hot sauce, watercress on ciabatta',
    bom: [
      { supplier: 'butcher', ingredient: 'smoked-turkey-bacon-jam', price: 5.50 },
      { supplier: 'bakery',  ingredient: 'ciabatta-roll',           price: 1.20 },
    ],
  },
  {
    slug: 'pbc-roast-beef',
    name: 'PBC Roast Beef',
    price: 15,
    description: 'Rare roast beef, Barber\'s aged cheddar, horseradish mayo, pickled green tomato, watercress on ciabatta',
    bom: [
      { supplier: 'butcher', ingredient: 'rare-roast-beef', price: 6.00 },
      { supplier: 'bakery',  ingredient: 'ciabatta-roll',   price: 1.20 },
    ],
  },
  {
    slug: 'chicken-salad',
    name: 'Chicken Salad',
    price: 14,
    description: 'Housemade chicken salad with dijon, Old Bay, Duke\'s mayo, watercress on ciabatta',
    bom: [
      { supplier: 'butcher', ingredient: 'chicken-salad-mix', price: 4.00 },
      { supplier: 'bakery',  ingredient: 'ciabatta-roll',     price: 1.20 },
    ],
  },
  {
    slug: 'korean-bbq',
    name: 'Korean BBQ',
    price: 16,
    description: 'Gochujang beef, kimchi, pickled cucumbers on ciabatta with gochujang mayo',
    bom: [
      { supplier: 'butcher', ingredient: 'gochujang-beef', price: 6.50 },
      { supplier: 'bakery',  ingredient: 'ciabatta-roll',  price: 1.20 },
    ],
  },
  {
    slug: 'boudinwich',
    name: 'Boudinwich',
    price: 16,
    description: 'Cajun boudin, pickled red onions & serranos, garlic aioli, watercress on ciabatta',
    bom: [
      { supplier: 'butcher', ingredient: 'cajun-boudin',  price: 5.80 },
      { supplier: 'bakery',  ingredient: 'ciabatta-roll', price: 1.20 },
    ],
  },
  {
    slug: 'chopped-liver',
    name: 'Chopped Liver',
    price: 12,
    description: 'Smooth chopped liver, cornichons, brown mustard, watercress on ciabatta',
    bom: [
      { supplier: 'butcher', ingredient: 'chopped-liver', price: 3.50 },
      { supplier: 'bakery',  ingredient: 'ciabatta-roll', price: 1.20 },
    ],
  },
  {
    slug: 'housemade-ham',
    name: 'Housemade Ham',
    price: 15,
    description: 'Ham, fig mostarda, gruyère, cornichons, Duke\'s mayo, watercress on ciabatta',
    bom: [
      { supplier: 'butcher', ingredient: 'housemade-ham', price: 5.00 },
      { supplier: 'bakery',  ingredient: 'ciabatta-roll', price: 1.20 },
    ],
  },
  {
    slug: 'rolled-beef',
    name: 'Rolled Beef',
    price: 15,
    description: 'Rolled beef (roasted pastrami), deli mustard, cole slaw, swiss, watercress on ciabatta',
    bom: [
      { supplier: 'butcher', ingredient: 'rolled-beef', price: 6.00 },
      { supplier: 'bakery',  ingredient: 'ciabatta-roll', price: 1.20 },
    ],
  },
]
