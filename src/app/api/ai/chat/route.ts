// src/app/api/ai/chat/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { rateLimit, getClientIp } from '@/lib/security'

const AI_CHAT_RATE_LIMIT = { windowMs: 60 * 1000, max: 30 }

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
})

const ChatSchema = z.object({
  tableToken: z.string().min(1),
  messages: z.array(MessageSchema).min(1).max(50),
  language: z.enum(['en', 'ar']).optional().default('en'),
})

// ── POST /api/ai/chat ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const rl = rateLimit(`ai-chat:${ip}`, AI_CHAT_RATE_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = ChatSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }, { status: 422 })
  }

  const { tableToken, messages, language } = parsed.data

  // 1. Look up table + restaurant
  const table = await prisma.table.findUnique({
    where: { qrToken: tableToken },
    include: {
      restaurant: {
        include: { settings: true },
      },
    },
  })

  if (!table || !table.isActive) {
    return NextResponse.json({ error: 'Invalid table token' }, { status: 404 })
  }

  const { restaurant } = table
  const settings = restaurant.settings

  // 2. Load menu items
  const menuItems = await prisma.menuItem.findMany({
    where: { restaurantId: restaurant.id, isAvailable: true },
    include: {
      category: { select: { name: true, nameAr: true } },
      allergens: { include: { allergen: { select: { name: true } } } },
    },
    orderBy: [{ sortOrder: 'asc' }],
  })

  // 3. Load knowledge items
  const knowledgeItems = await prisma.knowledgeItem.findMany({
    where: { restaurantId: restaurant.id, isActive: true },
    orderBy: [{ category: 'asc' }],
  })

  // 4. Build system prompt
  const menuText = menuItems.map(item => {
    const allergenNames = item.allergens.map(a => a.allergen.name).join(', ')
    return [
      `- ${item.emoji ?? ''} ${item.name}${item.nameAr ? ` (${item.nameAr})` : ''}`,
      `  Category: ${item.category.name}`,
      `  Price: ${item.price} ${restaurant.currency}`,
      item.description ? `  Description: ${item.description}` : '',
      item.calories ? `  Calories: ${item.calories}` : '',
      allergenNames ? `  Allergens: ${allergenNames}` : '',
      item.isFeatured ? '  ⭐ Featured' : '',
      item.isPopular ? '  🔥 Popular' : '',
    ].filter(Boolean).join('\n')
  }).join('\n\n')

  const knowledgeText = knowledgeItems.map(item =>
    `[${item.category}] ${item.title}\n${item.content}`
  ).join('\n\n---\n\n')

  const isArabic = language === 'ar'

  const systemPrompt = [
    settings?.aiSystemPrompt ?? (
      isArabic
        ? `أنت مساعد ذكي ودود لمطعم "${restaurant.name}". مهمتك مساعدة الضيوف في الاطلاع على قائمة الطعام والإجابة على أسئلتهم وتقديم توصيات رائعة. كن ودوداً واحترافياً وسريعاً.`
        : `You are a friendly and knowledgeable AI assistant for ${restaurant.name}. Your job is to help guests explore the menu, answer their questions, and make great recommendations. Be warm, professional, and concise.`
    ),
    '',
    `Restaurant: ${restaurant.name}`,
    restaurant.address ? `Address: ${restaurant.address}` : '',
    restaurant.phone ? `Phone: ${restaurant.phone}` : '',
    `Currency: ${restaurant.currency}`,
    `Table: ${table.number}${table.label ? ` (${table.label})` : ''}`,
    '',
    '## MENU',
    menuText || 'Menu information not available.',
    '',
    knowledgeItems.length > 0 ? '## RESTAURANT INFORMATION\n' + knowledgeText : '',
    '',
    isArabic
      ? 'تعليمات: أجب دائماً باللغة العربية. إذا سألك الضيف عن طبق غير متوفر، اقترح بديلاً. لا تخترع أسعاراً أو أطباقاً غير موجودة في القائمة.'
      : 'Instructions: Always respond in English. If a guest asks about an item not on the menu, suggest similar available alternatives. Never make up prices or items not in the menu. If asked to place an order, let them know they can use the order section of the app.',
  ].filter(v => v !== null && v !== undefined).join('\n')

  // 5. Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    const fallback = isArabic
      ? `مرحباً بك في ${restaurant.name}! للأسف، خدمة المساعد الذكي غير متاحة حالياً. يمكنك الاطلاع على القائمة مباشرة أو طلب المساعدة من أحد موظفينا.`
      : `Welcome to ${restaurant.name}! Our AI assistant is temporarily unavailable. Please browse the menu directly or ask one of our staff members for assistance. We're happy to help!`
    return NextResponse.json({ message: fallback })
  }

  // 6. Call Anthropic API
  const model = settings?.aiModel ?? 'claude-haiku-4-5-20251001'
  const anthropicMessages = messages.slice(-10)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: anthropicMessages,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    console.error('[AI Chat] Anthropic API error:', response.status, errText)
    const fallback = isArabic
      ? 'عذراً، حدث خطأ مؤقت. يرجى المحاولة مرة أخرى.'
      : 'Sorry, I encountered a temporary issue. Please try again in a moment.'
    return NextResponse.json({ message: fallback }, { status: 200 })
  }

  const data = await response.json()
  const message = data.content?.[0]?.text ?? (isArabic ? 'عذراً، لم أفهم طلبك.' : 'Sorry, I could not generate a response.')

  return NextResponse.json({ message })
}
