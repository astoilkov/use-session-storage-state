import storage from './storage'
import { unstable_batchedUpdates } from 'react-dom'
import type { Dispatch, SetStateAction } from 'react'
import { useRef, useMemo, useEffect, useReducer, useCallback, useLayoutEffect } from 'react'

// `activeHooks` holds all active hooks. we use the array to update all hooks with the same key —
// calling `setValue` of one hook triggers an update for all other hooks with the same key
const activeHooks = new Set<{
    key: string
    forceUpdate: () => void
}>()

export type SessionStorageOptions<T> = {
    ssr?: boolean
    defaultValue?: T
    storageSync?: boolean
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
    const defaultValue = options?.defaultValue

    // SSR support
    if (typeof window === 'undefined') {
        return [defaultValue, (): void => {}, { isPersistent: true, removeItem: (): void => {} }]
    }

    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useBrowserSessionStorageState(
        key,
        defaultValue,
        options?.ssr === true,
        options?.storageSync !== false,
    )
}

function useBrowserSessionStorageState<T>(
    key: string,
    defaultValue: T | undefined,
    ssr: boolean,
    storageSync: boolean,
): SessionStorageState<T | undefined> {
    const initialDefaultValue = useRef(defaultValue).current
    // `id` changes every time a change in the `sessionStorage` occurs
    const [id, forceUpdate] = useReducer((number) => number + 1, 0)
    const updateHooks = useCallback(() => {
        unstable_batchedUpdates(() => {
            // - it fixes "🐛 `setValue()` during render doesn't work":
            //   https://github.com/astoilkov/use-local-storage-state/issues/43
            forceUpdate()

            for (const hook of activeHooks) {
                if (hook.key === key) {
                    hook.forceUpdate()
                }
            }
        })
    }, [key])
    const setState = useCallback(
        (newValue: SetStateAction<T | undefined>): void => {
            storage.set(
                key,
                newValue instanceof Function
                    ? newValue(storage.get(key, initialDefaultValue))
                    : newValue,
            )

            updateHooks()
        },
        [key, updateHooks, initialDefaultValue],
    )

    // - syncs change across tabs, windows, iframe's
    // - the `storage` event is called only in all tabs, windows, iframe's except the one that
    //   triggered the change
    useEffect(() => {
        if (!storageSync) {
            return undefined
        }

        const onStorage = (e: StorageEvent): void => {
            if (e.storageArea === sessionStorage && e.key === key) {
                forceUpdate()
            }
        }

        window.addEventListener('storage', onStorage)

        return (): void => window.removeEventListener('storage', onStorage)
    }, [key, storageSync])

    // - adds this hook to the `activeHooks` array. see the `activeHooks` declaration above for a
    //   more detailed explanation
    useLayoutEffect(() => {
        const hook = { key, forceUpdate }
        activeHooks.add(hook)
        return (): void => {
            activeHooks.delete(hook)
        }
    }, [key])

    // - SSR support
    // - not inside a `useLayoutEffect` because this way we skip the calls to `useEffect()` and
    //   `useLayoutEffect()` for the first render (which also increases performance)
    // - inspired by: https://github.com/astoilkov/use-local-storage-state/pull/40
    // - related: https://github.com/astoilkov/use-local-storage-state/issues/39
    // - related: https://github.com/astoilkov/use-local-storage-state/issues/43
    const isFirstRenderRef = useRef(true)
    const isPossiblyHydrating = ssr && isFirstRenderRef.current
    isFirstRenderRef.current = false
    if (
        isPossiblyHydrating &&
        (storage.data.has(key) || initialDefaultValue !== storage.get(key, initialDefaultValue))
    ) {
        forceUpdate()
    }

    // initial issue: https://github.com/astoilkov/use-local-storage-state/issues/26
    // issues that were caused by incorrect initial and secondary implementations:
    // - https://github.com/astoilkov/use-local-storage-state/issues/30
    // - https://github.com/astoilkov/use-local-storage-state/issues/33
    if (
        initialDefaultValue !== undefined &&
        !storage.data.has(key) &&
        sessionStorage.getItem(key) === null
    ) {
        storage.set(key, initialDefaultValue)
    }

    return useMemo(
        () => [
            isPossiblyHydrating ? initialDefaultValue : storage.get(key, initialDefaultValue),
            setState,
            {
                isPersistent: isPossiblyHydrating || !storage.data.has(key),
                removeItem(): void {
                    storage.remove(key)

                    updateHooks()
                },
            },
        ],

        // disabling eslint warning for the following reasons:
        // - `id` is needed because when it changes that means the data in `sessionStorage` has
        //   changed and we need to update the returned value. However, the eslint rule wants us to
        //   remove the `id` from the dependencies array.
        // - `defaultValue` never changes so we can skip it and reduce package size
        // - `setState` changes when `key` changes so we can skip it and reduce package size
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [id, key],
    )
}
