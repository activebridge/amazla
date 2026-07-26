import { store } from '../../store.js'

const BUTTON_STYLE = {
  background: '#1D1E1F',
  border: 'none',
  borderRadius: '50%',
  width: '36px',
  height: '36px',
  minWidth: '36px',
  minHeight: '36px',
  padding: '0',
  fontSize: '18px',
  color: '#8ab4f8',
  lineHeight: '36px',
  textAlign: 'center',
  cursor: 'pointer',
  boxSizing: 'border-box',
  boxShadow: '3px 3px 6px #0d0d0d, -2px -2px 5px #272727',
}

const OVERLAY_STYLE = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.5)',
  zIndex: 999,
  transition: 'opacity 0.3s ease',
}

const POPUP_STYLE = {
  position: 'fixed',
  top: '5%',
  left: '5%',
  width: '90%',
  bottom: '5%',
  zIndex: 1000,
  backgroundColor: '#1D1E1F',
  borderRadius: '20px',
  border: 'none',
  boxShadow: '8px 8px 16px #0a0a0a, -6px -6px 12px #2a2a2a',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  transition: 'opacity 0.3s ease, transform 0.3s ease',
}

const POPUP_HEADER = {
  position: 'relative',
  padding: '20px',
  paddingBottom: '15px',
  backgroundColor: '#151515',
  boxShadow: '0 4px 8px #0d0d0d',
  flexShrink: 0,
}

const POPUP_CONTENT = {
  padding: '20px',
  paddingTop: '15px',
  overflowY: 'auto',
  flex: 1,
}

const CLOSE_BUTTON = {
  position: 'absolute',
  top: '15px',
  right: '15px',
  borderRadius: '50%',
  width: '32px',
  height: '32px',
  minWidth: '32px',
  minHeight: '32px',
  padding: '0',
  fontSize: '18px',
  lineHeight: '32px',
  textAlign: 'center',
  color: 'white',
  background: 'linear-gradient(145deg, #e63428, #c22b20)',
  border: 'none',
  cursor: 'pointer',
  boxShadow: '2px 2px 5px #0d0d0d, -1px -1px 3px #272727',
  paddingBottom: '2px',
}

const TITLE_STYLE = {
  fontSize: '1.5rem',
  color: 'white',
  fontWeight: '600',
}

const SECTION_TITLE = {
  fontSize: '1.1rem',
  color: '#8ab4f8',
  fontWeight: '600',
  marginTop: '15px',
  marginBottom: '8px',
  display: 'block',
}

const TEXT_STYLE = {
  fontSize: '0.9rem',
  color: '#e8eaed',
  lineHeight: '1.5',
  marginBottom: '6px',
  display: 'block',
}

const HR_STYLE = {
  height: '2px',
  background: '#1D1E1F',
  margin: '15px 0',
  width: '100%',
  boxShadow: 'inset 1px 1px 2px #0d0d0d, inset -1px -1px 2px #272727',
  borderRadius: '1px',
}

const Title = (text) => Text({ style: TITLE_STYLE }, text)
const Section = (text) => Text({ style: SECTION_TITLE }, text)
const P = (text) => Text({ style: TEXT_STYLE }, text)
const Hr = () => View({ style: HR_STYLE })

export const HelpButton = () => {
  return View({ style: { position: 'relative' } }, [
    Button({
      label: '?',
      style: BUTTON_STYLE,
      onClick: () => { store.showHelp = true },
    }),

    View({
      style: {
        ...OVERLAY_STYLE,
        opacity: store.showHelp ? 1 : 0,
        pointerEvents: store.showHelp ? 'auto' : 'none',
      },
      onClick: () => { store.showHelp = false },
    }),

    View({
      style: {
        ...POPUP_STYLE,
        opacity: store.showHelp ? 1 : 0,
        pointerEvents: store.showHelp ? 'auto' : 'none',
        transform: store.showHelp ? 'translateY(0)' : 'translateY(-10px)',
      },
    }, [
      View({ style: POPUP_HEADER }, [
        Button({
          label: '×',
          style: CLOSE_BUTTON,
          onClick: () => { store.showHelp = false },
        }),
        Title('💳 Help'),
        View({
          style: {
            marginTop: '10px',
            padding: '8px 12px',
            color: 'white',
            fontSize: '14px',
            cursor: 'pointer',
            background: 'linear-gradient(145deg, #1c7efa, #1865c5)',
            borderRadius: '10px',
            textAlign: 'center',
            boxShadow: '3px 3px 6px #0d0d0d, -2px -2px 5px #272727',
          },
        }, [
          Auth({
            label: '❓ Feedback or Suggestions 🗯️',
            authorizeUrl: 'https://buymeacoffee.com/galulex',
          }),
        ]),
      ]),

      View({ style: POPUP_CONTENT }, [
        Section('🚀 Getting Started'),
        P('💳 AmazWallet keeps your loyalty and membership cards on your wrist as scannable barcodes.'),

        Hr(),

        Section('➕ Adding a Card'),
        P('• Tap the ➕ button to add a card'),
        P('• Enter a title (e.g. the shop name)'),
        P('• Enter the card number from the barcode'),
        P('• The barcode type is auto-detected'),

        Hr(),

        Section('🔖 Barcode Types'),
        P('• EAN-13 — 13-digit numeric cards'),
        P('• CODE 39 — letters & numbers'),
        P('• CODE 128 — any characters'),
        P('• QR — URLs or long text'),
        P('Tap the Type button to override auto-detect.'),

        Hr(),

        Section('⚙️ Managing Cards'),
        P('🔍 Search — filter cards by name'),
        P('🗑️ Delete — swipe a card left'),
        P('↕️ Reorder — use the ↑ handle'),

        Hr(),

        Section('⌚ On Your Watch'),
        P('🔄 Cards sync automatically'),
        P('👆 Tap a card to show its barcode full-screen'),
        P('🔦 Screen brightens for easier scanning'),
      ]),
    ]),
  ])
}
