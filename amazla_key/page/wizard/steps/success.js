import * as hmUI from '@zos/ui'
import { text, img, width, height } from '../../../../pages/ui.js'
import { Heading } from '../components/heading.js'
import { PrimaryButton } from '../components/button.js'

// Success renders Step 3: confirmation that pairing completed.
export const Success = ({ onHome }) => {
  img({
    centered: false,
    x: ((width - 120) / 2) | 0,
    y: (height * 0.06) | 0,
    w: 120,
    h: 120,
    src: 'wizard/success.png',
  })

  Heading({ label: 'Tesla Paired!', y: (height * 0.42) | 0 })

  text({
    centered: false,
    x: 0,
    y: (height * 0.56) | 0,
    w: width,
    h: 28,
    text: 'Your watch is now a digital key',
    text_size: 16,
    color: 0x44cc66,
    align_h: hmUI.align.CENTER_H,
    align_v: hmUI.align.CENTER_V,
  })

  PrimaryButton({ label: 'Go Home', onClick: onHome, y: (height * 0.80) | 0 })
}
