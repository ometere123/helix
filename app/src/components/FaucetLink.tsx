import { CIRCLE_FAUCET_URL } from "@/lib/contracts";

export function FaucetLink() {
  return (
    <a
      href={CIRCLE_FAUCET_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="h-9 px-3 rounded-md border border-line bg-bg text-sm text-ink hover:bg-brand-wash transition-colors flex items-center whitespace-nowrap"
      title="Open Circle's Arc Testnet faucet (USDC + EURC)"
    >
      Get test tokens →
    </a>
  );
}
