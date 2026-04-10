import { BG } from './bg.js'
import { TESLA_LOGO } from './logo.js'

export { TESLA_LOGO }

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
  backgroundImage: `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.5)), url('${BG}')`,
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
  padding: '5%',
  maxWidth: '500px',
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

export const STEP_BADGE = {
  background: 'rgba(255, 255, 255, 0.9)',
  color: '#1a1a2e',
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  fontWeight: 'bold',
  fontSize: '16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  minWidth: '36px',
  textAlign: 'center',
  lineHeight: '36px',
}

export const SECTION_TITLE = {
  fontSize: '13px',
  fontWeight: '700',
  color: 'rgba(255, 255, 255, 0.6)',
  letterSpacing: '1.5px',
  textTransform: 'uppercase',
  margin: '24px 0 10px',
  textAlign: 'left',
  width: '100%',
}

export const HEADER = {
  fontSize: '28px',
  color: 'white',
  textShadow: '0 2px 12px rgba(0, 0, 0, 0.4)',
  fontWeight: '700',
  marginBottom: '4px',
  textAlign: 'center',
}

export const SUBHEADER = {
  fontSize: '13px',
  color: 'rgba(255, 255, 255, 0.65)',
  textAlign: 'center',
  marginBottom: '24px',
}

