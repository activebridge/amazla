import { ICON_BLUETOOTH, ICON_OFFLINE } from '../icons.js'
import { TESLA_LOGO } from '../logo.js'

const LOGO = {
  margin: '0 auto 12px',
  display: 'block',
}

const SUBHEADER = {
  fontSize: '12px',
  color: 'rgba(255, 255, 255, 0.9)',
  textAlign: 'center',
  marginBottom: '24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
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

const ICON = {
  width: '14px',
  height: '14px',
  display: 'inline-block',
  verticalAlign: 'middle',
  flexShrink: 0,
}

export const Header = () => [
  Image({ alt: 'Tesla', src: TESLA_LOGO, width: 72, height: 72, style: LOGO }),
  View({ style: SUBHEADER }, [
    View({ style: BADGE_BLE }, [
      Image({ alt: 'BT', src: ICON_BLUETOOTH, width: 14, height: 14, style: ICON }),
      Text({}, 'Pure Bluetooth'),
    ]),
    View({ style: BADGE_OFFLINE }, [
      Image({ alt: 'Offline', src: ICON_OFFLINE, width: 14, height: 14, style: ICON }),
      Text({}, 'Works Offline'),
    ]),
  ]),
]
