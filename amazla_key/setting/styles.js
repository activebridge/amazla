// Flat dark theme in Tesla's in-car UI language: solid surfaces, pill controls,
// blue accent toggles, hairline dividers — no gradients, blur, or glow.
const BG = '#171a1c'
const PANEL = '#24272b'
const CONTROL = '#3a3e44'
const BUTTON = '#393c41'
const BLUE = '#3e6ae1'
const TEXT = '#e8eaed'
const TEXT_DIM = 'rgba(255, 255, 255, 0.55)'

export const BODY = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  fontFamily: 'Circular,Helvetica,Arial,sans-serif',
  fontSize: '14px',
  fontWeight: '400',
  minHeight: '100vh',
  background: BG,
  color: TEXT,
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
  color: TEXT,
  gap: '12px',
  marginBottom: '16px',
  borderRadius: '12px',
  background: PANEL,
  width: '100%',
}

export const VEHICLE_ROW = {
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
}

export const VEHICLE_LABEL = {
  fontSize: '15px',
  color: TEXT_DIM,
  fontWeight: '500',
}

export const VEHICLE_VALUE = {
  fontSize: '17px',
  color: TEXT,
  fontWeight: '600',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  letterSpacing: '2px',
  textAlign: 'right',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

// Paired date gets a quiet green confirmation tint
export const VEHICLE_VALUE_OK = {
  color: 'rgb(120, 230, 160)',
}

export const CARD_EDIT_HINT = {
  position: 'absolute',
  top: '-20px',
  right: '14px',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '5px',
  opacity: '0.65',
  cursor: 'pointer',
}

export const CARD_EDIT_ICON = {
  width: '14px',
  height: '14px',
  flexShrink: 0,
}

export const CARD_EDIT_TEXT = {
  fontSize: '12px',
  fontWeight: '600',
  color: TEXT,
  letterSpacing: '0.3px',
  textTransform: 'uppercase',
}

// "Not set"/"Not Paired" value + inline action button
export const PAIRED_VALUE_ROW = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '10px',
  flex: 1,
  minWidth: 0,
}

// Footer feature line: inline icons + muted copy text
export const FOOTER_FEATURES = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  flexWrap: 'wrap',
  gap: '6px',
  fontSize: '12px',
  color: 'rgba(255, 255, 255, 0.4)',
  textAlign: 'center',
  marginBottom: '16px',
}

export const FOOTER_FEATURE_ICON = {
  width: '13px',
  height: '13px',
  flexShrink: 0,
  opacity: '0.75',
}

// Tap target around the ⓘ info icon (opens the pairing steps)
export const INFO_ICON_BUTTON = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px',
  cursor: 'pointer',
  flexShrink: 0,
}

// Flat gray action button (Tesla secondary action, e.g. "Ausschalten")
export const PAIR_BUTTON = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '8px 16px',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: '500',
  color: TEXT,
  cursor: 'pointer',
  flexShrink: 0,
  whiteSpace: 'nowrap',
  background: BUTTON,
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
  fontWeight: '600',
  color: TEXT,
  cursor: 'pointer',
  background: PANEL,
  border: `1px solid ${CONTROL}`,
  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.4)',
}

// Disabled (unpaired) state for setting rows: dimmed and visually inert
export const CARD_DISABLED = {
  opacity: '0.5',
  pointerEvents: 'none',
}

// Setting rows: Tesla layout — toggle on the left, label + helper on the right
export const SETTING_ROW = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: '14px',
}

export const SETTING_ROW_DIVIDER = {
  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
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
  fontWeight: '500',
  fontSize: '15px',
  color: TEXT,
}

export const SETTING_DESC = {
  fontSize: '13px',
  color: TEXT_DIM,
  lineHeight: '1.5',
}

// Tesla-style toggle: gray pill → blue when on, flat white knob
export const SWITCH_TRACK = {
  position: 'relative',
  width: '46px',
  height: '27px',
  borderRadius: '100vw',
  flexShrink: 0,
  cursor: 'pointer',
  background: CONTROL,
  transition: 'background 200ms ease',
}

export const SWITCH_TRACK_ON = {
  background: BLUE,
}

export const SWITCH_KNOB = {
  position: 'absolute',
  top: '3px',
  left: '3px',
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
