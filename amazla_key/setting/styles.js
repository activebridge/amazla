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
  backgroundImage: `linear-gradient(#14171d 5%, rgba(0,0,0,0.5)), url('${BG}')`,
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

export const SECTION_SETUP = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  width: '100%',
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

// "Not Paired" value + inline "How to Pair" button (only while not paired)
export const PAIRED_VALUE_ROW = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '10px',
  flex: 1,
  minWidth: 0,
}

export const PAIR_BUTTON = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '7px 14px',
  borderRadius: '10px',
  fontSize: '13px',
  fontWeight: '700',
  color: 'white',
  cursor: 'pointer',
  flexShrink: 0,
  whiteSpace: 'nowrap',
  textShadow: '0 1px 0 rgba(0, 0, 0, 0.25)',
  border: '1px solid rgba(150, 195, 255, 0.55)',
  background: 'linear-gradient(180deg, rgba(120, 180, 255, 0.6), rgba(70, 140, 255, 0.35))',
  boxShadow:
    'inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 -1px 0 rgba(0, 0, 0, 0.22), 0 4px 14px rgba(50, 120, 255, 0.4)',
}

// Floating FAQ button, bottom-right of the screen
export const FAQ_FAB = {
  position: 'fixed',
  bottom: '16px',
  right: '16px',
  zIndex: '100',
  width: '46px',
  height: '46px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '20px',
  fontWeight: '700',
  color: 'white',
  cursor: 'pointer',
  textShadow: '0 1px 0 rgba(0, 0, 0, 0.25)',
  border: '1px solid rgba(150, 195, 255, 0.55)',
  background: 'linear-gradient(180deg, rgba(120, 180, 255, 0.6), rgba(70, 140, 255, 0.35))',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  boxShadow:
    'inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 -1px 0 rgba(0, 0, 0, 0.22), 0 4px 14px rgba(50, 120, 255, 0.4)',
}

// Disabled (unpaired) state for setting cards: dimmed and visually inert
export const CARD_DISABLED = {
  opacity: '0.5',
  pointerEvents: 'none',
}

// Setting rows with a toggle switch (inside the setup card)
export const SETTING_ROW = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '16px',
}

export const SETTING_ROW_DIVIDER = {
  borderTop: '1px solid rgba(255, 255, 255, 0.12)',
  paddingTop: '14px',
  marginTop: '2px',
}

export const SETTING_TEXTS = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  flex: '1',
}

export const SETTING_TITLE = {
  fontWeight: 'bold',
  fontSize: '15px',
  color: 'white',
}

export const SETTING_DESC = {
  fontSize: '13px',
  color: 'rgba(255,255,255,0.75)',
  lineHeight: '1.5',
}

export const SWITCH_TRACK = {
  position: 'relative',
  width: '46px',
  height: '27px',
  borderRadius: '100vw',
  flexShrink: 0,
  cursor: 'pointer',
  border: '1px solid rgba(255, 255, 255, 0.25)',
  background: 'rgba(255, 255, 255, 0.12)',
  boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.35)',
  transition: 'background 200ms ease, border-color 200ms ease, box-shadow 200ms ease',
}

export const SWITCH_TRACK_ON = {
  border: '1px solid rgba(120, 230, 160, 0.6)',
  background: 'linear-gradient(135deg, rgba(80, 200, 140, 0.75), rgba(60, 180, 120, 0.45))',
  boxShadow: '0 0 12px rgba(60, 200, 120, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
}

export const SWITCH_KNOB = {
  position: 'absolute',
  top: '2px',
  left: '2px',
  width: '21px',
  height: '21px',
  borderRadius: '50%',
  background: 'white',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)',
  transition: 'transform 200ms ease',
}

export const SWITCH_KNOB_ON = {
  transform: 'translateX(19px)',
}
