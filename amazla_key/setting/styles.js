export const MAIN = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "start",
  minHeight: "100vh",
  maxWidth: "100%",
  fontFamily: "Circular,Helvetica,Arial,sans-serif",
  fontSize: "16px",
  fontWeight: "400",
  gap: '20px',
  padding: '20px',
  background: '#FFFFFF',
  overflowY: 'auto',
  overflowX: 'hidden',
}

export const CONNECT_BTN = {
  background: '#E82137',
  width: '100%',
  padding: '12px 20px',
  margin: '20px auto',
  color: '#FFFFFF',
  borderRadius: '20px',
  textAlign: 'center',
  cursor: 'pointer',
  fontSize: '14px',
  boxShadow: '0px 3px 1px -2px rgb(0 0 0 / 20%), 0px 2px 2px 0px rgb(0 0 0 / 14%), 0px 1px 5px 0px rgb(0 0 0 / 12%)',
}

export const RESET_BTN = {
  borderRadius: '20px',
  display: 'inline-block',
  boxSizing: 'border-box',
  width: '100%',
  textAlign: 'center',
  background: '#E82127',
  padding: '10px',
  color: 'white'
}

export const NAME = {
  fontSize: '2rem',
  color: '#E82127',
  width: '100%',
  margin: '20px auto',
  textAlign: 'center',
}

export const SUB = {
  fontSize: '1rem',
  width: '100%',
  margin: '20px auto',
  textAlign: 'center',
}

export const PREVIEW = {
  padding: '10px',
  textAlign: 'center',
  margin: '-20px 0 10px 0',
  borderRadius: '10px',
  border: '2px solid black',
  boxShadow: "rgba(0, 0, 0, 0.19) 0px 10px 20px, rgba(0, 0, 0, 0.23) 0px 6px 6px",
}

export const EXTERNAL_LINK = {
  color: '#E82137',
  padding: '0px',
  textAlign: 'center',
  display: 'inline-block',
  overflow: 'hidden',
  verticalAlign: 'bottom',
  cursor: 'pointer',
}

export const LOGO_SRC = 'data:image/png;base64,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'
