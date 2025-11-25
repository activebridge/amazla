import { BUTTON, REMOVE_BUTTON } from '../styles.js'
import { Br } from './br.js'
import { Code } from './code.js'
import { H1 } from './h1.js'
import { Hr } from './hr.js'
import { P } from './p.js'

const POPUP = {
  position: 'fixed',
  top: '5%',
  left: '5%',
  width: '90%',
  bottom: '5%',
  zIndex: '100',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  borderRadius: '16px',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  textAlign: 'left',
}

const POPUP_HEADER = {
  position: 'relative',
  padding: '5%',
  paddingBottom: '10px',
  backgroundColor: 'rgba(0, 0, 0, 0.3)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  flexShrink: 0,
}

const POPUP_CONTENT = {
  padding: '5%',
  paddingTop: '10px',
  overflowY: 'auto',
  flex: 1,
}

const CLOSE_BUTTON = {
  ...REMOVE_BUTTON,
  top: '15px',
  right: '15px',
}

const HELP_ROW = {
  width: '100%',
  textAlign: 'right',
}

const HELP_BUTTON = {
  ...BUTTON,
  width: '48px',
  height: '48px',
  fontSize: '48px',
  minWidth: '48px',
  minHeight: '48px',
  paddingBottom: '2px',
}

export const Help = (store) => {
  return View({ style: HELP_ROW }, [
    Button({
      label: '❓',
      style: HELP_BUTTON,
      onClick: () => {
        store.help = true
      },
    }),
    store.help &&
      View({ style: POPUP }, [
        View({ style: POPUP_HEADER }, [
          Button({
            label: '×',
            style: CLOSE_BUTTON,
            onClick: () => {
              store.help = false
            },
          }),
          H1('📡 HTTP Help'),
        ]),

        View({ style: POPUP_CONTENT }, [
          H1('🚀 Getting Started'),
          P(
            'HTTP Client is a Postman-like app for your watch. Send HTTP requests directly from your wrist!',
          ),

          Hr(),

          H1('📝 Creating Actions'),
          Br(),
          P('1. Tap + button to add new action'),
          Br(),
          P('2. Set Title — name shown on watch'),
          Br(),
          P('3. Pick Icon — visual identifier'),
          Br(),
          P('4. Enter URL — API endpoint'),
          Br(),
          P('5. Select Method — GET, POST, etc.'),

          Hr(),

          H1('👤 Headers'),
          P('Add custom headers, one per line:'),
          Br(),
          Code('Authorization=Bearer token123\nContent-Type=application/json'),

          Hr(),

          H1('📄 Body'),
          P('For POST/PUT/PATCH requests, add body as key=value pairs.'),
          Br(),
          Code('key=value\nanother=data'),

          Hr(),

          H1('💻 JSON Response'),
          P(
            'Extract specific JSON fields using dot notation. Keys are split by dot (.) to navigate nested objects and arrays:',
          ),
          Br(),
          Code('data.user.name'),
          Br(),
          P('Use numbers for array indexes:'),
          Br(),
          Code('items.0.title'),
          Br(),
          P('Example: For response {"data":{"items":[{"msg":"Hello"}]}}'),
          Br(),
          Code('data.items.0.msg → "Hello"'),
          Br(),
          Hr(),

          H1('▶️ Running Actions'),
          Br(),
          P('• Test Here — run from phone settings'),
          Br(),
          P('• On Watch — swipe to select action, tap to run'),

          Hr(),

          H1('💡 Tips'),
          Br(),
          P('• Use ↑ button to reorder actions'),
          Br(),
          P('• Use × button to delete action'),
          Br(),

          Hr(),

          H1('🔄 Widgets'),
          Br(),
          P('• Widgets can display maximum 4 actions (first four will be shown)'),
          Br(),
          P(
            '• After changing settings, remove and re-add the widget on your watch to refresh',
          ),

          Hr(),

          H1('🔘 Button Mode'),
          Br(),
          P('• You can assign an action to the physical button press'),
          Br(),
          P('• Use long press to exit the app'),

          Hr(),

          H1('👀 Result Display'),
          Br(),
          P('• 🍞 Toast — brief message at top of screen'),
          Br(),
          P('• 🔔 Notification — system notification'),
          Br(),
          P('• 💬 Alert — popup dialog (on widgets will show as toast)'),

          Hr(),

          H1('⚡ App Behavior'),
          Br(),
          P('• 💡 Keep Screen On — app stops when screen turns off, enable this to complete long requests'),
          Br(),
          P('• 🔚 Exit on Success — automatically closes the app when request succeeds'),
        ]),
      ]),
  ])
}
