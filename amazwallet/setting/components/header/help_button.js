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

// Same glass as the edit dialog: light scrim so the cards stay readable behind,
// a frosted panel with a lit top-left edge. Values kept in step with the
// .cd-overlay / .cd-box rules in libs/editDialog.js.
const OVERLAY_STYLE = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(10, 11, 13, 0.45)',
  WebkitBackdropFilter: 'blur(3px)',
  backdropFilter: 'blur(3px)',
  zIndex: 9999,
  transition: 'opacity 0.3s ease',
}

const POPUP_STYLE = {
  position: 'fixed',
  top: '5%',
  left: '5%',
  width: '90%',
  bottom: '5%',
  zIndex: 10000,
  background:
    'linear-gradient(145deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.04) 46%),' +
    ' rgba(30, 33, 38, 0.5)',
  WebkitBackdropFilter: 'blur(18px) saturate(160%)',
  backdropFilter: 'blur(18px) saturate(160%)',
  borderRadius: '20px',
  border: '1px solid rgba(255, 255, 255, 0.16)',
  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.22)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  transition: 'opacity 0.3s ease, transform 0.3s ease',
}

const POPUP_HEADER = {
  position: 'relative',
  padding: '20px',
  paddingBottom: '15px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.18)',
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
  color: '#e8eaed',
  // Glass disc, not a red button: closing help is not destructive, and the
  // edit dialog's ✕ is quiet for the same reason.
  background: 'rgba(255, 255, 255, 0.08)',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  cursor: 'pointer',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.2)',
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
  height: '1px',
  background: 'rgba(255, 255, 255, 0.14)',
  margin: '16px 0',
  width: '100%',
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
            // Matches .cd-save: translucent blue, light rim, colored glow.
            background:
              'linear-gradient(145deg, rgba(92, 162, 255, 0.95), rgba(28, 98, 220, 0.95))',
            border: '1px solid rgba(255, 255, 255, 0.24)',
            borderRadius: '12px',
            textAlign: 'center',
            boxShadow:
              '0 8px 20px rgba(20, 80, 200, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
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
        P('• Enter a name (e.g. the shop name)'),
        P('• Enter the number printed under the barcode'),
        P('• Pick the code type and a card colour'),

        Hr(),

        Section('🔖 Code Types'),
        P('• EAN-13 — 8 to 13 digits (EAN-13, UPC-A, EAN-8)'),
        P('• CODE 39 — letters and numbers, up to 10'),
        P('• CODE 128 — up to 20 digits, or 11 other characters'),
        P('• QR — URLs or long text'),
        P('EAN-13 checks the last digit for you — a red border means it does not match the rest of the number.'),

        Hr(),

        Section('⚙️ Managing Cards'),
        P('🔍 Search — filter by name or number'),
        P('✏️ Edit — tap a card'),
        P('🗑️ Delete — swipe a card left'),
        P('↕️ Reorder — drag the ≡ handle'),

        Hr(),

        Section('⌚ On Your Watch'),
        P('🔄 Cards sync automatically'),
        P('👆 Tap a card to show its code full-screen'),
        P('🔦 The screen brightens for easier scanning'),
        P('📱 A card can also be added as a watch widget'),
      ]),
    ]),
  ])
}
