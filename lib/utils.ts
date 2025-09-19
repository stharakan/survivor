import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Allowed internal redirect paths for security validation
 */
const ALLOWED_REDIRECT_PATHS = [
  '/leagues',
  '/profile',
  '/scoreboard',
  '/make-picks',
  '/admin',
  '/picks-remaining',
  '/player',
  '/reset-password',
  '/invite'
] as const

/**
 * Validates a redirect URL to prevent open redirect vulnerabilities.
 * Only allows internal application routes from an allowlist.
 *
 * @param redirectUrl - The URL to validate
 * @returns The validated URL if safe, or null if unsafe
 */
export function validateRedirectUrl(redirectUrl: string | null | undefined): string | null {
  // Return null for empty/null/undefined inputs
  if (!redirectUrl || typeof redirectUrl !== 'string' || redirectUrl.trim() === '') {
    return null
  }

  const url = redirectUrl.trim()

  try {
    // Handle relative URLs (most common case)
    if (url.startsWith('/')) {
      // Block protocol-relative URLs like "//evil.com"
      if (url.startsWith('//')) {
        console.warn('Blocked protocol-relative URL redirect attempt:', url)
        return null
      }

      // Check if the path starts with any allowed path
      const isAllowed = ALLOWED_REDIRECT_PATHS.some(allowedPath => {
        if (allowedPath === '/player' || allowedPath === '/admin' || allowedPath === '/invite') {
          // Allow dynamic routes like /player/123, /admin/settings, or /invite/token
          return url.startsWith(allowedPath + '/') || url === allowedPath
        }
        return url === allowedPath || url.startsWith(allowedPath + '?') || url.startsWith(allowedPath + '#')
      })

      if (isAllowed) {
        return url
      } else {
        console.warn('Blocked redirect to disallowed internal path:', url)
        return null
      }
    }

    // Parse absolute URLs to check domain and scheme
    const parsedUrl = new URL(url)

    // Block dangerous schemes
    const dangerousSchemes = ['javascript:', 'data:', 'vbscript:', 'file:', 'ftp:']
    if (dangerousSchemes.some(scheme => parsedUrl.protocol === scheme)) {
      console.warn('Blocked redirect with dangerous protocol:', parsedUrl.protocol, url)
      return null
    }

    // Block all external domains (only allow same-origin)
    if (typeof window !== 'undefined') {
      const currentOrigin = window.location.origin
      if (parsedUrl.origin !== currentOrigin) {
        console.warn('Blocked external redirect attempt:', parsedUrl.origin, 'vs', currentOrigin)
        return null
      }

      // If it's same origin, validate the pathname
      return validateRedirectUrl(parsedUrl.pathname + parsedUrl.search + parsedUrl.hash)
    } else {
      // In server-side context, block all absolute URLs for security
      console.warn('Blocked absolute URL redirect in server context:', url)
      return null
    }

  } catch (error) {
    // Invalid URL format
    console.warn('Blocked malformed URL redirect attempt:', url, error)
    return null
  }
}

/**
 * Gets a safe redirect URL with fallback to default route.
 * Use this in authentication flows to ensure users are always redirected safely.
 *
 * @param redirectUrl - The requested redirect URL
 * @param defaultRoute - The fallback route (defaults to '/leagues')
 * @returns A safe redirect URL
 */
export function getSafeRedirectUrl(
  redirectUrl: string | null | undefined,
  defaultRoute: string = '/leagues'
): string {
  const validatedUrl = validateRedirectUrl(redirectUrl)
  return validatedUrl || defaultRoute
}
