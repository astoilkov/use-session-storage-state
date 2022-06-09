import util from 'util'
import superjson from 'superjson'
import { render, renderHook, act } from '@testing-library/react'
import React, { useEffect, useLayoutEffect, useMemo } from 'react'
import useSessionStorageState, { inMemoryData } from '../src/useSessionStorageState'

beforeEach(() => {
    // Throw an error when `console.error()` is called. This is especially useful in a React tests
    // because React uses it to show warnings and discourage you from shooting yourself in the foot.
    // Here are a few example warnings React throws:
    // - "Warning: useLayoutEffect does nothing on the server, because its effect cannot be encoded
    //   into the server renderer's output format. This will lead to a mismatch between the initial,
    //   non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in
    //   components that render exclusively on the client. See
    //   https://reactjs.org/link/uselayouteffect-ssr for common fixes."
    // - "Warning: Can't perform a React state update on an unmounted component. This is a no-op,
    //   but it indicates a memory leak in your application. To fix, cancel all subscriptions and
    //   asynchronous tasks in a useEffect cleanup function."
    // - "Warning: Cannot update a component (`Component`) while rendering a different component
    //   (`Component`). To locate the bad setState() call inside `Component`, follow the stack trace
    //   as described in https://reactjs.org/link/setstate-in-render"
    jest.spyOn(console, 'error').mockImplementation((format: string, ...args: any[]) => {
        throw new Error(util.format(format, ...args))
    })
})

afterEach(() => {
    inMemoryData.clear()
    localStorage.clear()
    sessionStorage.clear()
})

describe('usesessionStorageState()', () => {
    test('initial state is written into the state', () => {
        const { result } = renderHook(() =>
            useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
        )

        const [todos] = result.current
        expect(todos).toEqual(['first', 'second'])
    })

    test(`initial state isn't written into sessionStorage`, () => {
        renderHook(() => useSessionStorageState('todos', { defaultValue: ['first', 'second'] }))

        expect(sessionStorage.getItem('todos')).toEqual(JSON.stringify(['first', 'second']))
    })

    test('updates state', () => {
        const { result } = renderHook(() =>
            useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
        )

        act(() => {
            const setTodos = result.current[1]

            setTodos(['third', 'forth'])
        })

        const [todos] = result.current
        expect(todos).toEqual(['third', 'forth'])
        expect(sessionStorage.getItem('todos')).toEqual(JSON.stringify(['third', 'forth']))
    })

    test('updates state with callback function', () => {
        const { result } = renderHook(() =>
            useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
        )

        act(() => {
            const setTodos = result.current[1]

            setTodos((value) => [...value, 'third', 'forth'])
        })

        const [todos] = result.current
        expect(todos).toEqual(['first', 'second', 'third', 'forth'])
        expect(sessionStorage.getItem('todos')).toEqual(
            JSON.stringify(['first', 'second', 'third', 'forth']),
        )
    })

    test('does not fail when having an invalid data in sessionStorage', () => {
        sessionStorage.setItem('todos', 'some random string')

        const { result } = renderHook(() =>
            useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
        )

        const [todos] = result.current
        expect(todos).toEqual(['first', 'second'])
    })

    test('updating writes into sessionStorage', () => {
        const { result } = renderHook(() =>
            useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
        )

        act(() => {
            const setTodos = result.current[1]

            setTodos(['third', 'forth'])
        })

        expect(sessionStorage.getItem('todos')).toEqual(JSON.stringify(['third', 'forth']))
    })

    test('initially gets value from local storage if there is a value', () => {
        sessionStorage.setItem('todos', JSON.stringify(['third', 'forth']))

        const { result } = renderHook(() =>
            useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
        )

        const [todos] = result.current
        expect(todos).toEqual(['third', 'forth'])
    })

    test('handles errors thrown by sessionStorage', () => {
        jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error()
        })

        const { result } = renderHook(() =>
            useSessionStorageState('set-item-will-throw', { defaultValue: '' }),
        )

        expect(() => {
            act(() => {
                const setValue = result.current[1]
                setValue('will-throw')
            })
        }).not.toThrow()
    })

    test('can set value to `undefined`', () => {
        const { result: resultA, unmount } = renderHook(() =>
            useSessionStorageState<string[] | undefined>('todos', {
                defaultValue: ['first', 'second'],
            }),
        )
        act(() => {
            const [, setValue] = resultA.current
            setValue(undefined)
        })
        unmount()

        const { result: resultB } = renderHook(() =>
            useSessionStorageState<string[] | undefined>('todos', {
                defaultValue: ['first', 'second'],
            }),
        )
        const [value] = resultB.current
        expect(value).toBe(undefined)
    })

    test('can set value to `null`', () => {
        const { result: resultA, unmount } = renderHook(() =>
            useSessionStorageState<string[] | null>('todos', {
                defaultValue: ['first', 'second'],
            }),
        )
        act(() => {
            const [, setValue] = resultA.current
            setValue(null)
        })
        unmount()

        const { result: resultB } = renderHook(() =>
            useSessionStorageState<string[] | null>('todos', {
                defaultValue: ['first', 'second'],
            }),
        )
        const [value] = resultB.current
        expect(value).toBe(null)
    })

    test('can reset value to default', () => {
        const { result: resultA, unmount: unmountA } = renderHook(() =>
            useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
        )
        act(() => {
            const [, setValue] = resultA.current
            setValue(['third', 'forth'])
        })
        unmountA()

        const { result: resultB, unmount: unmountB } = renderHook(() =>
            useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
        )
        act(() => {
            const [, , { removeItem }] = resultB.current
            removeItem()
        })
        unmountB()

        const { result: resultC } = renderHook(() =>
            useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
        )
        const [value] = resultC.current
        expect(value).toEqual(['first', 'second'])
    })

    test('returns the same update function when the value is saved', () => {
        const functionMock = jest.fn()
        const { rerender } = renderHook(() => {
            const [, setTodos] = useSessionStorageState('todos', {
                defaultValue: ['first', 'second'],
            })
            useMemo(functionMock, [setTodos])
        })

        rerender()

        expect(functionMock.mock.calls.length).toEqual(1)
    })

    test('changing the "key" property updates the value from local storage', () => {
        sessionStorage.setItem('valueA', JSON.stringify('A'))
        sessionStorage.setItem('valueB', JSON.stringify('B'))

        const { result, rerender } = renderHook(
            (props) => useSessionStorageState(props.key, undefined),
            {
                initialProps: {
                    key: 'valueA',
                },
            },
        )

        rerender({ key: 'valueB' })

        const [value] = result.current
        expect(value).toEqual('B')
    })

    // https://github.com/astoilkov/use-local-storage-state/issues/30
    test(`when defaultValue isn't provided — don't write to sessionStorage on initial render`, () => {
        renderHook(() => useSessionStorageState('todos'))

        expect(sessionStorage.getItem('todos')).toEqual(null)
    })

    // https://github.com/astoilkov/use-local-storage-state/issues/33
    test(`sessionStorage value shouldn't be overwritten`, () => {
        sessionStorage.setItem('color', 'red')

        renderHook(() => useSessionStorageState('todos', { defaultValue: 'blue' }))

        expect(sessionStorage.getItem('color')).toEqual('red')
    })

    test('calling update from one hook updates the other', () => {
        const { result: resultA } = renderHook(() =>
            useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
        )
        const { result: resultB } = renderHook(() =>
            useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
        )

        act(() => {
            const setTodos = resultA.current[1]

            setTodos(['third', 'forth'])
        })

        const [todos] = resultB.current
        expect(todos).toEqual(['third', 'forth'])
    })

    test('can reset value to default', () => {
        const { result: resultA } = renderHook(() =>
            useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
        )
        const { result: resultB } = renderHook(() =>
            useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
        )

        act(() => {
            const setTodosA = resultA.current[1]
            const removeTodosB = resultB.current[2].removeItem

            setTodosA(['third', 'forth'])

            removeTodosB()
        })

        const [todos] = resultB.current
        expect(todos).toEqual(['first', 'second'])
    })

    // https://github.com/astoilkov/use-local-storage-state/issues/30
    test("when defaultValue isn't provided — don't write to sessionStorage on initial render", () => {
        renderHook(() => useSessionStorageState('todos'))

        expect(sessionStorage.getItem('todos')).toEqual(null)
    })

    test('basic setup with default value', () => {
        const { result } = renderHook(() =>
            useSessionStorageState('todos', {
                defaultValue: ['first', 'second'],
            }),
        )

        const [todos] = result.current
        expect(todos).toEqual(['first', 'second'])
    })

    test('if there are already items in sessionStorage', () => {
        sessionStorage.setItem('todos', JSON.stringify([4, 5, 6]))

        const { result } = renderHook(() =>
            useSessionStorageState('todos', {
                defaultValue: ['first', 'second'],
            }),
        )

        const [todos] = result.current
        expect(todos).toEqual([4, 5, 6])
    })

    test('supports changing the key', () => {
        let key = 'todos1'

        const { rerender } = renderHook(() =>
            useSessionStorageState(key, { defaultValue: ['first', 'second'] }),
        )

        key = 'todos2'

        rerender()

        expect(JSON.parse(sessionStorage.getItem('todos1')!)).toEqual(['first', 'second'])
        expect(JSON.parse(sessionStorage.getItem('todos2')!)).toEqual(['first', 'second'])
    })

    // https://github.com/astoilkov/use-local-storage-state/issues/39
    // https://github.com/astoilkov/use-local-storage-state/issues/43
    // https://github.com/astoilkov/use-local-storage-state/pull/40
    test(`when ssr: true — don't call useEffect() and useLayoutEffect() on first render`, () => {
        let calls = 0

        function Component() {
            useSessionStorageState('color', {
                defaultValue: 'red',
            })

            useEffect(() => {
                calls += 1
            })

            return null
        }

        render(<Component />)

        expect(calls).toBe(1)
    })

    // https://github.com/astoilkov/use-local-storage-state/issues/44
    test(`setState() shouldn't change between renders`, () => {
        function Component() {
            const [value, setValue] = useSessionStorageState('number', {
                defaultValue: 1,
            })

            useEffect(() => {
                setValue((value) => value + 1)
            }, [setValue])

            return <div>{value}</div>
        }

        const { queryByText } = render(<Component />)

        expect(queryByText(/^2$/u)).toBeTruthy()
    })

    // https://github.com/astoilkov/use-local-storage-state/issues/43
    test(`setState() during render`, () => {
        function Component() {
            const [value, setValue] = useSessionStorageState('number', {
                defaultValue: 0,
            })

            if (value === 0) {
                setValue(1)
            }

            return <div>{value}</div>
        }

        const { queryByText } = render(<Component />)

        expect(queryByText(/^0$/u)).not.toBeTruthy()
        expect(queryByText(/^1$/u)).toBeTruthy()
    })

    test(`calling setValue() from useLayoutEffect() should update all usesessionStorageState() instances`, () => {
        function App() {
            return (
                <>
                    <Component update={false} />
                    <Component update={true} />
                </>
            )
        }

        function Component({ update }: { update: boolean }) {
            const [value, setValue] = useSessionStorageState('number', {
                defaultValue: 0,
            })

            useLayoutEffect(() => {
                if (update) {
                    setValue(1)
                }
            }, [])

            return <div>{value}</div>
        }

        const { queryAllByText } = render(<App />)

        expect(queryAllByText(/^1$/u)).toHaveLength(2)
    })

    describe('"storage" event', () => {
        const fireStorageEvent = (storageArea: Storage, key: string, newValue: unknown): void => {
            const oldValue = sessionStorage.getItem(key)

            if (newValue === null) {
                sessionStorage.removeItem(key)
            } else {
                sessionStorage.setItem(key, JSON.stringify(newValue))
            }

            window.dispatchEvent(
                new StorageEvent('storage', {
                    key,
                    oldValue,
                    storageArea,
                    newValue: JSON.stringify(newValue),
                }),
            )
        }

        test('storage event updates state', () => {
            const { result: resultA } = renderHook(() =>
                useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
            )
            const { result: resultB } = renderHook(() =>
                useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
            )

            act(() => {
                fireStorageEvent(sessionStorage, 'todos', ['third', 'forth'])
            })

            const [todosA] = resultA.current
            expect(todosA).toEqual(['third', 'forth'])

            const [todosB] = resultB.current
            expect(todosB).toEqual(['third', 'forth'])
        })

        test('"storage" event updates state to default value', () => {
            const { result } = renderHook(() =>
                useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
            )

            act(() => {
                const setTodos = result.current[1]
                setTodos(['third', 'forth'])

                fireStorageEvent(sessionStorage, 'todos', null)
            })

            const [todosB] = result.current
            expect(todosB).toEqual(['first', 'second'])
        })

        test(`unrelated storage update doesn't do anything`, () => {
            const { result } = renderHook(() =>
                useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
            )

            act(() => {
                // trying with localStorage
                fireStorageEvent(localStorage, 'todos', ['third', 'forth'])

                // trying with a non-relevant key
                fireStorageEvent(sessionStorage, 'not-todos', ['third', 'forth'])
            })

            const [todosA] = result.current
            expect(todosA).toEqual(['first', 'second'])
        })

        test('`storageSync: false` disables "storage" event', () => {
            const { result } = renderHook(() =>
                useSessionStorageState('todos', {
                    defaultValue: ['first', 'second'],
                    storageSync: false,
                }),
            )

            act(() => {
                fireStorageEvent(sessionStorage, 'todos', ['third', 'forth'])
            })

            const [todosA] = result.current
            expect(todosA).toEqual(['first', 'second'])
        })
    })

    describe('in memory fallback', () => {
        test('can retrieve data from in memory storage', () => {
            jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
                throw new Error()
            })

            const { result: resultA } = renderHook(() =>
                useSessionStorageState('todos', { defaultValue: ['first'] }),
            )

            act(() => {
                const setValue = resultA.current[1]
                setValue(['first', 'second'])
            })

            const { result: resultB } = renderHook(() =>
                useSessionStorageState('todos', { defaultValue: ['first'] }),
            )

            const [value] = resultB.current
            expect(value).toEqual(['first', 'second'])
        })

        test('isPersistent returns true by default', () => {
            const { result } = renderHook(() =>
                useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
            )
            const [, , { isPersistent }] = result.current
            expect(isPersistent).toBe(true)
        })

        test('isPersistent returns true when sessionStorage.setItem() throws an error but the value is the default value', () => {
            jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
                throw new Error()
            })

            const { result } = renderHook(() =>
                useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
            )

            const [, , { isPersistent }] = result.current
            expect(isPersistent).toBe(true)
        })

        test('isPersistent returns false when sessionStorage.setItem() throws an error', () => {
            jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
                throw new Error()
            })

            const { result } = renderHook(() =>
                useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
            )

            act(() => {
                const [, setTodos] = result.current
                setTodos(['third', 'forth'])
            })

            const [todos, , { isPersistent }] = result.current
            expect(isPersistent).toBe(false)
            expect(todos).toEqual(['third', 'forth'])
        })

        test('isPersistent becomes false when sessionStorage.setItem() throws an error on consecutive updates', () => {
            const { result } = renderHook(() =>
                useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
            )

            jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
                throw new Error()
            })

            act(() => {
                const setTodos = result.current[1]
                setTodos(['second', 'third'])
            })

            const [todos, , { isPersistent }] = result.current
            expect(todos).toEqual(['second', 'third'])
            expect(isPersistent).toBe(false)
        })

        test('isPersistent returns true after "storage" event', () => {
            const { result } = renderHook(() =>
                useSessionStorageState('todos', { defaultValue: ['first', 'second'] }),
            )

            // #WET 2020-03-19T8:55:25+02:00
            act(() => {
                sessionStorage.setItem('todos', JSON.stringify(['third', 'forth']))
                window.dispatchEvent(
                    new StorageEvent('storage', {
                        storageArea: sessionStorage,
                        key: 'todos',
                        oldValue: JSON.stringify(['first', 'second']),
                        newValue: JSON.stringify(['third', 'forth']),
                    }),
                )
            })

            const [, , { isPersistent }] = result.current
            expect(isPersistent).toBe(true)
        })
    })

    describe('"serializer" option', () => {
        test('can serialize Date from initial value', () => {
            const date = new Date()

            const { result } = renderHook(() =>
                useSessionStorageState('date', {
                    defaultValue: [date],
                    serializer: superjson,
                }),
            )

            const [value] = result.current
            expect(value).toEqual([date])
        })

        test('can serialize Date (in array) from setValue', () => {
            const date = new Date()

            const { result } = renderHook(() =>
                useSessionStorageState<(Date | null)[]>('date', {
                    defaultValue: [null],
                    serializer: superjson,
                }),
            )

            act(() => {
                const setValue = result.current[1]
                setValue([date])
            })

            const [value, _] = result.current
            expect(value).toEqual([date])
        })

        test(`JSON as serializer can't handle undefined as value`, () => {
            const { result: resultA, unmount } = renderHook(() =>
                useSessionStorageState<string[] | undefined>('todos', {
                    defaultValue: ['first', 'second'],
                    serializer: JSON,
                }),
            )
            act(() => {
                const [, setValue] = resultA.current
                setValue(undefined)
            })
            unmount()

            const { result: resultB } = renderHook(() =>
                useSessionStorageState<string[] | undefined>('todos', {
                    defaultValue: ['first', 'second'],
                    serializer: JSON,
                }),
            )
            const [value] = resultB.current
            expect(value).not.toBe(undefined)
        })
    })
})
