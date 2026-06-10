// src/app/api/analytics/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthFromCookies } from '@/lib/auth'

type Period = 'today' | 'week' | 'month' | 'year'

function getPeriodRange(period: Period, timezone = 'Asia/Amman'): { start: Date; end: Date } {
  // Get current time in the restaurant's timezone using Intl
  const now = new Date()

  // Get the current date components in the target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(now)
  const year   = parseInt(parts.find(p => p.type === 'year')!.value)
  const month  = parseInt(parts.find(p => p.type === 'month')!.value) - 1
  const day    = parseInt(parts.find(p => p.type === 'day')!.value)

  // Start of today in local timezone → convert to UTC
  const localMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0))
  // Offset correction: find UTC offset for this timezone
  const tzOffset = (now.getTime() - new Date(
    now.toLocaleString('en-US', { timeZone: timezone })
  ).getTime())

  const startOfDay = new Date(localMidnight.getTime() + tzOffset)

  let start: Date
  const end = new Date()

  switch (period) {
    case 'today':
      start = startOfDay
      break
    case 'week':
      start = new Date(startOfDay.getTime() - 6 * 24 * 60 * 60 * 1000)
      break
    case 'month':
      start = new Date(startOfDay.getTime() - 29 * 24 * 60 * 60 * 1000)
      break
    case 'year':
      start = new Date(startOfDay.getTime() - 364 * 24 * 60 * 60 * 1000)
      break
    default:
      start = startOfDay
  }

  return { start, end }
}

// ── GET /api/analytics ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const payload = await getAuthFromCookies()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const restaurantId = payload.restaurantId
  if (!restaurantId) return NextResponse.json({ error: 'No restaurant associated' }, { status: 400 })

  const { searchParams } = req.nextUrl
  const periodParam = searchParams.get('period') ?? 'today'
  const period: Period = ['today', 'week', 'month', 'year'].includes(periodParam)
    ? (periodParam as Period)
    : 'today'

  // Fetch restaurant timezone
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { timezone: true },
  })
  const timezone = restaurant?.timezone ?? 'Asia/Amman'

  const { start, end } = getPeriodRange(period, timezone)
  const dateFilter = { gte: start, lte: end }

  // Run all queries in parallel
  const [
    orderAggregates,
    ordersByStatus,
    completedOrders,
    tableStats,
    topItemsRaw,
    waiterRequestStats,
    feedbackStats,
    hourlyRevenue,
    dailyRevenue,
  ] = await Promise.all([
    // Revenue & order stats
    prisma.order.aggregate({
      where: { restaurantId, placedAt: dateFilter },
      _sum: { total: true },
      _count: { id: true },
      _avg: { total: true },
    }),

    // Orders by status
    prisma.order.groupBy({
      by: ['status'],
      where: { restaurantId, placedAt: dateFilter },
      _count: { id: true },
    }),

    // Completed & cancelled counts
    prisma.order.count({
      where: { restaurantId, placedAt: dateFilter, status: 'COMPLETED' },
    }),

    // Table stats
    prisma.table.aggregate({
      where: { restaurantId },
      _count: { id: true },
    }),

    // Top items — raw order items grouped
    prisma.orderItem.groupBy({
      by: ['menuItemId', 'name'],
      where: {
        order: { restaurantId, placedAt: dateFilter, status: { notIn: ['CANCELLED'] } },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    }),

    // Waiter request stats
    prisma.waiterRequest.findMany({
      where: { restaurantId, createdAt: dateFilter },
      select: { status: true, createdAt: true, resolvedAt: true },
    }),

    // Feedback averages
    prisma.feedback.aggregate({
      where: { restaurantId, createdAt: dateFilter },
      _avg: { foodRating: true, serviceRating: true, atmosphereRating: true },
      _count: { id: true },
    }),

    // Hourly revenue (for today/week)
    period === 'today' || period === 'week'
      ? prisma.$queryRaw<Array<{ hour: number; total: number }>>`
          SELECT EXTRACT(HOUR FROM "placedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::int AS hour,
                 SUM(total)::float AS total
          FROM "Order"
          WHERE "restaurantId" = ${restaurantId}
            AND "placedAt" >= ${start}
            AND "placedAt" <= ${end}
            AND status != 'CANCELLED'
          GROUP BY hour
          ORDER BY hour
        `
      : Promise.resolve(null),

    // Daily revenue (for week/month/year)
    period === 'week' || period === 'month' || period === 'year'
      ? prisma.$queryRaw<Array<{ date: string; total: number }>>`
          SELECT TO_CHAR("placedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS date,
                 SUM(total)::float AS total
          FROM "Order"
          WHERE "restaurantId" = ${restaurantId}
            AND "placedAt" >= ${start}
            AND "placedAt" <= ${end}
            AND status != 'CANCELLED'
          GROUP BY date
          ORDER BY date
        `
      : Promise.resolve(null),
  ])

  // Process waiter request response time
  const resolvedRequests = waiterRequestStats.filter(r => r.status === 'RESOLVED' && r.resolvedAt)
  const avgResponseMinutes = resolvedRequests.length > 0
    ? resolvedRequests.reduce((sum, r) => {
        const mins = (r.resolvedAt!.getTime() - r.createdAt.getTime()) / 60000
        return sum + mins
      }, 0) / resolvedRequests.length
    : null

  // Build byStatus map
  const byStatus: Record<string, number> = {}
  for (const row of ordersByStatus) {
    byStatus[row.status] = row._count.id
  }

  // Cancelled count
  const cancelledCount = byStatus['CANCELLED'] ?? 0

  // Active tables
  const activeTables = await prisma.table.count({ where: { restaurantId, isActive: true } })

  // Peak hour from hourly data
  let peakHour: number | null = null
  if (hourlyRevenue && Array.isArray(hourlyRevenue) && hourlyRevenue.length > 0) {
    const peak = hourlyRevenue.reduce((max, cur) => cur.total > max.total ? cur : max)
    peakHour = peak.hour
  }

  return NextResponse.json({
    period,
    dateRange: { start, end },
    revenue: {
      total: Number(orderAggregates._sum.total ?? 0),
      byHour: hourlyRevenue ?? undefined,
      byDay: dailyRevenue ?? undefined,
    },
    orders: {
      total: orderAggregates._count.id,
      completed: completedOrders,
      cancelled: cancelledCount,
      avgValue: Number(orderAggregates._avg.total ?? 0),
      byStatus,
    },
    tables: {
      total: tableStats._count.id,
      active: activeTables,
    },
    topItems: topItemsRaw.map(item => ({
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: item._sum?.quantity ?? 0,
      revenue: Number(item._sum?.subtotal ?? 0),
    })),
    waiterRequests: {
      total: waiterRequestStats.length,
      resolved: resolvedRequests.length,
      avgResponseMinutes: avgResponseMinutes !== null ? Math.round(avgResponseMinutes) : null,
    },
    feedback: feedbackStats._count.id > 0 ? {
      avgFood: Number((feedbackStats._avg.foodRating ?? 0).toFixed(2)),
      avgService: Number((feedbackStats._avg.serviceRating ?? 0).toFixed(2)),
      avgAtmosphere: Number((feedbackStats._avg.atmosphereRating ?? 0).toFixed(2)),
      total: feedbackStats._count.id,
    } : null,
    peakHour,
  })
}
