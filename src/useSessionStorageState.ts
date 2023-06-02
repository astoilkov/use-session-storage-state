import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

// in memory fallback used then `sessionStorage` throws an error
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
    options?: Omit<SessionStorageOptions<unknown>, 'defaultValue'>,
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
    const [defaultValue] = useState(options?.defaultValue)

    // SSR support
    // - on the server, return a constant value
    // - this makes the implementation simpler and smaller because the `sessionStorage` object is
    //   `undefined` on the server
    if (typeof window === 'undefined') {
        return [
            defaultValue,
            (): void => {},
            {
                isPersistent: true,
                removeItem: (): void => {},
            },
        ]
    }

    const serializer = options?.serializer
    // disabling ESLint because the above if statement can be executed only on the server. the value
    // of `window` can't change between calls.
    // eslint-disable-next-line react-hooks/rules-of-hooks
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
    // store default value in sessionStorage:
    // - initial issue: https://github.com/astoilkov/use-local-storage-state/issues/26
    //   issues that were caused by incorrect initial and secondary implementations:
    //   - https://github.com/astoilkov/use-local-storage-state/issues/30
    //   - https://github.com/astoilkov/use-local-storage-state/issues/33
    if (
        !inMemoryData.has(key) &&
        defaultValue !== undefined &&
        goodTry(() => sessionStorage.getItem(key)) === null
    ) {
        // reasons for `sessionStorage` to throw an error:
        // - maximum quota is exceeded
        // - under Mobile Safari (since iOS 5) when the user enters private mode
        //   `sessionStorage.setItem()` will throw
        // - trying to access sessionStorage object when cookies are disabled in Safari throws
        //   "SecurityError: The operation is insecure."
        goodTry(() => sessionStorage.setItem(key, stringify(defaultValue)))
    }

    // we keep the `parsed` value in a ref because `useSyncExternalStore` requires a cached version
    const storageValue = useRef<{ item: string | null; parsed: T | undefined }>({
        item: null,
        parsed: defaultValue,
    })
    const value = useSyncExternalStore(
        useCallback(
            (onStoreChange) => {
                const onChange = (localKey: string): void => {
                    if (key === localKey) {
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

        // eslint-disable-next-line react-hooks/exhaustive-deps
        () => {
            const item = goodTry(() => sessionStorage.getItem(key)) ?? null

            if (inMemoryData.has(key)) {
                storageValue.current = {
                    item,
                    parsed: inMemoryData.get(key) as T | undefined,
                }
            } else if (item !== storageValue.current.item) {
                let parsed: T | undefined

                try {
                    parsed = item === null ? defaultValue : (parse(item) as T)
                } catch {
                    parsed = defaultValue
                }

                storageValue.current = {
                    item,
                    parsed,
                }
            }

            return storageValue.current.parsed
        },

        // istanbul ignore next
        () => defaultValue,
    )
    const setState = useCallback(
        (newValue: SetStateAction<T | undefined>): void => {
            const value =
                newValue instanceof Function ? newValue(storageValue.current.parsed) : newValue

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
    } catch {
        return undefined
    }
}
