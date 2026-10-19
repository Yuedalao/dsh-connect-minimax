const creditNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2
});

export function providerDisplayNameWithCredit(displayName, remaining) {
  if (remaining === undefined) return displayName;
  if (remaining === "unlimited") return `${displayName} · ∞`;
  if (!Number.isFinite(remaining)) return displayName;
  return `${displayName} · ${creditNumber.format(Math.max(0, remaining))}`;
}
