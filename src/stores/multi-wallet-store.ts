"use client";

import { create } from "zustand";
import { getWalletRegistry } from "@/lib/wallet/registry";
import { getSessionManager } from "@/lib/wallet/session-manager";
import { STELLAR_NETWORK } from "@/lib/constants";
import { fetchBalanceWithBackoff } from "@/lib/wallet/balance-cache";
import type {
  WalletAdapter,
  WalletId,
  WalletError,
  NetworkType,
} from "@/lib/wallet/types";

interface WalletEntry {
  adapter: WalletAdapter;
  publicKey: string;
  network: NetworkType;
  balance: { xlm: string; usdc: string } | null;
  lastConnected: number;
  error: WalletError | null;
  status: "connecting" | "connected" | "reconnecting" | "disconnected" | "error";
}

interface MultiWalletState {
  activeWalletId: WalletId | null;
  wallets: Record<WalletId, WalletEntry>;
  detectedWallets: Array<{
    id: WalletId;
    name: string;
    category: string;
    icon: string;
    installUrl: string;
    description: string;
    priority: number;
    status: "detected" | "not_detected";
  }>;
  isScanning: boolean;
  isInitializing: boolean;

  /* UI-only state */
  connectingWalletId: WalletId | null;
  isSelectorOpen: boolean;
  wc2QrExpiresAt?: number | null;

  /* Route-specific error isolation for enterprise-grade UX */
  loginError: string | null;
  registerError: string | null;

  /* Actions */
  scanWallets: () => void;
  connect: (walletId: WalletId) => Promise<void>;
  disconnect: (walletId: WalletId) => void;
  switchWallet: (walletId: WalletId) => void;
  refreshBalance: (walletId: WalletId) => Promise<void>;
  clearError: (walletId: WalletId) => void;
  init: () => Promise<void>;
  updateWalletStatus: (walletId: WalletId, status: WalletEntry["status"]) => void;
  signMessage: (message: string) => Promise<string>;
  setSelectorOpen: (open: boolean) => void;
  /* Route-specific error isolation for enterprise-grade UX */
  setLoginError: (error: string | null) => void;
  setRegisterError: (error: string | null) => void;
  clearLoginError: () => void;
  clearRegisterError: () => void;
}

/**
 * Deterministic next-active selection policy.
 *
 * When the active wallet is disconnected, the next active wallet is the
 * remaining wallet with the most recent `lastConnected` timestamp (i.e. the
 * most-recently-connected wallet, matching what the user most recently used).
 * Ties are broken by wallet id (ascending) so the selection never depends on
 * object key ordering and is stable across identical states.
 */
function pickNextActiveWallet(
  remaining: Record<WalletId, WalletEntry>
): WalletId | null {
  const ids = Object.keys(remaining) as WalletId[];
  if (ids.length === 0) return null;
  return ids.reduce<WalletId>((best, id) => {
    const bestEntry = remaining[best];
    const entry = remaining[id];
    if (entry.lastConnected > bestEntry.lastConnected) return id;
    if (entry.lastConnected === bestEntry.lastConnected) {
      return id < best ? id : best;
    }
    return best;
  }, ids[0]);
}

async function runConnectionProbes(
  sessions: Array<{ walletId: WalletId }>,
  probe: (walletId: WalletId) => Promise<void>,
  concurrency = 4
): Promise<void> {
  const queue = [...sessions]
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const session = queue.shift()
      if (session) {
        await probe(session.walletId)
      }
    }
  })
  await Promise.all(workers)
}

export const useMultiWalletStore = create<MultiWalletState>()((set, get) => ({
  activeWalletId: null,
  wallets: {},
  detectedWallets: [],
  isScanning: false,
  isInitializing: false,

  /* UI-only defaults */
  connectingWalletId: null,
  isSelectorOpen: false,

  /* Route-specific error isolation defaults */
  loginError: null,
  registerError: null,

  init: async () => {
    if (get().isInitializing) return;
    set({ isInitializing: true });

    try {
      const sessionManager = getSessionManager();
      const sessions = sessionManager.getAll();
      if (sessions.length > 0) {
        const active = sessionManager.getActive();
        const wallets: Record<string, WalletEntry> = {};
        for (const s of sessions) {
          const adapter = getWalletRegistry().getAdapter(s.walletId);
          if (adapter) {
            wallets[s.walletId] = {
              adapter,
              publicKey: s.publicKey,
              network: s.network,
              balance: null,
              lastConnected: s.lastConnected,
              error: null,
              status: "reconnecting",
            };
          }
        }
        const nextActiveId = active?.walletId ?? null;
        set({
          wallets,
          activeWalletId: nextActiveId,
        });

        await runConnectionProbes(sessions, async (walletId) => {
          const adapter = getWalletRegistry().getAdapter(walletId);
          if (!adapter) return;

          try {
            const connected = await adapter.isConnected();
            get().updateWalletStatus(
              walletId,
              connected ? "connected" : "disconnected"
            );
          } catch {
            get().updateWalletStatus(walletId, "disconnected");
          }
        });
      }

      await get().scanWallets();
    } finally {
      set({ isInitializing: false });
    }
  },

  scanWallets: async () => {
    set({ isScanning: true });
    const { initializeWalletAdapters } = await import("@/lib/wallet/adapters");
    await initializeWalletAdapters();
    const results = getWalletRegistry().detect();
    set({
      detectedWallets: results.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        icon: r.icon,
        installUrl: r.installUrl,
        description: r.description,
        priority: r.priority,
        status: r.status,
      })),
      isScanning: false,
    });
  },

  connect: async (walletId: WalletId) => {
    /* ── Duplicate-connect guard — ignore a double-click while this wallet is already connecting ── */
    if (get().wallets[walletId]?.status === "connecting") {
      return;
    }

    /* ── Offline guard ─────────────────────────────────────────── */
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const offlineError: WalletError = {
        adapter: walletId,
        code: "network_offline",
        message:
          "You appear to be offline. Please check your internet connection and try again.",
      };
      set((state) => {
        const existing = state.wallets[walletId];
        return {
          wallets: {
            ...state.wallets,
            [walletId]: existing
              ? { ...existing, status: "error" as const, error: offlineError }
              : {
                  adapter: null as unknown as WalletAdapter,
                  publicKey: "",
                  network: STELLAR_NETWORK as NetworkType,
                  balance: null,
                  lastConnected: Date.now(),
                  error: offlineError,
                  status: "error" as const,
                },
          },
          activeWalletId: state.activeWalletId,
        };
      });
      throw offlineError;
    }

    const adapter = getWalletRegistry().getAdapter(walletId);
    if (!adapter) return;

    set((state) => {
      const existing = state.wallets[walletId];
      return {
        wallets: {
          ...state.wallets,
          [walletId]: existing
            ? { ...existing, status: "connecting" as const, error: null }
            : {
                adapter,
                publicKey: "",
                network: STELLAR_NETWORK as NetworkType,
                balance: null,
                lastConnected: Date.now(),
                error: null,
                status: "connecting" as const,
              },
        },
        activeWalletId: walletId as WalletId,
        connectingWalletId: walletId,
      };
    });

    try {
      const { publicKey } = await adapter.connect();
      const network = await adapter.getNetwork();

      set((state) => {
        return {
          wallets: {
            ...state.wallets,
            [walletId]: {
              adapter,
              publicKey,
              network,
              balance: null,
              lastConnected: Date.now(),
              error: null,
              status: "connected" as const,
            },
          },
          activeWalletId: walletId,
        };
      });

      await getSessionManager().connect(adapter, publicKey);
    } catch (err: unknown) {
      const error: WalletError =
        err && typeof err === "object" && "code" in err
          ? (err as WalletError)
          : {
              adapter: walletId,
              code: "internal",
              message:
                err instanceof Error ? err.message : "Connection failed",
              cause: String(err),
            };

      set((state) => {
        const existing = state.wallets[walletId];
        return {
          wallets: {
            ...state.wallets,
            [walletId]: existing
              ? { ...existing, status: "error" as const, error }
              : {
                  adapter,
                  publicKey: "",
                  network: STELLAR_NETWORK as NetworkType,
                  balance: null,
                  lastConnected: Date.now(),
                  error,
                  status: "error" as const,
                },
          },
          activeWalletId: state.activeWalletId,
        };
      });
      throw error;
    } finally {
      set((state) =>
        state.connectingWalletId === walletId
          ? { connectingWalletId: null }
          : state
      );
    }
  },

  disconnect: (walletId: WalletId) => {
    getSessionManager().disconnect(walletId);
    set((state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [walletId]: _, ...remaining } = state.wallets;
      const nextActive =
        state.activeWalletId === walletId
          ? pickNextActiveWallet(remaining)
          : state.activeWalletId;
      return {
        wallets: remaining,
        activeWalletId: nextActive,
      };
    });
  },

  switchWallet: (walletId: WalletId) => {
    getSessionManager().switchTo(walletId);
    set({ activeWalletId: walletId });
  },

  refreshBalance: async (walletId: WalletId, forceRefresh = false) => {
    const entry = get().wallets[walletId];
    if (!entry || !entry.publicKey) return;
    try {
      const balance = await fetchBalanceWithBackoff(entry.publicKey, { forceRefresh });
      set((state) => {
        const existing = state.wallets[walletId];
        if (existing) {
          return {
            wallets: {
              ...state.wallets,
              [walletId]: { ...existing, balance },
            },
          };
        }
        return state;
      });
    } catch {
      // non-critical
    }
  },

  clearError: (walletId: WalletId) => {
    set((state) => {
      const existing = state.wallets[walletId];
      if (existing) {
        return {
          wallets: {
            ...state.wallets,
            [walletId]: {
              ...existing,
              error: null,
              status: "disconnected" as const,
            },
          },
          activeWalletId: state.activeWalletId,
        };
      }
      return state;
    });
  },

  updateWalletStatus: (walletId: WalletId, status: WalletEntry["status"]) => {
    set((state) => {
      const existing = state.wallets[walletId];
      if (existing) {
        return {
          wallets: {
            ...state.wallets,
            [walletId]: { ...existing, status },
          },
          activeWalletId: state.activeWalletId,
        };
      }
      return state;
    });
  },

  signMessage: async (message: string) => {
    const { activeWalletId, wallets } = get();
    const entry = activeWalletId ? wallets[activeWalletId] : undefined;
    if (!entry) throw new Error("No wallet connected");
    const result = await entry.adapter.signMessage(message);
    return result.signature;
  },

  setSelectorOpen: (open: boolean) => {
    set({ isSelectorOpen: open });
  },

  setLoginError: (loginError) => set({ loginError }),
  setRegisterError: (registerError) => set({ registerError }),
  clearLoginError: () => set({ loginError: null }),
  clearRegisterError: () => set({ registerError: null }),
}));
