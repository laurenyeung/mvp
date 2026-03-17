import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function formatRelativeDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.round((date - now) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays > 1 && diffDays < 7) return `In ${diffDays} days`
  return formatDate(dateStr)
}

export function getInitials(firstName, lastName) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase()
}
