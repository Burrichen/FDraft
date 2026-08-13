import type { Metadata, Viewport } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import { SerwistProvider } from "@serwist/next/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// See docs/product-spec.md, "TYPOGRAPHY" — chosen over Geist/Inter/DM Sans
// after in-app evaluation for feeling modern, cinematic, and slightly
// distinctive without reading as corporate. `next/font/google` downloads
// and self-hosts the font files at BUILD time — the browser never fetches
// from fonts.googleapis.com/fonts.gstatic.com at runtime, which is what
// makes this safe for an offline-first app (see "OFFLINE FONT
// REQUIREMENT"). Only the real weights actually used by the app's type
// hierarchy are loaded, not the full 200-800 range.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "FDraft",
    template: "%s · FDraft",
  },
  description:
    "A local-first Letterboxd watchlist and Monthly Watchlist Draft companion. No account, no server — works fully offline.",
  applicationName: "FDraft",
  // Installed-app naming for iOS/iPadOS home-screen launches — see
  // docs/product-spec.md, "PWA / OFFLINE APPLICATION SHELL" (Prompt 9.5D).
  // `capable: true` is what actually opts an installed icon into
  // standalone (no Safari chrome) launch on iOS; `app/manifest.ts` alone
  // only covers Android/desktop installs.
  appleWebApp: {
    capable: true,
    title: "FDraft",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  // sRGB approximation of the dark-mode `--background` token — see the
  // identical note in `app/manifest.ts`. Kept in sync with that value;
  // both describe the same "chrome around the app" color, just to two
  // different consumers (the OS install manifest vs. the live browser UI).
  themeColor: "#121316",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${manrope.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <SerwistProvider
          swUrl="/sw.js"
          // A service worker's whole job — caching this same origin's own
          // assets for offline use — is redundant inside the Tauri desktop
          // shell: there's no real network origin serving the app at all
          // (a bundled static frontend, loaded via Tauri's own asset
          // protocol), and IndexedDB already gives every page fully
          // working offline behavior on its own. Running both caching
          // systems at once would be pure downside — see
          // docs/product-spec.md's Tauri integration notes, "PWA
          // INTERACTION". `NEXT_PUBLIC_TAURI` is a build-time flag (see
          // `next.config.ts`), not a runtime check, since the desktop
          // build is its own separate static bundle to begin with.
          disable={
            process.env.NODE_ENV !== "production" ||
            process.env.NEXT_PUBLIC_TAURI === "1"
          }
          // A stray page mid-draft-creation or mid-import force-reloading
          // itself the instant wifi flickers back on would be a genuinely
          // bad surprise for a local-first app that never needed the
          // network to keep working in the first place — see
          // docs/product-spec.md, "PWA / OFFLINE APPLICATION SHELL".
          reloadOnOnline={false}
        >
          <TooltipProvider delay={200}>
            {children}
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
