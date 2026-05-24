import Link from "next/link";

const FOOTER_LINKS = {
  Protocol: [
    { href: "/vault",   label: "Vault"   },
    { href: "/flux",    label: "Flux"    },
    { href: "/stream",  label: "Stream"  },
    { href: "/lockbox", label: "Lockbox" },
  ],
  "Agent Economy": [
    { href: "/grid",   label: "Grid"   },
    { href: "/agents", label: "Agents" },
    { href: "/bridge", label: "Bridge" },
    { href: "/account", label: "Account" },
  ],
  Resources: [
    { href: "https://faucet.circle.com",            label: "Circle Faucet",   external: true },
    { href: "https://testnet.arcscan.app",          label: "Arc Explorer",    external: true },
    { href: "https://docs.circle.com/arc",          label: "Arc Docs",        external: true },
    { href: "https://github.com/circlefin",         label: "Circle GitHub",   external: true },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-line bg-bg mt-16">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">

          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-3">
              <svg width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden>
                <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="2" className="text-brand" />
                <path
                  d="M8 8c4 0 4 12 8 12M8 20c4 0 4-12 8-12"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-brand"
                />
              </svg>
              <span className="font-bold text-brand">Helix</span>
            </Link>
            <p className="text-sm text-ink-muted leading-relaxed max-w-xs">
              Stablecoin-first DeFi and an agent economy on Circle&apos;s Arc.
              USDC + EURC, native.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs text-ink-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
              Arc Testnet · chain 5042002
            </div>
          </div>

          {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
            <div key={heading}>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink mb-3">
                {heading}
              </h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.href}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-ink-muted hover:text-brand transition-colors"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-ink-muted hover:text-brand transition-colors"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs text-ink-muted">
            © {new Date().getFullYear()} Helix. Built for Circle Arc Testnet.
          </p>
          <p className="text-xs text-ink-muted font-mono">
            USDC · EURC · CCTP V2
          </p>
        </div>
      </div>
    </footer>
  );
}
