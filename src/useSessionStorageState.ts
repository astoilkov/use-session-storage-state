import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

// in memory fallback used when `sessionStorage` throws an error
export const inMemoryData = new Map<string, unknown>()

export type SessionStorageOptions<T> = {
    defaultValue?: T | (() => T)
    storageSync?: boolean
    serializer?: {
        stringify: (value: unknown) => string
        parse: (value: string) => unknown
    }
}

// - `useSessionStorageState()` return type
// - first two values are the same as `useState`
export type SessionStorageState<T> = [
    T,
    Dispatch<SetStateAction<T>>,
    {
        isPersistent: boolean
        removeItem: () => void
    },
]

export default function useSessionStorageState(
    key: string,
    options?: SessionStorageOptions<undefined>,
): SessionStorageState<unknown>
export default function useSessionStorageState<T>(
    key: string,
    options?: Omit<SessionStorageOptions<T | undefined>, 'defaultValue'>,
): SessionStorageState<T | undefined>
export default function useSessionStorageState<T>(
    key: string,
    options?: SessionStorageOptions<T>,
): SessionStorageState<T>
export default function useSessionStorageState<T = undefined>(
    key: string,
    options?: SessionStorageOptions<T | undefined>,
): SessionStorageState<T | undefined> {
    const serializer = options?.serializer
    const [defaultValue] = useState(options?.defaultValue)
    return useBrowserSessionStorageState(
        key,
        defaultValue,
        options?.storageSync,
        serializer?.parse,
        serializer?.stringify,
    )
}

function useBrowserSessionStorageState<T>(
    key: string,
    defaultValue: T | undefined,
    storageSync: boolean = true,
    parse: (value: string) => unknown = parseJSON,
    stringify: (value: unknown) => string = JSON.stringify,
): SessionStorageState<T | undefined> {
    // we keep the `parsed` value in a ref because `useSyncExternalStore` requires a cached version
    const storageItem = useRef<{ string: string | null; parsed: T | undefined }>({
        string: null,
        parsed: undefined,
    })

    const value = useSyncExternalStore(
        // useSyncExternalStore.subscribe
        useCallback(
            (onStoreChange) => {
                const onChange = (sessionKey: string): void => {
                    if (key === sessionKey) {
                        onStoreChange()
                    }
                }
                callbacks.add(onChange)
                return (): void => {
                    callbacks.delete(onChange)
                }
            },
            [key],
        ),

        // useSyncExternalStore.getSnapshot
        () => {
            const string = goodTry(() => sessionStorage.getItem(key)) ?? null

            if (inMemoryData.has(key)) {
                storageItem.current.parsed = inMemoryData.get(key) as T | undefined
            } else if (string !== storageItem.current.string) {
                let parsed: T | undefined

                try {
                    parsed = string === null ? defaultValue : (parse(string) as T)
                } catch {
                    parsed = defaultValue
                }

                storageItem.current.parsed = parsed
            }

            storageItem.current.string = string

            // store default value in sessionStorage:
            // - initial issue: https://github.com/astoilkov/use-local-storage-state/issues/26
            //   issues that were caused by incorrect initial and secondary implementations:
            //   - https://github.com/astoilkov/use-local-storage-state/issues/30
            //   - https://github.com/astoilkov/use-local-storage-state/issues/33
            if (string === null && defaultValue !== undefined) {
                // reasons for `sessionStorage` to throw an error:
                // - maximum quota is exceeded
                // - under Mobile Safari (since iOS 5) when the user enters private mode
                //   `sessionStorage.setItem()` will throw
                // - trying to access sessionStorage object when cookies are disabled in Safari throws
                //   "SecurityError: The operation is insecure."
                // eslint-disable-next-line no-console
                goodTry(() => {
                    const string = stringify(defaultValue)
                    sessionStorage.setItem(key, string)
                    storageItem.current = { string, parsed: defaultValue }
                })
            }

            return storageItem.current.parsed
        },

        // useSyncExternalStore.getServerSnapshot
        () => defaultValue,
    )
    const setState = useCallback(
        (newValue: SetStateAction<T | undefined>): void => {
            const value =
                newValue instanceof Function ? newValue(storageItem.current.parsed) : newValue

            // reasons for `sessionStorage` to throw an error:
            // - maximum quota is exceeded
            // - under Mobile Safari (since iOS 5) when the user enters private mode
            //   `sessionStorage.setItem()` will throw
            // - trying to access `sessionStorage` object when cookies are disabled in Safari throws
            //   "SecurityError: The operation is insecure."
            try {
                sessionStorage.setItem(key, stringify(value))

                inMemoryData.delete(key)
            } catch {
                inMemoryData.set(key, value)
            }

            triggerCallbacks(key)
        },
        [key, stringify],
    )

    // - syncs change across tabs, windows, iframes
    // - the `storage` event is called only in all tabs, windows, iframe's except the one that
    //   triggered the change
    useEffect(() => {
        if (!storageSync) {
            return undefined
        }

        const onStorage = (e: StorageEvent): void => {
            if (e.storageArea === goodTry(() => sessionStorage) && e.key === key) {
                triggerCallbacks(key)
            }
        }

        window.addEventListener('storage', onStorage)

        return (): void => window.removeEventListener('storage', onStorage)
    }, [key, storageSync])

    return useMemo(
        () => [
            value,
            setState,
            {
                isPersistent: value === defaultValue || !inMemoryData.has(key),
                removeItem(): void {
                    goodTry(() => sessionStorage.removeItem(key))

                    inMemoryData.delete(key)

                    triggerCallbacks(key)
                },
            },
        ],
        [key, setState, value, defaultValue],
    )
}

// notifies all instances using the same `key` to update
const callbacks = new Set<(key: string) => void>()
function triggerCallbacks(key: string): void {
    for (const callback of [...callbacks]) {
        callback(key)
    }
}

// a wrapper for `JSON.parse()` that supports "undefined" value. otherwise,
// `JSON.parse(JSON.stringify(undefined))` returns the string "undefined" not the value `undefined`
function parseJSON(value: string): unknown {
    return value === 'undefined' ? undefined : JSON.parse(value)
}

function goodTry<T>(tryFn: () => T): T | undefined {
    try {
        return tryFn()
    } catch {}
}
