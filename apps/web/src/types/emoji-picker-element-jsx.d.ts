import type { DetailedHTMLProps, HTMLAttributes } from 'react'

declare module 'emoji-picker-element' {}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'emoji-picker': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>
    }
  }
}
