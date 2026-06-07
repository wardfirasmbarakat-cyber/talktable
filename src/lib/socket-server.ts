// src/lib/socket-server.ts
// Socket.io server — initialized once, shared across API routes
// In production with multiple instances, use socket.io-redis adapter

import type { Server as HTTPServer } from 'http'
import type { Socket as NetSocket } from 'net'
import type { NextApiResponse } from 'next'
import { Server as SocketIOServer, type Socket } from 'socket.io'
import { verifyAccessToken } from './auth'
import { prisma } from './db'
import type { Role } from '@prisma/client'

interface SocketData {
  userId: string
  role: Role
  restaurantId: string | null
}

interface ServerToClientEvents {
  'order:new':    (data: unknown) => void
  'order:status': (data: unknown) => void
  'order:ready':  (data: unknown) => void
  'waiter:request': (data: unknown) => void
  'waiter:resolved': (data: unknown) => void
  'notification': (data: { title: string; body: string; type: string }) => void
  'ping':         () => void
}

interface ClientToServerEvents {
  'join:restaurant': (restaurantId: string) => void
  'join:table':      (tableToken: string) => void
  'pong':            () => void
}

declare global {
  var _io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData> | undefined
}

export type TalkTableSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>
export type TalkTableIO = SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>

export function getIO(): TalkTableIO | null {
  return global._io ?? null
}

export function initSocket(server: HTTPServer): TalkTableIO {
  if (global._io) return global._io

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(server, {
    path: '/api/socket',
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 30000,
    pingInterval: 25000,
  })

  // ── Auth middleware ──────────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    // Customers connect without auth (for order tracking)
    const token = socket.handshake.auth?.token as string | undefined
    if (!token) {
      // Anonymous customer connection — allowed
      socket.data.userId = 'anonymous'
      socket.data.role = 'WAITER' as Role // minimal role for type compat
      socket.data.restaurantId = null
      return next()
    }

    const payload = await verifyAccessToken(token)
    if (!payload) return next(new Error('Unauthorized'))

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, restaurantId: true, isActive: true },
    })
    if (!user || !user.isActive) return next(new Error('Unauthorized'))

    socket.data.userId = user.id
    socket.data.role = user.role
    socket.data.restaurantId = user.restaurantId
    next()
  })

  // ── Connection handler ───────────────────────────────────────────────────────
  io.on('connection', (socket: TalkTableSocket) => {
    const { userId, role, restaurantId } = socket.data
    console.log(`[Socket] Connected: ${userId} (${role}) — ${socket.id}`)

    // Staff auto-join their restaurant room
    if (restaurantId && userId !== 'anonymous') {
      socket.join(`restaurant:${restaurantId}`)
      socket.join(`restaurant:${restaurantId}:${role.toLowerCase()}`)
    }

    // Customer joins by table token
    socket.on('join:table', async (tableToken: string) => {
      try {
        const table = await prisma.table.findUnique({
          where: { qrToken: tableToken },
          select: { id: true, restaurantId: true, number: true },
        })
        if (table) {
          socket.join(`table:${table.id}`)
          socket.join(`restaurant:${table.restaurantId}`)
          socket.data.restaurantId = table.restaurantId
        }
      } catch (err) {
        console.error('[Socket] join:table error', err)
      }
    })

    // Staff join specific restaurant room (with auth token)
    socket.on('join:restaurant', (rid: string) => {
      if (restaurantId === rid || role === 'ADMIN') {
        socket.join(`restaurant:${rid}`)
      }
    })

    socket.on('disconnect', reason => {
      console.log(`[Socket] Disconnected: ${userId} — ${reason}`)
    })

    // Heartbeat
    const heartbeat = setInterval(() => socket.emit('ping'), 25000)
    socket.on('pong', () => { /* received */ })
    socket.on('disconnect', () => clearInterval(heartbeat))
  })

  global._io = io
  console.log('[Socket] Socket.io initialized')
  return io
}

// ── Emit helpers ─────────────────────────────────────────────────────────────
export function emitToRestaurant(restaurantId: string, event: keyof ServerToClientEvents, data: unknown): void {
  const io = getIO()
  if (!io) { console.warn('[Socket] IO not initialized — cannot emit', event); return }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  io.to(`restaurant:${restaurantId}`).emit(event as any, data)
}

export function emitToRole(restaurantId: string, role: string, event: keyof ServerToClientEvents, data: unknown): void {
  const io = getIO()
  if (!io) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  io.to(`restaurant:${restaurantId}:${role.toLowerCase()}`).emit(event as any, data)
}

export function emitToTable(tableId: string, event: keyof ServerToClientEvents, data: unknown): void {
  const io = getIO()
  if (!io) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  io.to(`table:${tableId}`).emit(event as any, data)
}
