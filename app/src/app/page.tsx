import Link from "next/link";

const STEPS = [
  {
    step: "01",
    title: "Hold",
    desc: "Faucet real USDC and EURC on Arc Testnet. Your wallet is funded in seconds.",
  },
  {
    step: "02",
    title: "Earn",
    desc: "Supply to the Vault for interest. Provide liquidity to Flux for swap fees.",
  },
  {
    step: "03",
    title: "Automate",
    desc: "Schedule recurring payments. Hire agents. The crank executes for you.",
  },
];

const FEATURES = [
  { href: "/vault",   title: "Vault",   blurb: "Lend USDC, borrow EURC (or vice versa). 75% LTV, 5% APR." },
  { href: "/flux",    title: "Flux",    blurb: "USDC ↔ EURC AMM. 0.30% fee. Earn LP tokens." },
  { href: "/stream",  title: "Stream",  blurb: "Recurring stablecoin payments executed by the server crank." },
  { href: "/lockbox", title: "Lockbox", blurb: "Commit-reveal claim links. Share a URL, recipient claims with a secret." },
  { href: "/grid",    title: "Grid",    blurb: "Post a task, escrow USDC, release on completion." },
  { href: "/agents",  title: "Agents",  blurb: "On-chain agent registry. x402-style pay-per-call settlement." },
  { href: "/bridge",  title: "Bridge",  blurb: "Move USDC between Arc and supported EVM testnets with AppKit." },
];

export default function Home() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-3 sm:px-4 py-14 sm:py-24 text-center">
        <div className="mb-6">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand bg-brand-wash px-3 py-1 rounded-full">
            Powered by Circle Arc
          </span>
        </div>

        <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-5 sm:mb-6 text-ink leading-[1.05]">
          Two currencies.
          <br />
          <span className="text-brand">One protocol.</span>
        </h1>

        <p className="text-base sm:text-xl text-ink-muted mb-8 sm:mb-12 max-w-2xl mx-auto leading-relaxed">
          Stablecoin-first DeFi and an agent economy built on Circle&apos;s Arc.
          Real USDC and EURC, gasless onboarding via the faucet, and an autonomous payment crank.
        </p>

        <div className="grid grid-cols-1 sm:flex gap-3 sm:gap-4 justify-center mb-12 sm:mb-20">
          <Link
            href="/flux"
            className="px-8 py-3 bg-brand text-white rounded-lg font-semibold hover:bg-brand/90 transition-colors"
          >
            Start swapping
          </Link>
          <Link
            href="/vault"
            className="px-8 py-3 border border-line bg-surface rounded-lg font-semibold text-ink hover:bg-brand-wash transition-colors"
          >
            Open Vault
          </Link>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          {STEPS.map((item) => (
            <div key={item.step} className="border border-line rounded-lg p-5 sm:p-6 bg-surface">
              <div className="text-3xl font-bold text-brand/30 mb-3">{item.step}</div>
              <h3 className="font-semibold text-lg mb-2 text-ink">{item.title}</h3>
              <p className="text-ink-muted text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-3 sm:px-4 pb-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink mb-2">
            Seven primitives, one wallet
          </h2>
          <p className="text-sm sm:text-base text-ink-muted">
            Every feature uses the same USDC and EURC you fauceted at the start.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="group border border-line rounded-lg p-5 bg-surface hover:border-brand transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-base text-ink group-hover:text-brand transition-colors">
                  {f.title}
                </span>
                <span className="text-ink-muted group-hover:text-brand transition-colors text-sm">
                  →
                </span>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">{f.blurb}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
