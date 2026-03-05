import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

type ElementSize = {
  width: number
  height: number
}

export function useElementSize<T extends HTMLElement>(
  ref: RefObject<T | null>,
): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }

    const updateSize = () => {
      const { width, height } = element.getBoundingClientRect()
      setSize({ width, height })
    }

    updateSize()

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [ref])

  return size
}
