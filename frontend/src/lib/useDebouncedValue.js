import { useEffect, useState } from 'react'

export default function useDebouncedValue(value, delay = 250) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return value === '' ? '' : settled
}
