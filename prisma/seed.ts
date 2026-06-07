// prisma/seed.ts
// Run: npm run db:seed

import { PrismaClient } from '@prisma/client'
import argon2 from '@node-rs/argon2'

const prisma = new PrismaClient()

const DEMO_PASSWORD_HASH = await argon2.hash('123321admin', {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
})

async function main() {
  console.log('🌱 Seeding TalkTable database...')

  // ── Restaurant ─────────────────────────────────────────────────────────────
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'firefly-jordan' },
    update: {},
    create: {
      name: 'Firefly Burger',
      slug: 'firefly-jordan',
      address: 'Amman, Jordan',
      phone: '+962795041122',
      currency: 'JOD',
      timezone: 'Asia/Amman',
      settings: {
        create: {
          upsellEnabled: true,
          notificationSound: true,
          orderAutoAccept: false,
          aiSystemPrompt: `You are the AI assistant for Firefly Burger Jordan. Founded in 2011. Be warm, helpful, and enthusiastic about the food. Always upsell combos.`,
        },
      },
    },
  })
  console.log(`✅ Restaurant: ${restaurant.name}`)

  // ── Demo Users ─────────────────────────────────────────────────────────────
  const users = [
    { email: 'admin@talktable.demo',   name: 'TalkTable Admin', role: 'ADMIN'   as const, restaurantId: null },
    { email: 'manager@firefly.demo',   name: 'Firefly Manager', role: 'MANAGER' as const, restaurantId: restaurant.id },
    { email: 'kitchen@firefly.demo',   name: 'Kitchen Staff',   role: 'KITCHEN' as const, restaurantId: restaurant.id },
    { email: 'waiter@firefly.demo',    name: 'Waiter Staff',    role: 'WAITER'  as const, restaurantId: restaurant.id },
  ]

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        restaurantId: u.restaurantId,
        passwordHash: DEMO_PASSWORD_HASH,
        mustChangePassword: true,
      },
    })
    console.log(`✅ User: ${u.email} (${u.role})`)
  }

  // ── Allergens ──────────────────────────────────────────────────────────────
  const allergenData = [
    { name: 'Gluten',   emoji: '🌾' },
    { name: 'Dairy',    emoji: '🥛' },
    { name: 'Eggs',     emoji: '🥚' },
    { name: 'Nuts',     emoji: '🥜' },
    { name: 'Soy',      emoji: '🫘' },
    { name: 'Sesame',   emoji: '🌿' },
  ]
  const allergens: Record<string, { id: string }> = {}
  for (const a of allergenData) {
    const created = await prisma.allergen.upsert({
      where: { name: a.name }, update: {}, create: a,
    })
    allergens[a.name] = created
  }

  // ── Menu Categories ────────────────────────────────────────────────────────
  const catData = [
    { name: 'Burgers',    emoji: '🍔', sortOrder: 1 },
    { name: 'Chicken',    emoji: '🍗', sortOrder: 2 },
    { name: 'Fries',      emoji: '🍟', sortOrder: 3 },
    { name: 'Sides',      emoji: '🥗', sortOrder: 4 },
    { name: 'Kids',       emoji: '🧒', sortOrder: 5 },
    { name: 'Drinks',     emoji: '🥤', sortOrder: 6 },
    { name: 'Combos',     emoji: '🔥', sortOrder: 7 },
  ]
  const cats: Record<string, { id: string }> = {}
  for (const c of catData) {
    const existing = await prisma.category.findFirst({ where: { restaurantId: restaurant.id, name: c.name } })
    const cat = existing ?? await prisma.category.create({ data: { ...c, restaurantId: restaurant.id } })
    cats[c.name] = cat
  }

  // ── Menu Items (real Firefly Burger menu) ──────────────────────────────────
  const menuItems = [
    // BURGERS
    { cat: 'Burgers', name: 'Firefly Burger',      price: 3.500, emoji: '🍔', desc: 'Our signature! 150g finest meat, beef bacon, caramelised onions, pickles & secret Firefly sauce.', cal: 820, pop: true, feat: true,  allergens: ['Gluten','Dairy'], ing: ['beef patty 150g','beef bacon','caramelised onions','pickles','Firefly sauce'] },
    { cat: 'Burgers', name: 'Angus Burger',         price: 4.800, emoji: '🥩', desc: 'A bit smoky! 200g Angus burger, bacon, smoked cheese, and Firefly sauce.',                           cal: 950, pop: true, feat: false, allergens: ['Gluten','Dairy'], ing: ['angus beef 200g','bacon','smoked cheese','Firefly sauce'] },
    { cat: 'Burgers', name: 'Kamakazi Burger',      price: 4.500, emoji: '🌶️', desc: 'Meat lovers go too! 2×150g with sweet chilli sauce, caramelised onions and Firefly sauce.',         cal:1050, pop: true, feat: true,  allergens: ['Gluten','Dairy'], ing: ['beef 2x150g','sweet chilli sauce','caramelised onions','Firefly sauce'] },
    { cat: 'Burgers', name: 'Backfire',              price: 4.500, emoji: '🔥', desc: 'Injected with hot sauce — 2×150g, chilli, chilli lava sauce, jalapeños. Seriously hot!',            cal:1000, pop: false,feat: false, allergens: ['Gluten'],         ing: ['beef 2x150g','hot sauce injection','chilli','chilli lava','jalapeños'] },
    { cat: 'Burgers', name: 'Egg Bacon',             price: 4.200, emoji: '🍳', desc: 'American style — egg, bacon, caramelized onions, cheddar cheese, and fresh beef patty.',           cal: 880, pop: false,feat: false, allergens: ['Gluten','Dairy','Eggs'], ing: ['beef patty','egg','bacon','caramelized onions','cheddar'] },
    { cat: 'Burgers', name: 'Wallstreet',            price: 4.200, emoji: '🍄', desc: '150g fresh meat, Wall Street sauce, fresh mushrooms and a mix of cheese.',                         cal: 840, pop: false,feat: false, allergens: ['Gluten','Dairy'], ing: ['beef 150g','Wall Street sauce','mushrooms','mixed cheese'] },
    { cat: 'Burgers', name: 'Wagyu Burger',          price: 6.500, emoji: '⭐', desc: 'Special treat! 110g finest Wagyu beef, potato bun, American cheese.',                               cal: 780, pop: true, feat: true,  allergens: ['Gluten','Dairy'], ing: ['wagyu 110g','potato bun','American cheese'] },
    { cat: 'Burgers', name: 'Keto Beef',             price: 4.000, emoji: '🥗', desc: 'On a diet? 150g fresh meat with keto buns — you can Firefly on a diet!',                           cal: 620, pop: false,feat: false, allergens: ['Dairy'],          ing: ['beef 150g','keto bun','lettuce','tomato'] },
    { cat: 'Burgers', name: 'Honey Onion Burger',    price: 4.000, emoji: '🍯', desc: 'For the sweet lovers! 150g fresh meat, honey mustard sauce and caramelized onion.',                 cal: 800, pop: false,feat: false, allergens: ['Gluten','Dairy'], ing: ['beef 150g','honey mustard','caramelized onion'] },
    { cat: 'Burgers', name: 'Classic Burger',        price: 3.200, emoji: '🍔', desc: '100g fresh meat, lettuce, pickles, caramelized onions, mayo & ketchup, cheddar cheese.',           cal: 720, pop: false,feat: false, allergens: ['Gluten','Dairy'], ing: ['beef 100g','lettuce','pickles','onions','mayo','ketchup','cheddar'] },
    { cat: 'Burgers', name: 'Mystic Burger',         price: 4.000, emoji: '🌫️', desc: 'A bit smoky and sweet! 150g fresh meat, BBQ sauce and caramelized onion.',                         cal: 800, pop: false,feat: false, allergens: ['Gluten','Dairy'], ing: ['beef 150g','BBQ sauce','caramelized onion'] },
    { cat: 'Burgers', name: 'Brisket Sandwich',      price: 4.500, emoji: '🥪', desc: '100g brisket, Wall Street sauce, mushrooms, lettuce, black secret sauce on special bread.',        cal: 750, pop: false,feat: false, allergens: ['Gluten'],          ing: ['brisket 100g','Wall Street sauce','mushrooms','lettuce','black sauce','special bread'] },
    // CHICKEN
    { cat: 'Chicken', name: 'Bucharest Crispy',      price: 4.200, emoji: '🍗', desc: '200g crispy chicken breast topped with turkey and the special Bucharest sauce.',                    cal: 800, pop: true, feat: true,  allergens: ['Gluten','Dairy'], ing: ['crispy chicken 200g','turkey','Bucharest sauce'] },
    { cat: 'Chicken', name: 'Bucharest Grilled',     price: 4.200, emoji: '🔥', desc: 'Same Bucharest sandwich but 200g grilled chicken breast.',                                          cal: 620, pop: false,feat: false, allergens: ['Gluten','Dairy'], ing: ['grilled chicken 200g','Bucharest sauce'] },
    { cat: 'Chicken', name: 'Wallstreet Chicken',    price: 4.000, emoji: '🍄', desc: 'Wall Street burger for chicken lovers — sauce, mushrooms, mixed cheese.',                           cal: 720, pop: false,feat: false, allergens: ['Gluten','Dairy'], ing: ['chicken patty','Wall Street sauce','mushrooms','mixed cheese'] },
    { cat: 'Chicken', name: 'Carthage Chicken',      price: 4.200, emoji: '🌿', desc: '200g fried chicken with Tunisian thyme sauce with coleslaw — crisp meets juicy.',                  cal: 760, pop: false,feat: false, allergens: ['Gluten','Dairy'], ing: ['fried chicken 200g','Tunisian thyme sauce','coleslaw'] },
    { cat: 'Chicken', name: 'Heisenberg',             price: 4.500, emoji: '🧪', desc: 'Grilled chicken strips, Wallstreet sauce, potatoes, corn and parmesan cheese.',                    cal: 680, pop: false,feat: false, allergens: ['Gluten','Dairy'], ing: ['grilled chicken strips','Wall Street sauce','potatoes','corn','parmesan'] },
    { cat: 'Chicken', name: 'Chicken Wings',          price: 3.500, emoji: '🍗', desc: 'Crispy chicken wings with your choice of dipping sauce.',                                          cal: 580, pop: false,feat: false, allergens: ['Gluten'],          ing: ['chicken wings','choice of sauce'] },
    { cat: 'Chicken', name: 'Chicken Cubes',          price: 3.200, emoji: '🍱', desc: 'Tender seasoned chicken cubes served hot.',                                                        cal: 480, pop: false,feat: false, allergens: ['Gluten'],          ing: ['chicken cubes','seasoning'] },
    // FRIES
    { cat: 'Fries',   name: 'French Fries',          price: 1.300, emoji: '🍟', desc: 'Classic crispy golden french fries.',                                                               cal: 360, pop: true, feat: false, allergens: [],                  ing: ['potatoes','sunflower oil','salt'] },
    { cat: 'Fries',   name: 'Curly Fries',            price: 1.800, emoji: '🌀', desc: 'Seasoned spiral curly fries — crispy and addictive.',                                               cal: 410, pop: true, feat: false, allergens: [],                  ing: ['spiral potatoes','paprika seasoning'] },
    { cat: 'Fries',   name: 'Wedges Fries',           price: 1.800, emoji: '🥔', desc: 'Chunky seasoned potato wedges.',                                                                   cal: 420, pop: false,feat: false, allergens: [],                  ing: ['potato wedges','seasoning'] },
    { cat: 'Fries',   name: 'Crazy 8',                price: 2.800, emoji: '🤪', desc: 'A crazy mix of 8 loaded fries toppings.',                                                          cal: 620, pop: false,feat: false, allergens: ['Dairy'],          ing: ['fries','8 loaded toppings','cheese sauce'] },
    { cat: 'Fries',   name: 'Chilli Cheese Fries',   price: 2.500, emoji: '🧀', desc: 'Fries loaded with chilli and melted cheese.',                                                       cal: 590, pop: false,feat: false, allergens: ['Dairy'],          ing: ['fries','chilli','melted cheese'] },
    // SIDES
    { cat: 'Sides',   name: 'Coleslaw',               price: 0.900, emoji: '🥗', desc: 'Creamy fresh coleslaw — classic recipe.',                                                          cal: 180, pop: false,feat: false, allergens: ['Dairy'],          ing: ['cabbage','carrots','mayo dressing'] },
    { cat: 'Sides',   name: 'Caesar Salad',           price: 2.500, emoji: '🥬', desc: 'Classic Caesar salad with croutons and parmesan.',                                                 cal: 280, pop: false,feat: false, allergens: ['Gluten','Dairy'], ing: ['romaine','caesar dressing','croutons','parmesan'] },
    { cat: 'Sides',   name: 'Chicken Caesar Salad',  price: 3.200, emoji: '🥗', desc: 'Caesar salad topped with grilled chicken breast.',                                                  cal: 420, pop: false,feat: false, allergens: ['Gluten','Dairy'], ing: ['romaine','grilled chicken','caesar dressing','croutons','parmesan'] },
    { cat: 'Sides',   name: 'Mozzarella Sticks',     price: 2.200, emoji: '🧀', desc: 'Golden fried mozzarella sticks with marinara dip.',                                                 cal: 380, pop: false,feat: false, allergens: ['Gluten','Dairy'], ing: ['mozzarella','breadcrumbs','marinara'] },
    { cat: 'Sides',   name: 'Healthy Meal',           price: 3.500, emoji: '🥦', desc: 'Fresh mushrooms, broccoli, grilled chicken breast, freshly shredded parmesan.',                   cal: 380, pop: false,feat: false, allergens: ['Dairy'],          ing: ['mushrooms','broccoli','grilled chicken','parmesan'] },
    { cat: 'Sides',   name: 'Hotdog Sandwich',        price: 2.500, emoji: '🌭', desc: 'Classic American-style hotdog sandwich.',                                                          cal: 480, pop: false,feat: false, allergens: ['Gluten','Dairy'], ing: ['hotdog','bun','mustard','ketchup'] },
    // KIDS
    { cat: 'Kids',    name: 'Chicken Kids Meal',      price: 2.800, emoji: '🐔', desc: 'Kid-friendly crispy chicken with small fries.',                                                    cal: 560, pop: false,feat: false, allergens: ['Gluten'],          ing: ['chicken','small fries'] },
    { cat: 'Kids',    name: 'Beef Kids Meal',         price: 2.800, emoji: '🍔', desc: 'Kid-sized beef patty with small fries.',                                                           cal: 580, pop: false,feat: false, allergens: ['Gluten','Dairy'], ing: ['beef patty','small fries','ketchup'] },
    // DRINKS
    { cat: 'Drinks',  name: 'Pepsi',                  price: 0.800, emoji: '🥤', desc: 'Cold Pepsi, 500ml.',                                                                               cal: 210, pop: true, feat: false, allergens: [],                  ing: ['carbonated water','sugar','caramel color'] },
    { cat: 'Drinks',  name: 'Sprite',                 price: 0.800, emoji: '🥤', desc: 'Cold Sprite, 500ml.',                                                                              cal: 200, pop: false,feat: false, allergens: [],                  ing: ['carbonated water','sugar','citric acid'] },
    { cat: 'Drinks',  name: 'Water',                  price: 0.500, emoji: '💧', desc: 'Still mineral water, 500ml.',                                                                      cal:   0, pop: false,feat: false, allergens: [],                  ing: ['water'] },
    // COMBOS
    { cat: 'Combos',  name: 'Firefly Combo',          price: 5.200, emoji: '🔥', desc: 'Firefly Burger + French Fries + Pepsi — the classic!',                                            cal:1370, pop: true, feat: true,  allergens: ['Gluten','Dairy'], ing: ['Firefly Burger','French Fries','Pepsi'] },
    { cat: 'Combos',  name: 'Angus Combo',            price: 6.800, emoji: '⭐', desc: 'Angus Burger + Curly Fries + Pepsi.',                                                              cal:1560, pop: true, feat: false, allergens: ['Gluten','Dairy'], ing: ['Angus Burger','Curly Fries','Pepsi'] },
    { cat: 'Combos',  name: 'Kamakazi Combo',         price: 6.500, emoji: '🌶️', desc: 'Kamakazi Burger + Wedge Fries + Pepsi — for the brave!',                                         cal:1870, pop: false,feat: false, allergens: ['Gluten','Dairy'], ing: ['Kamakazi Burger','Wedge Fries','Pepsi'] },
  ]

  let itemSort = 0
  for (const item of menuItems) {
    const cat = cats[item.cat]
    if (!cat) { console.warn(`Category not found: ${item.cat}`); continue }

    const existing = await prisma.menuItem.findFirst({
      where: { restaurantId: restaurant.id, name: item.name },
    })
    if (existing) continue

    await prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: cat.id,
        name: item.name,
        description: item.desc,
        price: item.price,
        emoji: item.emoji,
        calories: item.cal,
        isPopular: item.pop,
        isFeatured: item.feat,
        isAvailable: true,
        sortOrder: itemSort++,
        allergens: {
          create: item.allergens.map(a => ({
            allergen: { connect: { id: allergens[a]?.id ?? '' } },
          })).filter(a => a.allergen.connect.id),
        },
        ingredients: {
          create: item.ing.map(name => ({ name })),
        },
      },
    })
  }
  console.log(`✅ Menu: ${menuItems.length} items seeded`)

  // ── Tables ─────────────────────────────────────────────────────────────────
  for (let i = 1; i <= 20; i++) {
    await prisma.table.upsert({
      where: { restaurantId_number: { restaurantId: restaurant.id, number: i } },
      update: {},
      create: { restaurantId: restaurant.id, number: i, label: `Table ${i}` },
    })
  }
  console.log('✅ Tables: 20 tables created')

  console.log('\n🎉 Seed complete!')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Demo accounts (password: 123321admin):')
  console.log('  admin@talktable.demo    → ADMIN')
  console.log('  manager@firefly.demo   → MANAGER')
  console.log('  kitchen@firefly.demo   → KITCHEN')
  console.log('  waiter@firefly.demo    → WAITER')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('⚠️  Change demo passwords after first login!')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
