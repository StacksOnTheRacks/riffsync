// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FanProfilePayload } from '../api/fanProfileApi'
import { useRoomProfileTab } from './useRoomProfileTab'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const fetchFanProfile = vi.fn<(token: string) => Promise<FanProfilePayload>>()
const patchFanProfileDisplayName =
  vi.fn<(token: string, name: string) => Promise<FanProfilePayload>>()

vi.mock('../api/fanProfileApi', () => ({
  fetchFanProfile: (token: string) => fetchFanProfile(token),
  patchFanProfileDisplayName: (token: string, name: string) =>
    patchFanProfileDisplayName(token, name),
  uploadFanProfileAvatar: vi.fn(),
}))

vi.mock('../session/guestSession', () => ({
  FAN_DISPLAY_NAME_MAX_LEN: 48,
  setGuestDisplayName: (name: string) => name,
}))

const LOADED_AVATAR = 'https://cdn.test/avatar.png'

function payload(overrides: Partial<FanProfilePayload>): FanProfilePayload {
  return {
    displayName: 'Old Name',
    updatedAt: 1,
    avatarUrl: null,
    avatarUpdatedAt: null,
    ...overrides,
  }
}

function Harness({ setMyAvatarUrl }: { setMyAvatarUrl: (url: string | null) => void }) {
  const profile = useRoomProfileTab({
    fanToken: 'token-abc',
    roomSidebarTab: 'profile',
    displayName: 'Old Name',
    setDisplayName: () => undefined,
    setMyAvatarUrl,
  })
  return (
    <div>
      <span data-testid="avatar">{profile.profileAvatarUrl ?? 'none'}</span>
      <input
        data-testid="draft"
        value={profile.profileDraft}
        onChange={(e) => profile.setProfileDraft(e.target.value)}
      />
      <button type="button" data-testid="save" onClick={profile.saveProfileDisplayName}>
        save
      </button>
    </div>
  )
}

describe('useRoomProfileTab display-name save', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    fetchFanProfile.mockReset()
    patchFanProfileDisplayName.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function avatarText() {
    return container.querySelector('[data-testid="avatar"]')?.textContent
  }

  it('keeps the avatar when the rename response omits an avatar URL', async () => {
    fetchFanProfile.mockResolvedValue(payload({ avatarUrl: LOADED_AVATAR }))
    patchFanProfileDisplayName.mockResolvedValue(payload({ displayName: 'New Name', avatarUrl: null }))
    const setMyAvatarUrl = vi.fn()

    await act(async () => {
      root.render(<Harness setMyAvatarUrl={setMyAvatarUrl} />)
    })
    await vi.waitFor(() => expect(avatarText()).toBe(LOADED_AVATAR))

    const draft = container.querySelector('[data-testid="draft"]') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!
    await act(async () => {
      setter.call(draft, 'New Name')
      draft.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      ;(container.querySelector('[data-testid="save"]') as HTMLButtonElement).click()
    })
    await vi.waitFor(() => expect(patchFanProfileDisplayName).toHaveBeenCalled())

    expect(avatarText()).toBe(LOADED_AVATAR)
    expect(setMyAvatarUrl).not.toHaveBeenCalledWith(null)
  })
})
