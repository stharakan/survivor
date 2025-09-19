"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { LogOut, Menu, User, Trophy, CheckSquare, Settings, FileText, Grid3X3 } from "lucide-react"
import { useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useLeague } from "@/hooks/use-league"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { ModeToggle } from "./mode-toggle"
import Image from "next/image"

export default function Navbar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { currentLeague, isCurrentUserAdmin, clearLeague } = useLeague()
  const [open, setOpen] = useState(false)

  const routes = [
    {
      href: "/profile",
      label: "Profile",
      icon: <User className="h-4 w-4 mr-2" />,
      active: pathname === "/profile",
    },
    {
      href: "/make-picks",
      label: "Make Picks",
      icon: <CheckSquare className="h-4 w-4 mr-2" />,
      active: pathname === "/make-picks",
    },
    {
      href: "/scoreboard",
      label: "Scoreboard",
      icon: <Trophy className="h-4 w-4 mr-2" />,
      active: pathname === "/scoreboard",
    },
    {
      href: "/results",
      label: "Results",
      icon: <Grid3X3 className="h-4 w-4 mr-2" />,
      active: pathname === "/results",
    },
    {
      href: "/rules",
      label: "Rules",
      icon: <FileText className="h-4 w-4 mr-2" />,
      active: pathname === "/rules",
    },
  ]

  // Add admin route if user is admin
  if (isCurrentUserAdmin) {
    routes.push({
      href: "/admin",
      label: "Admin Portal",
      icon: <Settings className="h-4 w-4 mr-2" />,
      active: pathname.startsWith("/admin"),
    })
  }

  const handleLogoClick = () => {
    if (user && currentLeague) {
      clearLeague()
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b-4 border-black bg-retro-orange dark:bg-[#121212] backdrop-blur">
      <div className="container flex h-20 items-center justify-between px-2 sm:px-4">
        <div className="flex items-center">
          <div onClick={handleLogoClick} className={user && currentLeague ? "cursor-pointer" : ""}>
            <div className="relative flex flex-col items-center">
              <Image src="/images/tharakan-bros-logo.png" alt="Tharakan Bros Logo" width={50} height={50} />
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-3 lg:gap-6 ml-4 lg:ml-8">
            {user &&
              currentLeague &&
              routes.map((route) => (
                <Link
                  key={route.href}
                  href={route.href}
                  className={`text-xs lg:text-sm font-heading transition-colors flex items-center ${
                    route.active ? "text-white" : "text-white/80 hover:text-white"
                  } ${route.href === "/admin" ? "text-yellow-300 hover:text-yellow-200" : ""}`}
                >
                  {route.icon}
                  {route.label}
                </Link>
              ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ModeToggle />

          {user ? (
            <div className="hidden md:flex items-center gap-2">
              <Button variant="pixel" size="sm" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          ) : (
            <div className="hidden md:block">
              <Link href="/login">
                <Button variant="pixel" size="sm">
                  Login
                </Button>
              </Link>
            </div>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5 text-white" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="border-l-4 border-black bg-[#f0e6d2] dark:bg-[#121212]">
              <div className="flex justify-center mb-8 mt-4">
                <Image src="/images/tharakan-bros-logo.png" alt="Tharakan Bros Logo" width={100} height={100} />
              </div>
              {currentLeague && (
                <div className="text-center mb-6 p-3 border-2 border-black bg-retro-orange text-white">
                  <div className="font-heading text-sm">{currentLeague.name}</div>
                  <div className="text-xs opacity-80 flex items-center justify-center gap-2">
                    <span>{currentLeague.sportsLeague}</span>
                    {isCurrentUserAdmin && <span className="text-yellow-300">• ADMIN</span>}
                  </div>
                </div>
              )}
              <nav className="flex flex-col gap-4 mt-8">
                {user && currentLeague ? (
                  <>
                    {routes.map((route) => (
                      <Link
                        key={route.href}
                        href={route.href}
                        onClick={() => setOpen(false)}
                        className={`text-sm font-heading transition-colors flex items-center p-2 ${
                          route.active
                            ? route.href === "/admin"
                              ? "bg-yellow-500 text-black rounded-md"
                              : "bg-retro-orange text-white rounded-md"
                            : route.href === "/admin"
                              ? "text-yellow-600 hover:bg-yellow-500/20"
                              : "text-foreground hover:bg-retro-orange/20"
                        }`}
                      >
                        {route.icon}
                        {route.label}
                      </Link>
                    ))}
                    <Button
                      variant="outline"
                      className="justify-start px-2 mt-4 border-2 border-black bg-transparent"
                      onClick={() => {
                        clearLeague()
                        setOpen(false)
                      }}
                    >
                      Switch League
                    </Button>
                    <Button
                      variant="pixel"
                      className="justify-start px-2 mt-2"
                      onClick={() => {
                        logout()
                        setOpen(false)
                      }}
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Logout
                    </Button>
                  </>
                ) : (
                  <Link href="/login" onClick={() => setOpen(false)}>
                    <Button variant="pixel">Login</Button>
                  </Link>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
