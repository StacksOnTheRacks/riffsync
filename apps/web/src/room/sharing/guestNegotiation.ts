/** True when the guest should ask the host to (re)publish — no stream yet or all remote tracks ended. */
export function guestNeedsHostNegotiation(remote: MediaStream | null): boolean {
  if (!remote) return true
  return !remote.getTracks().some((t) => t.readyState === 'live')
}
