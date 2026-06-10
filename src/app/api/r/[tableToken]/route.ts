// src/app/api/r/[tableToken]/route.ts
// Public endpoint — no auth required (customer-facing)
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { tableToken: string } }
) {
  const { tableToken } = params

  const table = await prisma.table.findUnique({
    where: { qrToken: tableToken },
    include: {
      restaurant: {
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          currency: true,
          isActive: true,
          categories: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              name: true,
              nameAr: true,
              emoji: true,
              sortOrder: true,
              menuItems: {
                where: { isAvailable: true },
                orderBy: { sortOrder: 'asc' },
                select: {
                  id: true,
                  name: true,
                  nameAr: true,
                  description: true,
                  descriptionAr: true,
                  price: true,
                  imageUrl: true,
                  emoji: true,
                  calories: true,
                  isFeatured: true,
                  isPopular: true,
                  allergens: {
                    select: {
                      allergen: {
                        select: { id: true, name: true, emoji: true },
                      },
                    },
                  },
                  ingredients: {
                    select: { id: true, name: true, nameAr: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!table || !table.isActive) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 })
  }

  const { restaurant } = table

  return NextResponse.json({
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      logoUrl: restaurant.logoUrl,
      currency: restaurant.currency,
      isActive: restaurant.isActive,
    },
    table: {
      id: table.id,
      number: table.number,
      label: table.label,
    },
    categories: restaurant.categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      nameAr: cat.nameAr,
      emoji: cat.emoji,
      sortOrder: cat.sortOrder,
      menuItems: cat.menuItems.map(item => ({
        id: item.id,
        name: item.name,
        nameAr: item.nameAr,
        description: item.description,
        descriptionAr: item.descriptionAr,
        price: Number(item.price),
        imageUrl: item.imageUrl,
        emoji: item.emoji,
        calories: item.calories,
        isFeatured: item.isFeatured,
        isPopular: item.isPopular,
        categoryId: cat.id,
        allergens: item.allergens.map(a => a.allergen),
        ingredients: item.ingredients,
      })),
    })),
  })
}
