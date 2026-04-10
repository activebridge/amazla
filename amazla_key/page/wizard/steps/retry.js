import * as hmUI from '@zos/ui'
import { text, img, width, height } from '../../../../pages/ui.js'
import { Heading } from '../components/heading.js'
import { PrimaryButton } from '../components/button.js'

// Retry renders Step 4: error state with a message and retry action.
export const Retry = ({ message, onRetry }) => {
  img({
    centered: false,
    x: ((width - 120) / 2) | 0,
    y: (height * 0.06) | 0,
    w: 120,
    h: 120,
    src: 'wizard/error.png',
  })

  Heading({ label: 'Pairing Failed', y: (height * 0.42) | 0 })

  text({
    centered: false,
    x: 20,
    y: (height * 0.56) | 0,
    w: width - 40,
    h: 60,
    text: message || 'Something went wrong.\nPlease try again.',
    text_size: 15,
    color: 0xff6666,
    align_h: hmUI.align.CENTER_H,
    align_v: hmUI.align.CENTER_V,
    text_style: hmUI.text_style.WRAP,
  })

  PrimaryButton({ label: 'Try Again', onClick: onRetry, y: (height * 0.80) | 0 })
}
