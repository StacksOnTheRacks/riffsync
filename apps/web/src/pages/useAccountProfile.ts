import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import {
  fetchFanProfile,
  patchFanProfileDisplayName,
  uploadFanProfileAvatar,
} from '../api/fanProfileApi'
import { FAN_DISPLAY_NAME_MAX_LEN, setGuestDisplayName } from '../session/guestSession'

export function useAccountProfile(fanToken: string | null): {
  profileDraft: string
  setProfileDraft: (draft: string) => void
  profileSaveErr: string | null
  profileSaving: boolean
  profileLoading: boolean
  profileLoadErr: string | null
  profileAvatarUrl: string | null
  profileAvatarLoading: boolean
  profileAvatarUploading: boolean
  profileAvatarErr: string | null
  profileAvatarInputRef: RefObject<HTMLInputElement | null>
  saveProfileDisplayName: () => void
  onProfileAvatarSelected: (e: ChangeEvent<HTMLInputElement>) => void
} {
  const [profileDraft, setProfileDraft] = useState('')
  const [profileSaveErr, setProfileSaveErr] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileLoadErr, setProfileLoadErr] = useState<string | null>(null)
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null)
  const [profileAvatarLoading, setProfileAvatarLoading] = useState(false)
  const [profileAvatarUploading, setProfileAvatarUploading] = useState(false)
  const [profileAvatarErr, setProfileAvatarErr] = useState<string | null>(null)
  const profileAvatarInputRef = useRef<HTMLInputElement>(null)
  const loadedForTokenRef = useRef<string | null>(null)

  useEffect(() => {
    if (!fanToken) return
    if (loadedForTokenRef.current === fanToken) return
    loadedForTokenRef.current = fanToken
    let cancelled = false
    setProfileLoading(true)
    setProfileAvatarLoading(true)
    setProfileLoadErr(null)
    setProfileAvatarErr(null)
    void fetchFanProfile(fanToken)
      .then((p) => {
        if (cancelled) return
        const name = p.displayName?.trim() ?? ''
        setProfileDraft(name)
        setProfileAvatarUrl(p.avatarUrl)
      })
      .catch((e) => {
        if (cancelled) return
        setProfileLoadErr(e instanceof Error ? e.message : 'Could not load profile.')
      })
      .finally(() => {
        if (!cancelled) {
          setProfileLoading(false)
          setProfileAvatarLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [fanToken])

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
        setProfileDraft(applied)
        if (p.avatarUrl) {
          setProfileAvatarUrl(p.avatarUrl)
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
    profileLoading,
    profileLoadErr,
    profileAvatarUrl,
    profileAvatarLoading,
    profileAvatarUploading,
    profileAvatarErr,
    profileAvatarInputRef,
    saveProfileDisplayName,
    onProfileAvatarSelected,
  }
}
