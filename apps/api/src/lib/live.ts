// In-memory SSE hub for live match views. The API runs as a single instance,
// so a plain Map of open streams per match is all the "broker" we need.
// Writers call publishMatchUpdate() after any mutation; every open viewer
// stream gets a ping and the client refetches the match.

const encoder = new TextEncoder()
const channels = new Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>()

export function publishMatchUpdate(matchId: string) {
  const subs = channels.get(matchId)
  if (!subs) return
  for (const controller of subs) {
    try {
      controller.enqueue(encoder.encode('data: update\n\n'))
    } catch {
      subs.delete(controller) // client vanished without cancel()
    }
  }
}

// A never-ending text/event-stream response. Heartbeat comments every 25s keep
// proxies from timing out the idle connection (nginx default read timeout is
// 60s). Cleanup runs on client disconnect so listeners never leak.
export function matchLiveStream(matchId: string): Response {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null

  const cleanup = () => {
    if (heartbeat) clearInterval(heartbeat)
    heartbeat = null
    if (controller) {
      const subs = channels.get(matchId)
      subs?.delete(controller)
      if (subs && subs.size === 0) channels.delete(matchId)
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
      let subs = channels.get(matchId)
      if (!subs) channels.set(matchId, (subs = new Set()))
      subs.add(c)
      // First event flushes headers immediately and doubles as a "catch up"
      // signal — the client refetches on every message, including this one.
      c.enqueue(encoder.encode('data: connected\n\n'))
      heartbeat = setInterval(() => {
        try {
          c.enqueue(encoder.encode(': ping\n\n'))
        } catch {
          cleanup()
        }
      }, 25_000)
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      // Tells nginx not to buffer this response — else events never arrive.
      'x-accel-buffering': 'no',
    },
  })
}
