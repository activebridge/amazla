import { TESLA_LOGO } from '../logo.js'

const LOGO = {
  margin: '0 auto 12px',
  display: 'block',
}

export const Header = () => [Image({ alt: 'Tesla', src: TESLA_LOGO, width: 72, height: 72, style: LOGO })]
