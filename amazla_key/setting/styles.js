import { BG } from './bg.js'

export const BODY = {
  position: 'relative',
  display: 'flex',
  flexWrap: 'wrap',
  flexDirection: 'column',
  alignItems: 'stretch',
  fontFamily: 'Circular,Helvetica,Arial,sans-serif',
  fontSize: '14px',
  fontWeight: '400',
  minHeight: '100vh',
  backgroundImage: `linear-gradient(rgb(26 27 29) 5%, rgba(0,0,0,0.5)), url('${BG}')`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundAttachment: 'fixed',
  backdropFilter: 'blur(3px)',
  overflowY: 'hidden',
}

export const MAIN = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  width: '100%',
  margin: '0 auto',
  overflowY: 'auto',
  maxHeight: '100vh',
  padding: '5% 5% calc(5% + 88px)',
  maxWidth: '500px',
}

const SECTION_BASE = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  width: '100%',
}

export const SECTION_SETUP = { ...SECTION_BASE }
export const SECTION_PAIR = { ...SECTION_BASE }
export const SECTION_USE = { ...SECTION_BASE }

export const PROGRESS_NAV = {
  position: 'fixed',
  bottom: '16px',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: '20',
  display: 'flex',
  alignItems: 'flex-start',
  width: '220px',
  maxWidth: '460px',
  padding: '12px 12px 8px',
  borderRadius: '14px',
  backdropFilter: 'blur(18px) saturate(160%)',
  WebkitBackdropFilter: 'blur(18px) saturate(160%)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
}

const BLUE_TINT = 'rgba(70, 140, 255, 0.35), rgba(70, 140, 255, 0.12)'
const GREEN_TINT = 'rgba(60, 200, 120, 0.35), rgba(60, 200, 120, 0.12)'

export const NAV_BG_BLUE = {
  background: `linear-gradient(135deg, ${BLUE_TINT})`,
  border: '1px solid rgba(120, 180, 255, 0.35)',
}

export const NAV_BG_HALF = {
  background:
    'linear-gradient(90deg, rgba(60, 200, 120, 0.35) 0%, rgba(60, 200, 120, 0.2) 30%, rgba(70, 140, 255, 0.2) 70%, rgba(70, 140, 255, 0.35) 100%)',
  border: '1px solid rgba(140, 210, 200, 0.35)',
}

export const NAV_BG_GREEN = {
  background: `linear-gradient(135deg, ${GREEN_TINT})`,
  border: '1px solid rgba(120, 230, 160, 0.35)',
}

export const PROGRESS_STEP_ITEM = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '5px',
  minWidth: '48px',
  cursor: 'pointer',
}

export const PROGRESS_STEP = {
  width: '26px',
  height: '26px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '11px',
  fontWeight: '700',
  color: 'rgba(255, 255, 255, 0.55)',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  background: 'rgba(255, 255, 255, 0.06)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
}

export const PROGRESS_STEP_ACTIVE = {
  color: 'white',
  background: 'linear-gradient(135deg, rgba(120, 180, 255, 0.55), rgba(120, 180, 255, 0.2))',
  borderColor: 'rgba(150, 195, 255, 0.6)',
  boxShadow: '0 0 14px rgba(120, 180, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
}

export const PROGRESS_STEP_DONE = {
  color: 'white',
  background: 'linear-gradient(135deg, rgba(80, 200, 140, 0.6), rgba(60, 180, 120, 0.25))',
  borderColor: 'rgba(120, 230, 160, 0.6)',
  boxShadow: '0 0 12px rgba(60, 200, 120, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
}

export const PROGRESS_LABEL = {
  fontSize: '9px',
  fontWeight: '700',
  letterSpacing: '1.2px',
  textTransform: 'uppercase',
  color: 'rgba(255, 255, 255, 0.5)',
}

export const PROGRESS_LABEL_ACTIVE = {
  color: 'rgba(220, 236, 255, 0.95)',
}

export const PROGRESS_CONNECT = {
  flex: '1',
  height: '2px',
  marginTop: '12px',
  borderRadius: '1px',
  background: 'repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.22) 0 4px, transparent 4px 8px)',
}

export const PROGRESS_CONNECT_FILLED = {
  background: 'linear-gradient(90deg, rgba(120, 230, 160, 0.85), rgba(80, 200, 140, 0.6))',
  boxShadow: '0 0 8px rgba(80, 200, 140, 0.35)',
}

export const CARD = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  padding: '20px',
  color: 'white',
  gap: '12px',
  marginBottom: '16px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
  backdropFilter: 'blur(20px)',
  borderRadius: '16px',
  border: '1px solid rgba(255, 255, 255, 0.25)',
  background: 'rgba(255, 255, 255, 0.15)',
  width: '100%',
}

export const CARD_DONE = {
  border: '1px solid rgba(120, 230, 160, 0.4)',
  background: 'linear-gradient(135deg, rgba(60, 200, 120, 0.22), rgba(60, 200, 120, 0.08))',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2), 0 0 18px rgba(60, 200, 120, 0.2)',
}

export const STEP_BADGE = {
  background: 'rgba(255, 255, 255, 0.9)',
  color: '#1a1a2e',
  width: '24px',
  height: '24px',
  borderRadius: '50%',
  fontWeight: 'bold',
  fontSize: '16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  minWidth: '24px',
  textAlign: 'center',
  lineHeight: '24px',
}

export const VEHICLE_ROW = {
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
}

export const VEHICLE_LABEL = {
  fontSize: '16px',
  color: 'rgba(255, 255, 255, 0.7)',
  fontWeight: '500',
}

export const VEHICLE_VALUE = {
  fontSize: '18px',
  color: 'white',
  fontWeight: '600',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  letterSpacing: '2px',
  textAlign: 'right',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export const CARD_EDIT_HINT = {
  position: 'absolute',
  top: '-20px',
  right: '14px',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '5px',
  opacity: '0.75',
}

export const CARD_EDIT_ICON = {
  width: '14px',
  height: '14px',
  flexShrink: 0,
}

export const CARD_EDIT_TEXT = {
  fontSize: '12px',
  fontWeight: '600',
  color: 'white',
  letterSpacing: '0.3px',
  textTransform: 'uppercase',
}
