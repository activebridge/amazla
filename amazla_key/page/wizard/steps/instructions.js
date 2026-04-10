import * as hmUI from '@zos/ui'
import { text, img, width, height } from '../../../../pages/ui.js'
import { Heading } from '../components/heading.js'
import { PrimaryButton } from '../components/button.js'

// Instructions renders Step 1: pre-pairing checklist + Start button.
export const Instructions = ({ onStart }) => {
  // Illustration — place in top 30% of screen
  img({
    centered: false,
    x: ((width - 120) / 2) | 0,
    y: (height * 0.06) | 0,
    w: 120,
    h: 120,
    src: 'wizard/instructions.png',
  })

  // Title
  Heading({ label: 'Pair Your Tesla', y: (height * 0.42) | 0 })

  // Checklist items
  const itemStyle = {
    text_size: 16,
    color: 0xaaaaaa,
    w: width,
    h: 28,
    align_h: hmUI.align.CENTER_H,
  }

  text({ centered: false, x: 0, y: (height * 0.53) | 0, ...itemStyle, text: 'Phone connected to watch' })
  text({ centered: false, x: 0, y: (height * 0.60) | 0, ...itemStyle, text: 'Tesla awake (open a door)' })
  text({ centered: false, x: 0, y: (height * 0.67) | 0, ...itemStyle, text: 'NFC key card ready' })

  // Start button
  PrimaryButton({ label: 'Start', onClick: onStart, y: (height * 0.80) | 0 })
}
