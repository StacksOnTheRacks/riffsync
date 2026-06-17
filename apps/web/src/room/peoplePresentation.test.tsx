// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PeopleRowAvIndicators } from './PeopleRowAvIndicators'
import { shouldShowPeopleAvIndicators, peopleAvAriaLabel } from './peoplePresentation'
import { EMPTY_PARTICIPANT_PRODUCER_SNAPSHOT } from './participantProducerRegistry'

describe('peoplePresentation', () => {
  describe('peopleAvAriaLabel', () => {
    it('distinguishes mic muted from mic off', () => {
      expect(
        peopleAvAriaLabel({
          hasVideoProducer: true,
          hasAudioProducer: false,
          audioPaused: false,
        }),
      ).toBe('camera on, microphone off')

      expect(
        peopleAvAriaLabel({
          hasVideoProducer: true,
          hasAudioProducer: true,
          audioPaused: true,
        }),
      ).toBe('camera on, microphone muted')

      expect(
        peopleAvAriaLabel({
          hasVideoProducer: false,
          hasAudioProducer: true,
          audioPaused: false,
        }),
      ).toBe('camera off, microphone on')

      expect(
        peopleAvAriaLabel(
          {
            hasVideoProducer: true,
            hasAudioProducer: true,
            audioPaused: false,
          },
          true,
        ),
      ).toBe('camera on, microphone on, speaking')
    })
  })

  describe('shouldShowPeopleAvIndicators', () => {
    it('shows remote rows for guests and own row only when signed in', () => {
      expect(shouldShowPeopleAvIndicators('remote', 'self', null)).toBe(true)
      expect(shouldShowPeopleAvIndicators('self', 'self', null)).toBe(false)
      expect(shouldShowPeopleAvIndicators('self', 'self', 'jwt')).toBe(true)
    })
  })

  describe('PeopleRowAvIndicators', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
      container = document.createElement('div')
      document.body.appendChild(container)
      root = createRoot(container)
    })

    afterEach(() => {
      act(() => root.unmount())
      container.remove()
    })

    it('renders cam on and mic muted classes', () => {
      act(() => {
        root.render(
          <PeopleRowAvIndicators
            snapshot={{
              hasVideoProducer: true,
              hasAudioProducer: true,
              audioPaused: true,
            }}
          />,
        )
      })

      expect(container.querySelector('.riffsync-room-page__people-av-icon--on')).not.toBeNull()
      expect(container.querySelector('.riffsync-room-page__people-av-icon--muted')).not.toBeNull()
      expect(container.querySelector('[aria-label="camera on, microphone muted"]')).not.toBeNull()
    })

    it('includes speaking in aria-label when active', () => {
      act(() => {
        root.render(
          <PeopleRowAvIndicators
            snapshot={{
              hasVideoProducer: false,
              hasAudioProducer: true,
              audioPaused: false,
            }}
            speaking
          />,
        )
      })
      expect(
        container.querySelector('[aria-label="camera off, microphone on, speaking"]'),
      ).not.toBeNull()
    })

    it('renders cam off mic off when snapshot is empty', () => {
      act(() => {
        root.render(<PeopleRowAvIndicators snapshot={EMPTY_PARTICIPANT_PRODUCER_SNAPSHOT} />)
      })

      const offIcons = container.querySelectorAll('.riffsync-room-page__people-av-icon--off')
      expect(offIcons.length).toBe(2)
    })
  })
})
