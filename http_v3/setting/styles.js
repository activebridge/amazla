export const BODY = {
  position: "relative",
  display: "flex",
  flexWrap: "wrap",
  flexDirection: "column",
  alignItems: "stretch",
  fontFamily: "Circular,Helvetica,Arial,sans-serif",
  fontSize: "14px",
  fontWeight: "400",
  minHeight: '100vh',
  background: "radial-gradient(250px 220px at 80% 10%, rgba(124, 197, 255, 0.95) 0%, rgba(124, 197, 255, 0.35) 38%, rgba(124, 197, 255, 0.15) 58%, rgba(124, 197, 255, 0) 70%), radial-gradient(280px 240px at 12% 88%, rgba(255, 234, 140, 0.95) 0%, rgba(255, 234, 140, 0.35) 40%, rgba(255, 234, 140, 0.12) 60%, rgba(255, 234, 140, 0) 72%), linear-gradient(135deg, #b83be4 0%, #4b33d1 55%, #3a2a8e 100%)",
  backgroundAttachment: "fixed",
  overflowY: "hidden",
}

export const MAIN = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  width: "100%",
  margin: "0 auto",
  overflowY: "auto",
  maxHeight: "100vh",
  padding: '5%',
  maxWidth: '500px',
}

export const CARD = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  padding: "20px",
  color: 'white',
  gap: "30px",
  marginBottom: "40px",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
  backdropFilter: "blur(20px)",
  borderRadius: "20px",
  border: "1px solid rgba(255, 255, 255, 0.3)",
  background: "rgba(255, 255, 255, 0.35)",
  width: "100%",
}

export const BUTTON = {
  borderRadius: '50%',
  aspectRatio: '1 / 1',
  boxSizing: 'border-box',
  width: '64px',
  height: '64px',
  fontSize: '64px',
  lineHeight: '1',
  textAlign: 'center',
  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0) 100%)',
  backdropFilter: "blur(20px)",
  color: 'white',
  paddingBottom: '14px',
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

export const SORT_BUTTON = {
  ...CIRCLE_BUTTON_BASE,
  bottom: '-15px',
  right: '-15px',
  background: 'rgba(70, 130, 255, 0.8)',
  boxShadow: '0 4px 16px rgba(70, 130, 255, 0.3)',
}

export const INPUT_STYLE = {
  background: 'rgba(255, 255, 255, 0.1)',
  backdropFilter: "blur(10px)",
  border: '1px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '12px',
  padding: '6px 16px',
  color: 'white',
  fontSize: '16px',
  fontFamily: 'inherit',
  outline: 'none',
  boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 4px rgba(0, 0, 0, 0.1)',
  minHeight: '36px',
  boxSizing: 'border-box',
}

export const INPUT_LABEL_STYLE = {
  color: 'rgba(255, 255, 255, 0.9)',
  fontSize: '14px',
  fontWeight: '500',
  marginTop: '8px',
}

export const RAW = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gridTemplateRows: '1fr',
  placeItems: 'center',
}

export const HEADER = {
  fontSize: '2rem',
  color: "white",
  textShadow: "0 2px 8px rgba(0, 0, 0, 0.4)",
  fontWeight: "600",
  marginBottom: "10px",
  textAlign: "center",
}
