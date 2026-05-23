import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/lib/theme-context"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

export const metadata: Metadata = {
  title: "InfraMind — AI DevOps Infrastructure Intelligence Platform",
  description:
    "Understand DevOps repositories, discover conventions, build dependency graphs, perform semantic search, generate multi-file infrastructure, and validate in sandboxes with AI self-repair loops.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark scroll-smooth" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans min-h-screen relative overflow-x-hidden`}>
        <ThemeProvider>
          {/* Ambient glow orbs – only visible in dark mode */}
          <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden dark:block hidden">
            <div
              className="absolute top-[-15%] left-[-10%] h-[45%] w-[45%] rounded-full
                         bg-teal-500/8 blur-[140px] animate-pulse-glow"
              style={{ animationDuration: "14s" }}
            />
            <div
              className="absolute bottom-[-10%] right-[-10%] h-[50%] w-[50%] rounded-full
                         bg-cyan-400/6 blur-[160px] animate-pulse-glow"
              style={{ animationDuration: "20s" }}
            />
          </div>

          <main className="relative z-10 min-h-screen flex flex-col">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  )
}
