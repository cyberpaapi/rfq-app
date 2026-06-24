// Ordered, concurrency-limited async map.
//
// Runs `worker(item, i)` over every item but keeps at most `limit` promises
// in flight at once, and returns results in the SAME order as the input —
// regardless of which task finishes first. The shared `next` cursor is the
// "lock": because JS runs this loop body to completion between awaits, only
// one runner ever claims a given index, so no page is processed twice and the
// output slots line up with the original page order when we stitch back.
export async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const size = Math.max(1, Math.min(limit, items.length))
  const runners = Array.from({ length: size }, async () => {
    // Claim-and-run until the queue is drained.
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await worker(items[i], i)
    }
  })
  await Promise.all(runners)
  return results
}
