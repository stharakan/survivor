import type React from "react"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import Navbar from "@/components/navbar"
import { Providers } from "./providers"
import { Press_Start_2P, Source_Code_Pro } from "next/font/google"

// Define the fonts
const pressStart2P = Press_Start_2P({
  weight: ["400"],
  subsets: ["latin"],
  variable: "--font-press-start-2p",
  display: "swap",
})

const sourceCodePro = Source_Code_Pro({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-source-code-pro",
  display: "swap",
})

export const metadata = {
  title: "Tharakan Bros Survivor League",
  description: "EPL Survivor League for the Tharakan Bros",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`bg-[#f0e6d2] dark:bg-[#121212] min-h-screen ${pressStart2P.variable} ${sourceCodePro.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <Providers>
            <div className="min-h-screen">
              <Navbar />
              <main className="container mx-auto py-4 px-4 md:px-6 animate-pixelate">{children}</main>
            </div>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  )
}
