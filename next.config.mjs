/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep build ignores for now to ensure deployment succeeds
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // CR-106: static export -- Next.js builds to `out/`, FastAPI serves it (and
  // /api/*) from a single Heroku dyno. No Node server runs in production, so
  // anything requiring one (Image Optimization, Route Handlers, middleware,
  // headers()) is out.
  output: 'export',
  trailingSlash: true,

  // Image Optimization needs a running server or a custom loader; static
  // export supports neither out of the box, so serve images unoptimized.
  images: {
    unoptimized: true,
  },

  // Compression and performance
  compress: true,

  // NOTE: no `env` block here anymore. The only entry it ever had
  // (NEXTAUTH_URL) was consumed exclusively by app/api/admin/users/[userId]/
  // generate-reset-link/route.ts, which is deleted under CR-106 AC2 -- its
  // Python port (api/app/routers/password_reset.py) reads NEXTAUTH_URL
  // directly from the server process's own env, not from anything baked into
  // the client JS bundle. Confirmed vestigial, safe to drop (CR-106 AC5).

  // Security headers now live in api/app/main.py's ASGI middleware (CR-106
  // AC6) -- `headers()` isn't supported under `output: 'export'`, there's no
  // server for it to run on.
}

export default nextConfig
