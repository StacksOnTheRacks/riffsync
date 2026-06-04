/** True when the operator session includes the Cognito `admin` group (delete and other admin-only APIs). */
export function staffHasAdminGroup(groups: string[]): boolean {
  return groups.includes('admin')
}
