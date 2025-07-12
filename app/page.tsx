import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import Image from "next/image"

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-8">
      <div className="text-center space-y-6">
        <div className="relative">
          <Image
            src="/images/tharakan-bros-logo.png"
            alt="Tharakan Bros Logo"
            width={200}
            height={200}
            className="mx-auto"
          />
          <h1 className="font-heading tracking-tight mt-4">
            <span className="text-2xl md:text-3xl text-retro-orange block"></span>
            <span className="text-xl md:text-2xl text-retro-blue block mt-2">SURVIVOR LEAGUE</span>
          </h1>
        </div>
        <p className="text-xl max-w-md mx-auto font-pixel">
          Pick one EPL team each week. If they win, you survive.
          <span className="animate-blink">_</span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Already have an account?</CardTitle>
            <CardDescription>Sign in to access your picks and league standings</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button variant="pixel" className="w-full">
                Login
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">New to Survivor League?</CardTitle>
            <CardDescription>Learn how the game works and get started</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/about">
              <Button variant="outline" className="w-full">
                Learn More
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
