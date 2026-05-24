"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ThemeToggle } from "./ThemeToggle";
import { FaucetLink } from "./FaucetLink";

const NAV = [
  { href: "/vault",   label: "Vault"   },
  { href: "/flux",    label: "Flux"    },
  { href: "/stream",  label: "Stream"  },
  { href: "/lockbox", label: "Lockbox" },
  { href: "/grid",    label: "Grid"    },
  { href: "/agents",  label: "Agents"  },
  { href: "/bridge",  label: "Bridge"  },
  { href: "/account", label: "Account" },
] as const;

export function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");

  return (
    <nav className="border-b border-line bg-bg/95 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 h-16 flex items-center justify-between gap-3">

        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Logo />
          <span className="font-bold text-lg tracking-tight text-brand whitespace-nowrap">
            Helix
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-4">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "text-sm font-medium transition-colors hover:text-brand",
                isActive(item.href) ? "text-brand" : "text-ink-muted",
              ].join(" ")}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden xl:inline-flex h-7 px-2 rounded-full border border-line text-xs text-ink-muted items-center whitespace-nowrap">
            Arc Testnet
          </span>
          <div className="hidden lg:block">
            <FaucetLink />
          </div>
          <WalletControls />
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border border-line hover:bg-brand-wash transition"
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-line bg-bg px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={[
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive(item.href)
                    ? "bg-brand-wash text-brand"
                    : "text-ink-muted hover:bg-brand-wash hover:text-ink",
                ].join(" ")}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

function WalletControls() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        mounted,
        openAccountModal,
        openChainModal,
        openConnectModal,
      }) => {
        const connected = mounted && account && chain;

        if (!connected) {
          return (
            <button
              type="button"
              onClick={openConnectModal}
              className="h-9 px-3 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand/90 transition whitespace-nowrap"
            >
              Connect Wallet
            </button>
          );
        }

        return (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openChainModal}
              className="h-9 px-3 rounded-md border border-line bg-surface text-sm font-medium text-ink hover:bg-brand-wash transition whitespace-nowrap inline-flex items-center"
            >
              {chain.unsupported ? "Wrong network" : chain.name}
            </button>
            <button
              type="button"
              onClick={openAccountModal}
              className="h-9 px-3 rounded-md border border-line bg-surface text-sm font-semibold text-ink hover:bg-brand-wash transition whitespace-nowrap inline-flex items-center font-mono"
            >
              {account.displayName}
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

function Logo() {
  return (
    <Image
      src="/helix-logo.png"
      alt="Helix"
      width={32}
      height={32}
      className="shrink-0"
      priority
    />
  );
}
