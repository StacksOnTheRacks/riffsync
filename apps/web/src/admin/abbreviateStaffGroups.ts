/** Visible label for Cognito groups in the session strip (abbreviated when long). */
export function abbreviateStaffGroups(groups: string[]): string {
  if (groups.length === 0) return '(none)'
  if (groups.length <= 2) return groups.join(', ')
  const shown = groups.slice(0, 2).join(', ')
  const rest = groups.length - 2
  return `${shown} (+${rest})`
}
