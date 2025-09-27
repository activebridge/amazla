export const BODY = {
  position: "relative",
  display: "flex",
  flexWrap: "wrap",
  flexDirection: "column",
  alignItems: "stretch",
  fontFamily: "Circular,Helvetica,Arial,sans-serif",
  fontSize: "20px",
  fontWeight: "400",
  padding: '5%',
  minHeight: '100vh',
  background: "radial-gradient(250px 220px at 80% 10%, rgba(124, 197, 255, 0.95) 0%, rgba(124, 197, 255, 0.35) 38%, rgba(124, 197, 255, 0.15) 58%, rgba(124, 197, 255, 0) 70%), radial-gradient(280px 240px at 12% 88%, rgba(255, 234, 140, 0.95) 0%, rgba(255, 234, 140, 0.35) 40%, rgba(255, 234, 140, 0.12) 60%, rgba(255, 234, 140, 0) 72%), linear-gradient(135deg, #b83be4 0%, #4b33d1 55%, #3a2a8e 100%)",
  backgroundAttachment: "fixed",
}

export const CARD = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "start",
  padding: "20px",
  color: 'white',
  gap: "20px",
  margin: "20px 0",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
  backdropFilter: "blur(20px)",
  borderRadius: "20px",
  border: "1px solid rgba(255, 255, 255, 0.3)",
  background: "rgba(255, 255, 255, 0.35)",
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

export const RAW = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gridTemplateRows: '1fr',
  placeItems: 'center',
}

export const HEADER = {
  fontSize: '2rem',
  color: "white",
}
