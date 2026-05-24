import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Helix — Two currencies. One protocol.",
  description: "Stablecoin-first DeFi + Agent Economy on Arc Testnet. USDC + EURC, native.",
  icons: { icon: "/helix-logo.png", apple: "/helix-logo.png" },
};

/* Anti-flash for dark mode — light is default, only add `dark` class
   if the user has explicitly opted in via localStorage.              */
const antiFlashScript = `
(function() {
  try {
    if (localStorage.getItem('helix_theme') === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`.trim();

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <script dangerouslySetInnerHTML={{ __html: antiFlashScript }} />
        <Providers>
          <Header />
          <div className="flex-1 flex flex-col">{children}</div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
