// A plain link styled to match the Buy Me a Coffee button (same colors,
// text, and coffee-cup mark as the official embeddable widget), rather than
// the official <script> widget itself. That widget wasn't reliably showing
// up in production — it's the kind of third-party script ad blockers
// commonly flag, and its exact injected markup isn't something that could
// be verified from this environment (its CDN is network-blocked here). A
// plain anchor tag has no such failure modes: it always renders.
export default function BuyMeACoffeeButton() {
  return (
    <a
      href="https://www.buymeacoffee.com/jeremiahninteman"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold transition-transform hover:scale-105"
      style={{
        backgroundColor: "#FFDD00",
        borderColor: "#000000",
        color: "#000000",
        fontFamily: "var(--font-bree-serif), serif",
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 9h13a3 3 0 0 1 0 6h-1"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M4 9h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9Z"
          fill="#ffffff"
        />
        <path
          d="M8 3.5c0 1-1 1-1 2s1 1 1 2M12 3.5c0 1-1 1-1 2s1 1 1 2"
          stroke="#ffffff"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      Buy me a coffee
    </a>
  );
}
