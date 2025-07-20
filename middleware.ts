import { NextRequest, NextResponse } from 'next/server'

// Define protected routes that require authentication
const protectedRoutes = [
  '/api/leagues',
  '/api/users',
  '/api/picks',
  '/api/games',
]

// Define public routes that don't require authentication
const publicRoutes = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/verify',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // Skip middleware for public routes and non-API routes
  if (!pathname.startsWith('/api/') || publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next()
  }
  
  // Check if this is a protected API route
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))
  
  if (isProtectedRoute) {
    // Get token from cookie
    const token = request.cookies.get('auth-token')?.value
    
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }
    
    // For now, just check if token exists
    // Full JWT verification will be done in the API routes
    // This is because JWT libraries don't work well in Edge Runtime
    if (token.length > 0) {
      return NextResponse.next()
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}