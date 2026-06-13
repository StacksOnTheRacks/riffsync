import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import {
  fetchFanProfile,
  patchFanProfileDisplayName,
  uploadFanProfileAvatar,
} from '../api/fanProfileApi'
import { FAN_DISPLAY_NAME_MAX_LEN, setGuestDisplayName } from '../session/guestSession'
import type { RoomSidebarTab } from './roomPageTypes'

export function useRoomProfileTab(options: {
  fanToken: string | null
  roomSidebarTab: RoomSidebarTab
  displayName: string
  setDisplayName: (name: string) => void
  setMyAvatarUrl: (url: string | null) => void
}): {
  profileDraft: string
  setProfileDraft: (draft: string) => void
  profileSaveErr: string | null
  profileSaving: boolean
  profileAvatarUrl: string | null
  profileAvatarLoading: boolean
  profileAvatarUploading: boolean
  profileAvatarErr: string | null
  profileAvatarInputRef: RefObject<HTMLInputElement | null>
  saveProfileDisplayName: () => void
  onProfileAvatarSelected: (e: ChangeEvent<HTMLInputElement>) => void
} {
  const { fanToken, roomSidebarTab, displayName, setDisplayName, setMyAvatarUrl } = options
  const [profileDraft, setProfileDraft] = useState('')
  const [profileSaveErr, setProfileSaveErr] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null)
  const [profileAvatarLoading, setProfileAvatarLoading] = useState(false)
  const [profileAvatarUploading, setProfileAvatarUploading] = useState(false)
  const [profileAvatarErr, setProfileAvatarErr] = useState<string | null>(null)
  const profileTabLoadedRef = useRef(false)
  const profileAvatarInputRef = useRef<HTMLInputElement>(null)
  const prevRoomSidebarTabRef = useRef<RoomSidebarTab>('chat')

  useEffect(() => {
    if (roomSidebarTab === 'profile' && prevRoomSidebarTabRef.current !== 'profile') {
      setProfileDraft(displayName)
      setProfileSaveErr(null)
      setProfileAvatarErr(null)
    }
    prevRoomSidebarTabRef.current = roomSidebarTab
  }, [roomSidebarTab, displayName])

  useEffect(() => {
    if (roomSidebarTab !== 'profile' || !fanToken || profileTabLoadedRef.current) return
    profileTabLoadedRef.current = true
    let cancelled = false
    setProfileAvatarLoading(true)
    setProfileAvatarErr(null)
    void fetchFanProfile(fanToken)
      .then((p) => {
        if (cancelled) return
        setProfileAvatarUrl(p.avatarUrl)
        setMyAvatarUrl(p.avatarUrl)
      })
      .catch((e) => {
        if (cancelled) return
        setProfileAvatarErr(e instanceof Error ? e.message : 'Could not load profile.')
      })
      .finally(() => {
        if (!cancelled) setProfileAvatarLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [roomSidebarTab, fanToken, setMyAvatarUrl])

  const saveProfileDisplayName = () => {
    if (!fanToken) return
    const trimmed = profileDraft.trim().slice(0, FAN_DISPLAY_NAME_MAX_LEN)
    if (!trimmed) {
      setProfileSaveErr('Display name cannot be empty.')
      return
    }
    setProfileSaving(true)
    setProfileSaveErr(null)
    void patchFanProfileDisplayName(fanToken, trimmed)
      .then((p) => {
        const applied = setGuestDisplayName(trimmed)
        setDisplayName(applied)
        setProfileDraft(applied)
        // A display-name update must never clear the avatar. If the PATCH response omits
        // the avatar URL, keep the one already loaded instead of blanking the preview.
        if (p.avatarUrl) {
          setProfileAvatarUrl(p.avatarUrl)
          setMyAvatarUrl(p.avatarUrl)
        }
      })
      .catch((e) => {
        setProfileSaveErr(e instanceof Error ? e.message : 'Could not save profile.')
      })
      .finally(() => {
        setProfileSaving(false)
      })
  }

  const onProfileAvatarSelected = (e: ChangeEvent<HTMLInputElement>) => {
    if (!fanToken) return
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setProfileAvatarUploading(true)
    setProfileAvatarErr(null)
    void uploadFanProfileAvatar(fanToken, file)
      .then((p) => {
        setProfileAvatarUrl(p.avatarUrl)
        setMyAvatarUrl(p.avatarUrl)
      })
      .catch((err) => {
        setProfileAvatarErr(err instanceof Error ? err.message : 'Could not upload avatar.')
      })
      .finally(() => {
        setProfileAvatarUploading(false)
      })
  }

  return {
    profileDraft,
    setProfileDraft,
    profileSaveErr,
    profileSaving,
    profileAvatarUrl,
    profileAvatarLoading,
    profileAvatarUploading,
    profileAvatarErr,
    profileAvatarInputRef,
    saveProfileDisplayName,
    onProfileAvatarSelected,
  }
}
