const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

export function apiUrl(path: `/api/${string}`): string {
  if (!configuredBaseUrl) return path
  const url = new URL(path, configuredBaseUrl)
  if (import.meta.env.PROD && url.protocol !== 'https:')
    throw new Error('Production API URL must use HTTPS.')
  return url.toString()
}

export function transcriptionSocketUrl(): string {
  const url = new URL(apiUrl('/api/transcription'), location.origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}
