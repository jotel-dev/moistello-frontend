import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  fetchBalanceWithBackoff,
  clearBalanceCache,
  getCachedBalance,
  getCircuitState,
  CIRCUIT_BREAKER_THRESHOLD,
  CIRCUIT_BREAKER_RESET_MS,
  MAX_RETRIES_CAP,
  BALANCE_CACHE_TTL_MS,
} from "../balance-cache"

const ADDR = "GBAXK6G4Q2E5N4JL3Q53PZ4Z3YJ5G2Y3K6G4Q2E5N4JL3Q53PZ4Z3YJ5"
const ADDR2 = "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGERWIZ2VED4NI1KQKGPGN"

function okResponse(body: object) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

function mockOkResponse(body: object) {
  return () => Promise.resolve(okResponse(body))
}

function _errResponse(status: number) {
  return new Response("error", { status })
}

beforeEach(() => {
  clearBalanceCache()
  vi.restoreAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── Single-flight ────────────────────────────────────────────────────────────

describe("single-flight dedup", () => {
  it("concurrent calls for same address share one fetch", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(mockOkResponse({ xlm: "10", usdc: "5" }))

    const promises = Promise.all([
      fetchBalanceWithBackoff(ADDR, { initialDelayMs: 1 }),
      fetchBalanceWithBackoff(ADDR, { initialDelayMs: 1 }),
      fetchBalanceWithBackoff(ADDR, { initialDelayMs: 1 }),
    ])
    await vi.runAllTimersAsync()
    const [a, b, c] = await promises

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(a).toEqual({ xlm: "10", usdc: "5" })
    expect(a).toEqual(b)
    expect(b).toEqual(c)
  })

  it("different addresses each get their own fetch", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(mockOkResponse({ xlm: "1", usdc: "1" }))

    const promises = Promise.all([
      fetchBalanceWithBackoff(ADDR, { initialDelayMs: 1 }),
      fetchBalanceWithBackoff(ADDR2, { initialDelayMs: 1 }),
    ])
    await vi.runAllTimersAsync()
    await promises

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("forceRefresh bypasses dedup and fires a new request", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(mockOkResponse({ xlm: "1", usdc: "1" }))

    const p1 = fetchBalanceWithBackoff(ADDR, { initialDelayMs: 1 })
    const p2 = fetchBalanceWithBackoff(ADDR, { forceRefresh: true, initialDelayMs: 1 })
    await vi.runAllTimersAsync()
    await Promise.all([p1, p2])

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})

// ─── Circuit breaker ──────────────────────────────────────────────────────────

describe("circuit breaker", () => {
  it("opens after CIRCUIT_BREAKER_THRESHOLD consecutive failures", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fail"))

    for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD; i++) {
      await expect(
        fetchBalanceWithBackoff(ADDR, { maxRetries: 0, initialDelayMs: 1 }),
      ).rejects.toThrow()
    }

    const state = getCircuitState(ADDR)
    expect(state.openedAt).not.toBeNull()
    expect(state.failures).toBeGreaterThanOrEqual(CIRCUIT_BREAKER_THRESHOLD)
  })

  it("returns stale cache when circuit is open", async () => {
    // Seed a successful cache entry first
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      okResponse({ xlm: "77", usdc: "11" }),
    )
    const p0 = fetchBalanceWithBackoff(ADDR, { forceRefresh: true, initialDelayMs: 1 })
    await vi.runAllTimersAsync()
    await p0
    expect(getCachedBalance(ADDR)?.data).toEqual({ xlm: "77", usdc: "11" })

    // Now open the circuit by hammering failures
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fail"))
    for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD; i++) {
      await expect(
        fetchBalanceWithBackoff(ADDR, { forceRefresh: true, maxRetries: 0, initialDelayMs: 1 }),
      ).rejects.toThrow()
    }

    expect(getCircuitState(ADDR).openedAt).not.toBeNull()

    // Circuit is open — next call should return stale cache without fetching
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const result = await fetchBalanceWithBackoff(ADDR)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result).toEqual({ xlm: "77", usdc: "11" })
  })

  it("throws when circuit is open and no stale cache exists", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fail"))

    for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD; i++) {
      await expect(
        fetchBalanceWithBackoff(ADDR, { maxRetries: 0, initialDelayMs: 1 }),
      ).rejects.toThrow()
    }

    expect(getCircuitState(ADDR).openedAt).not.toBeNull()
    await expect(fetchBalanceWithBackoff(ADDR, { forceRefresh: true })).rejects.toThrow(/Circuit open/)
  })

  it("half-opens after CIRCUIT_BREAKER_RESET_MS and allows a probe", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fail"))

    for (let i = 0; i < CIRCUIT_BREAKER_THRESHOLD; i++) {
      await expect(
        fetchBalanceWithBackoff(ADDR, { maxRetries: 0, initialDelayMs: 1 }),
      ).rejects.toThrow()
    }

    // Advance past reset window
    vi.advanceTimersByTime(CIRCUIT_BREAKER_RESET_MS + 1)

    // Next call after reset should probe — mock it as success
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(okResponse({ xlm: "5", usdc: "2" }))
    const p = fetchBalanceWithBackoff(ADDR, { forceRefresh: true, initialDelayMs: 1 })
    await vi.runAllTimersAsync()
    const result = await p
    expect(result).toEqual({ xlm: "5", usdc: "2" })
    expect(getCircuitState(ADDR).openedAt).toBeNull()
  })
})

// ─── Bounded retries ──────────────────────────────────────────────────────────

describe("MAX_RETRIES_CAP", () => {
  it("caps retries to MAX_RETRIES_CAP even if higher value is passed", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fail"))

    const p = fetchBalanceWithBackoff(ADDR, { maxRetries: 100, initialDelayMs: 1 }).catch(() => {})
    for (let i = 0; i <= MAX_RETRIES_CAP + 2; i++) {
      await vi.advanceTimersByTimeAsync(10000)
    }
    await p

    // Attempts = 0..MAX_RETRIES_CAP = MAX_RETRIES_CAP + 1 calls max
    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(MAX_RETRIES_CAP + 1)
  })
})

// ─── Jitter ───────────────────────────────────────────────────────────────────

describe("jitter", () => {
  it("delayWithJitter produces a delay within ±20% of the requested ms", async () => {
    const { delayWithJitter } = await import("../balance-cache")
    const ms = 1000
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout")
    delayWithJitter(ms)
    const actualMs = setTimeoutSpy.mock.calls[0]?.[1] as number
    expect(actualMs).toBeGreaterThanOrEqual(ms * 0.8)
    expect(actualMs).toBeLessThanOrEqual(ms * 1.2)
  })
})

// ─── Cache TTL ────────────────────────────────────────────────────────────────

describe("cache TTL", () => {
  it("returns cached value within TTL without calling fetch again", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(mockOkResponse({ xlm: "100", usdc: "50" }))

    const p1 = fetchBalanceWithBackoff(ADDR)
    await vi.runAllTimersAsync()
    await p1

    const result2 = await fetchBalanceWithBackoff(ADDR)
    expect(result2).toEqual({ xlm: "100", usdc: "50" })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("re-fetches after TTL expires", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(mockOkResponse({ xlm: "100", usdc: "50" }))

    const p1 = fetchBalanceWithBackoff(ADDR)
    await vi.runAllTimersAsync()
    await p1

    // Advance past TTL
    vi.advanceTimersByTime(BALANCE_CACHE_TTL_MS + 1)

    const p2 = fetchBalanceWithBackoff(ADDR)
    await vi.runAllTimersAsync()
    await p2

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
