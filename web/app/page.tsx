"use client"

import dynamic from "next/dynamic"

const SFAppShell = dynamic(
  () => import("@/components/sf/app-shell").then((mod) => mod.SFAppShell),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading workspace…
      </div>
    ),
  },
)

export default function Page() {
  return <SFAppShell />
}
