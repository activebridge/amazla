import { ICON_BLUETOOTH, ICON_NO_PHONE, ICON_OFFLINE } from '../icons.js'
import { TESLA_LOGO } from '../logo.js'

const LOGO = {
  margin: '0 auto 12px',
  display: 'block',
}

// Badges pinned to the top of the page, split to the left/right edges
const SUBHEADER = {
  fontSize: '12px',
  color: 'rgba(255, 255, 255, 0.9)',
  width: '100%',
  marginBottom: '16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  flexWrap: 'wrap',
}

const BADGE_BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 8px',
  borderRadius: '100vw',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
}

const BADGE_BLE = {
  ...BADGE_BASE,
  color: 'rgba(220, 236, 255, 0.95)',
  background: 'linear-gradient(135deg, rgba(70, 140, 255, 0.28), rgba(70, 140, 255, 0.12))',
  border: '1px solid rgba(120, 180, 255, 0.45)',
  boxShadow: '0 2px 10px rgba(50, 120, 255, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
}

const BADGE_OFFLINE = {
  ...BADGE_BASE,
  color: 'rgba(220, 255, 230, 0.95)',
  background: 'linear-gradient(135deg, rgba(60, 200, 120, 0.28), rgba(60, 200, 120, 0.12))',
  border: '1px solid rgba(120, 230, 160, 0.45)',
  boxShadow: '0 2px 10px rgba(40, 180, 100, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
}

const BADGE_NO_PHONE = {
  ...BADGE_BASE,
  color: 'rgba(255, 228, 225, 0.95)',
  background: 'linear-gradient(135deg, rgba(239, 83, 80, 0.28), rgba(239, 83, 80, 0.12))',
  border: '1px solid rgba(255, 140, 135, 0.45)',
  boxShadow: '0 2px 10px rgba(220, 60, 55, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
}

const ICON = {
  width: '14px',
  height: '14px',
  display: 'inline-block',
  verticalAlign: 'middle',
  flexShrink: 0,
}

export const Header = () => [
  View({ style: SUBHEADER }, [
    View({ style: BADGE_BLE }, [
      Image({ alt: 'BT', src: ICON_BLUETOOTH, width: 14, height: 14, style: ICON }),
      Text({}, 'Pure Bluetooth'),
    ]),
    View({ style: BADGE_NO_PHONE }, [
      Image({ alt: 'No phone', src: ICON_NO_PHONE, width: 14, height: 14, style: ICON }),
      Text({}, 'No Phone Needed'),
    ]),
    View({ style: BADGE_OFFLINE }, [
      Image({ alt: 'Offline', src: ICON_OFFLINE, width: 14, height: 14, style: ICON }),
      Text({}, 'Works Offline'),
    ]),
  ]),
  Image({ alt: 'Tesla', src: TESLA_LOGO, width: 72, height: 72, style: LOGO }),
]
