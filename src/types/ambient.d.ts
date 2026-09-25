/**
 * Ambient type declarations for optional / code-split dependencies.
 *
 * These packages are loaded via dynamic import() at runtime and may
 * not be installed in every environment. Declaring them here allows
 * TypeScript compilation to succeed while preserving the runtime
 * lazy-loading pattern.
 *
 * Packages covered:
 *   @noble/*        — ed25519 signing & HKDF key derivation (passkey adapter)
 *   @ledgerhq/*     — Ledger hardware wallet transport & Stellar app
 *   @walletconnect/*— WalletConnect v2 QR-based mobile wallet
 */

declare module "@noble/hashes/hkdf.js" {
  export function hkdf(
    hash: (data: Uint8Array) => Uint8Array,
    ikm: Uint8Array,
    salt: Uint8Array,
    info: Uint8Array,
    length: number,
  ): Uint8Array
}

declare module "@noble/hashes/sha2.js" {
  export function sha256(data: Uint8Array): Uint8Array
}

declare module "@noble/ed25519" {
  export function signAsync(
    message: Uint8Array,
    secretKey: Uint8Array,
  ): Promise<Uint8Array>

  export function getPublicKeyAsync(
    secretKey: Uint8Array,
  ): Promise<Uint8Array>
}

declare module "@ledgerhq/hw-transport-webusb" {
  export interface LedgerTransport {
    close(): Promise<void>
  }

  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  class TransportWebUSB {
    static create(): Promise<LedgerTransport>
  }

  export default TransportWebUSB
}

declare module "@ledgerhq/hw-transport-web-ble" {
  export interface LedgerTransport {
    close(): Promise<void>
  }

  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  class TransportWebBLE {
    static create(): Promise<LedgerTransport>
  }

  export default TransportWebBLE
}

declare module "@ledgerhq/hw-app-str" {
  interface LedgerTransport {
    close(): Promise<void>
  }

  class Str {
    constructor(transport: LedgerTransport)
    sign(
      derivationPath: string,
      data: Uint8Array,
    ): Promise<{ signature: Uint8Array }>
    signTransaction(
      derivationPath: string,
      xdr: string,
    ): Promise<{ signature: Uint8Array }>
  }

  export default Str
}

declare module "@walletconnect/sign-client" {
  export class SignClient {
    static init(opts: Record<string, unknown>): Promise<SignClient>
    on(event: string, handler: (...args: unknown[]) => void): void
    connect(opts: Record<string, unknown>): Promise<{
      uri?: string
      approval(): Promise<unknown>
    }>
    disconnect(opts: Record<string, unknown>): Promise<void>
    session: {
      namespaces: Record<string, { accounts: string[] }>
    }
  }
}

declare module "@axe-core/playwright" {
  export default class AxeBuilder {
    constructor(args: { page: unknown })
    withTags(tags: string[]): this
    analyze(): Promise<{ violations: unknown[] }>
  }
}

declare module "@storybook/react" {
  export type Meta<T = any> = any
  export type StoryObj<T = any> = {
    render?: (args: any) => any
    args?: Record<string, any>
    [key: string]: any
  }
}

declare module "react-hook-form" {
  export type FieldValues = Record<string, any>
  export type FieldError = { type: string; message?: string }
  export type Resolver<TFieldValues extends FieldValues = FieldValues, TContext = any> = (
    values: any,
    context?: TContext,
    options?: any,
  ) => Promise<{ values: any; errors: Record<string, any> }> | { values: any; errors: Record<string, any> }
  export interface UseFormRegisterReturn {
    name: string
    onChange: (e: any) => Promise<boolean | void>
    onBlur: (e: any) => Promise<boolean | void>
    ref: (instance: any) => void
  }
  export type UseFormRegister<TFieldValues extends FieldValues> = (
    name: any,
    options?: any,
  ) => UseFormRegisterReturn
  export type UseFormHandleSubmit<TFieldValues extends FieldValues> = (
    onValid: (data: TFieldValues, event?: any) => unknown,
    onInvalid?: (errors: any, event?: any) => unknown,
  ) => (e?: any) => Promise<void>
  export interface UseFormReturn<TFieldValues extends FieldValues = FieldValues, TContext = any> {
    register: UseFormRegister<TFieldValues>
    handleSubmit: UseFormHandleSubmit<TFieldValues>
    formState: {
      errors: Record<string, any>
      isSubmitting: boolean
      isValid: boolean
      [key: string]: any
    }
    reset: (values?: any) => void
    setValue: (name: any, value: any, options?: any) => void
    getValues: (name?: any) => any
    watch: (name?: any, defaultValue?: any) => any
    [key: string]: any
  }
  export function useForm<TFieldValues extends FieldValues = FieldValues, TContext = any>(
    options?: any,
  ): UseFormReturn<TFieldValues, TContext>
}



