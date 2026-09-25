export interface TxItem {
  id: string
  type: "sent" | "received"
  amount: number
  description: string
  createdAt: string
  txnHash?: string
  source: "contribution" | "payout"
  status?: "completed" | "pending" | "failed"
}

export interface FilterOptions {
  type?: string
  source?: string
  dateRange?: string
  minAmount?: string
  maxAmount?: string
  search?: string
  status?: string
}

export function filterTransactions(
  txns: TxItem[],
  filters: FilterOptions,
  nowDate: Date = new Date(),
): TxItem[] {
  return txns
    .filter((tx) => {
      // Search query
      if (filters.search?.trim()) {
        const q = filters.search.toLowerCase()
        const matchesId = tx.id.toLowerCase().includes(q)
        const matchesDesc = tx.description.toLowerCase().includes(q)
        const matchesHash = tx.txnHash?.toLowerCase().includes(q) ?? false
        if (!matchesId && !matchesDesc && !matchesHash) return false
      }

      // Type filter
      if (filters.type && filters.type !== "all" && tx.type !== filters.type) return false

      // Source filter
      if (filters.source && filters.source !== "all" && tx.source !== filters.source) return false

      // Status filter
      if (filters.status && filters.status !== "all" && (tx.status ?? "completed") !== filters.status) return false

      // Amount filters
      if (filters.minAmount !== "" && filters.minAmount !== undefined && !isNaN(Number(filters.minAmount)) && tx.amount < Number(filters.minAmount)) return false
      if (filters.maxAmount !== "" && filters.maxAmount !== undefined && !isNaN(Number(filters.maxAmount)) && tx.amount > Number(filters.maxAmount)) return false

      // Date filters
      const dateRange = filters.dateRange
      if (dateRange && dateRange !== "all") {
        const txDate = new Date(tx.createdAt).getTime()
        const now = nowDate.getTime()
        const diffDays = (now - txDate) / (1000 * 60 * 60 * 24)
        if (dateRange === "7d" && diffDays > 7) return false
        if (dateRange === "30d" && diffDays > 30) return false
        if (dateRange === "90d" && diffDays > 90) return false
      }

      return true
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}
