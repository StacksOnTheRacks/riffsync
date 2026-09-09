import { getPublicOrigin } from '../config/publicOrigin'

export const TV_LINK_PATH = '/link'

export function getTvLinkUrl(): string {
  return `${getPublicOrigin()}${TV_LINK_PATH}`
}
