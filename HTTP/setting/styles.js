export const BODY = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  height: "100vh",
  fontFamily: "Circular,Helvetica,Arial,sans-serif",
  fontSize: "14px",
  fontWeight: "400",
  minHeight: '100vh',
  background: "radial-gradient(250px 220px at 80% 10%, rgba(124, 197, 255, 0.95) 0%, rgba(124, 197, 255, 0.35) 38%, rgba(124, 197, 255, 0.15) 58%, rgba(124, 197, 255, 0) 70%), radial-gradient(280px 240px at 12% 88%, rgba(255, 234, 140, 0.95) 0%, rgba(255, 234, 140, 0.35) 40%, rgba(255, 234, 140, 0.12) 60%, rgba(255, 234, 140, 0) 72%), linear-gradient(135deg, #b83be4 0%, #4b33d1 55%, #3a2a8e 100%)",
  backgroundAttachment: "fixed",
  overflowY: "hidden",
}

// The header stays put and only this scrolls, so the search box and the buttons
// are always in reach.
export const MAIN = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  width: "100%",
  maxWidth: '500px',
  overflowY: "auto",
  boxSizing: 'border-box',
  // Its own stacking context under the header: rows are position: relative, so
  // without it their delete buttons paint over anything the header opens.
  position: 'relative',
  zIndex: 0,
}

// The rows' own container, inside the scroller. libs/sortable.js takes a row's
// parent as the list and that parent's parent as the scroller, so the two have
// to stay separate elements.
//
// The list's insets live here rather than on MAIN on purpose: a dragged row is
// scaled up and shadowed, and MAIN is the scroller, so it clips. Keeping the
// padding one level in means the grown row bleeds into it and stays inside
// MAIN's box — with the padding on MAIN, that bleed would be cut off.
export const LIST = {
  display: "flex",
  flexDirection: "column",
  // Fills the scroller even when the rows do not, so a row dragged into the
  // empty space below the list is still inside its container.
  flex: 1,
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 16px 32px",
}

export const HEADER_ROW = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "10px",
  width: "100%",
  maxWidth: '500px',
  // Same 16px inset as LIST, so the search box lines up with the rows.
  padding: '16px',
  boxSizing: 'border-box',
  flexShrink: 0,
  position: 'relative',
  zIndex: 2,
}

export const SEARCH_BOX = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "8px",
  flex: 1,
  minWidth: 0,
  boxSizing: 'border-box',
  position: 'relative',
  padding: '9px 14px',
  borderRadius: '18px',
  cursor: 'text',
  background: 'rgba(255, 255, 255, 0.1)',
  backdropFilter: "blur(10px)",
  border: '1px solid rgba(255, 255, 255, 0.2)',
  boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.2)',
}

export const SEARCH_ICON = {
  fontSize: '14px',
  flexShrink: 0,
}

export const SEARCH_PLACEHOLDER = {
  flex: 1,
  minWidth: 0,
  color: 'rgba(255, 255, 255, 0.5)',
  fontSize: '16px',
  lineHeight: '20px',
}

// Anchored to the right edge instead of riding the flex flow, so it sits in the
// same place whether the box is showing the placeholder or the real input — and
// inset far enough to clear the input's own clear button.
export const SEARCH_COUNT = {
  position: 'absolute',
  right: '36px',
  top: '50%',
  transform: 'translateY(-50%)',
  fontSize: '12px',
  color: 'rgba(255, 255, 255, 0.7)',
  whiteSpace: 'nowrap',
}

export const ICON_BUTTON = {
  borderRadius: '50%',
  width: '38px',
  height: '38px',
  minWidth: '38px',
  minHeight: '38px',
  padding: '0',
  boxSizing: 'border-box',
  fontSize: '18px',
  lineHeight: '1',
  textAlign: 'center',
  flexShrink: 0,
  cursor: 'pointer',
  color: 'white',
  background: 'rgba(255, 255, 255, 0.18)',
  backdropFilter: "blur(20px)",
  border: '1px solid rgba(255, 255, 255, 0.3)',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
}

export const ADD_BUTTON = {
  ...ICON_BUTTON,
  fontSize: '26px',
  paddingBottom: '3px',
  background: 'rgba(255, 255, 255, 0.5)',
  color: '#2a1e63',
}

export const PLACEHOLDER = {
  padding: '40px 20px',
  textAlign: 'center',
  color: 'rgba(255, 255, 255, 0.7)',
  fontSize: '14px',
  width: '100%',
}

// components/delete_button.js animates a row shut and then restores it, so both
// files need the same collapsed-height and spacing values.
export const ROW_MAX_HEIGHT = '96px'
export const ROW_GAP = '12px'

// One action, collapsed. The glass frame: overflow hidden so the delete button
// stays parked off its right edge until swiped in, maxHeight so deleting can
// collapse it.
export const ROW = {
  position: "relative",
  overflow: "hidden",
  width: "100%",
  maxHeight: ROW_MAX_HEIGHT,
  opacity: 1,
  marginBottom: ROW_GAP,
  borderRadius: "16px",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
  backdropFilter: "blur(20px)",
  border: "1px solid rgba(255, 255, 255, 0.3)",
  background: "rgba(255, 255, 255, 0.35)",
}

// Swipe-to-delete is a scroll-snap scroller, not a gesture handler: the content
// is a full-width snap target and the delete button sits past it, so a left
// swipe snaps the button into view.
//
// No -webkit-overflow-scrolling: touch. On iOS it promotes this scroller to its
// own compositing layer, and a promoted layer escapes its overflow clip and
// paints over position: fixed content — the delete buttons would show through
// the dialogs. Momentum scrolling is the default in iOS 13+ anyway.
export const ROW_WRAPPER = {
  display: "flex",
  flexDirection: "row",
  overflowX: "auto",
  overflowY: "hidden",
  scrollSnapType: "x mandatory",
  scrollbarWidth: "none",
  alignItems: "stretch",
  overscrollBehaviorX: "none",
  width: "100%",
}

export const ROW_CONTENT = {
  position: "relative",
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "10px",
  flexShrink: 0,
  width: "100%",
  boxSizing: "border-box",
  scrollSnapAlign: "start",
  padding: "5px 16px",
}

export const CLICK_AREA = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  flex: 1,
  minWidth: 0,
  cursor: "pointer",
}

// The glyph carries itself at this size — no plate behind it, just a shadow to
// hold it off the glass.
export const ROW_ICON = {
  flexShrink: 0,
  width: "60px",
  height: "60px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "60px",
  lineHeight: "1",
  color: "white",
  textShadow: "0 2px 6px rgba(0, 0, 0, 0.45)",
}

export const ROW_TITLE = {
  color: "white",
  textShadow: "0 2px 6px rgba(0, 0, 0, 0.45)",
  fontSize: "16px",
  fontWeight: "600",
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
}

export const ROW_TITLE_ROW = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "8px",
  minWidth: 0,
}

// Pressed into the glass: dark from the top-left where the light is blocked,
// light pooling at the bottom-right.
export const ROW_METHOD = {
  flexShrink: 0,
  padding: "2px 8px",
  borderRadius: "8px",
  fontSize: "10px",
  fontWeight: "600",
  letterSpacing: "0.5px",
  color: "rgba(255, 255, 255, 0.9)",
  background: "rgba(255, 255, 255, 0.12)",
  boxShadow:
    "inset 2px 2px 4px rgba(0, 0, 0, 0.35), inset -1px -1px 3px rgba(255, 255, 255, 0.25)",
}

export const ROW_SUB = {
  color: "rgba(255, 255, 255, 0.7)",
  fontSize: "12px",
  marginTop: "3px",
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
}

export const HANDLE = {
  color: "rgba(255, 255, 255, 0.65)",
  textShadow: "0 2px 6px rgba(0, 0, 0, 0.45)",
  fontSize: "26px",
  lineHeight: "1",
  flexShrink: 0,
  cursor: "grab",
  touchAction: "none",
  padding: "0 2px",
}

// Parked past the right edge of the row, stretched to its full height by
// cancelling ROW_CONTENT's vertical padding. Only the last one carries a snap
// point, so one swipe brings the whole pair in rather than stopping halfway.
// Tinted glass rather than paint: the row and the page gradient stay visible
// through them, and the inset pair presses them into the row — dark from the
// top-left, light pooling at the bottom-right.
const SWIPE_BUTTON_BASE = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 22px",
  margin: "-5px 0",
  flexShrink: 0,
  alignSelf: "stretch",
  cursor: "pointer",
  fontSize: "22px",
  color: "white",
  textShadow: "0 2px 6px rgba(0, 0, 0, 0.45)",
  border: "none",
  backdropFilter: "blur(12px)",
  boxShadow:
    "inset 3px 3px 8px rgba(0, 0, 0, 0.35), inset -2px -2px 6px rgba(255, 255, 255, 0.25)",
}

export const CLONE_BUTTON = {
  ...SWIPE_BUTTON_BASE,
  background:
    "linear-gradient(145deg, rgba(90, 160, 255, 0.55), rgba(40, 105, 220, 0.4))",
}

export const DELETE_BUTTON = {
  ...SWIPE_BUTTON_BASE,
  background:
    "linear-gradient(145deg, rgba(255, 110, 105, 0.55), rgba(215, 45, 45, 0.4))",
  scrollSnapAlign: "end",
}

export const CIRCLE_BUTTON_BASE = {
  position: 'absolute',
  borderRadius: '15px',
  width: '30px',
  height: '30px',
  minWidth: '30px',
  minHeight: '30px',
  maxWidth: '30px',
  maxHeight: '30px',
  padding: '0',
  margin: '0',
  boxSizing: 'border-box',
  fontSize: '18px',
  lineHeight: '30px',
  textAlign: 'center',
  backdropFilter: "blur(10px)",
  color: 'white',
  border: '1px solid rgba(255, 255, 255, 0.3)',
  cursor: 'pointer',
  flexShrink: 0,
}

export const REMOVE_BUTTON = {
  ...CIRCLE_BUTTON_BASE,
  top: '-15px',
  right: '-15px',
  background: 'rgba(255, 70, 70, 0.8)',
  boxShadow: '0 4px 16px rgba(255, 70, 70, 0.3)',
}

export const HEADER = {
  fontSize: '2rem',
  color: "white",
  textShadow: "0 2px 8px rgba(0, 0, 0, 0.4)",
  fontWeight: "600",
  marginBottom: "10px",
  textAlign: "center",
}
