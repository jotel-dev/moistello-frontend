"use client"

import type { ReactNode } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"

export function PageLoading({ label = "Loading…", children }: { label?: string; children?: ReactNode }) {
  return <div role="status" aria-busy="true" aria-live="polite">{children ?? <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{label}</div>}</div>
}

export function PageError({ title = "Unable to load this page", description = "Something went wrong. Please try again.", message, onRetry }: { title?: string; description?: string; message?: string; onRetry?: () => void }) {
  return <div role="alert" aria-live="assertive"><EmptyState icon={<AlertCircle className="h-6 w-6" />} title={title} description={message ?? description} action={onRetry ? { label: "Retry", onClick: onRetry } : undefined} /></div>
}

export function PageState({ isLoading, isError, onRetry, isEmpty, empty, children }: { isLoading: boolean; isError: boolean; onRetry?: () => void; isEmpty: boolean; empty: ReactNode; children: ReactNode }) {
  if (isLoading) return <PageLoading />
  if (isError) return <PageError onRetry={onRetry} />
  if (isEmpty) return <>{empty}</>
  return <>{children}</>
}
