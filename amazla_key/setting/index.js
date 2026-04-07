import { MAIN, SECTION_TITLE, CARD, STEP_NUMBER, FAQ_ITEM } from './styles.js'

AppSettingsPage({
  build({ settingsStorage }) {
    return View({ style: MAIN }, [
      // Header
      Text({
        style: {
          fontSize: '24px',
          fontWeight: 'bold',
          margin: '20px 0 10px',
          textAlign: 'center',
          width: '100%',
        }
      }, '🔐 Tesla Key Setup'),

      Text({
        style: {
          fontSize: '12px',
          color: '#999999',
          margin: '0 0 20px',
          textAlign: 'center',
          width: '100%',
        }
      }, 'Pure Bluetooth • No Internet Required'),

      // Quick Start
      Text({ style: SECTION_TITLE }, '🚀 Quick Start'),
      
      QuickStartStep(1, 'Open Tesla Key App', 'Tap watch face to launch the app'),
      QuickStartStep(2, 'Go to BLE Settings', 'Tap the "BLE" button on main screen'),
      QuickStartStep(3, 'Pair with Tesla', 'Tap Pair → Hold NFC card on steering wheel → Confirm'),
      QuickStartStep(4, "You're Ready!", '20 digital keys synced to your watch'),

      // How It Works
      Text({ style: SECTION_TITLE }, '💡 How It Works'),
      
      ExpandableSection('📱 Phone Syncs Key to Watch', 
        'Generate key on phone → Send to watch → Watch receives 20-key pool via Bluetooth. All done locally, no internet needed.'),
      ExpandableSection('⌚ Watch Works Offline', 
        'After pairing, watch works without phone. Each lock/unlock uses one key. When pool gets low, watch auto-syncs more keys from phone when nearby.'),
      ExpandableSection('🚗 Vehicle Authenticates Commands', 
        'Vehicle verifies signature on each command. Vehicle checks if key is in whitelist. Vehicle only accepts commands from your watch.'),

      // Pairing Details
      Text({ style: SECTION_TITLE }, '🔗 Detailed Pairing'),
      
      Text({ style: { fontWeight: 'bold', margin: '12px 0 8px' } }, '⚡ Before You Start:'),
      Text({ paragraph: true }, '• Tesla must be AWAKE (press brake, open door, or tap key)'),
      Text({ paragraph: true }, '• Watch must be within 10 meters of vehicle'),
      Text({ paragraph: true }, '• Both watch and vehicle must be powered'),

      Text({ style: { fontWeight: 'bold', margin: '12px 0 8px' } }, '📋 Pairing Steps:'),
      Text({ paragraph: true }, '1. Go to app → BLE Page → Tap "Clear"'),
      Text({ paragraph: true }, '2. Tap "Pair" (watch scans for Tesla)'),
      Text({ paragraph: true }, '3. Hold NFC card on STEERING WHEEL TRIM'),
      Text({ paragraph: true }, '4. Tesla shows "Allow Device?" → Tap "Confirm"'),
      Text({ paragraph: true }, '5. Wait 10 seconds for sync'),
      Text({ paragraph: true }, '6. You see "✅ Session established"'),
      Text({ paragraph: true }, '7. Go back to main page'),
      Text({ paragraph: true }, '8. Test: Tap lock/unlock → car locks/unlocks'),

      // Usage
      Text({ style: SECTION_TITLE }, '🎮 Usage Modes'),
      
      Text({ style: { fontWeight: 'bold', margin: '12px 0 8px' } }, '🏠 From Main Page (Easiest)'),
      Text({ paragraph: true }, '• Navigate to vehicle view'),
      Text({ paragraph: true }, '• Tap lock button to LOCK'),
      Text({ paragraph: true }, '• Tap unlock button to UNLOCK'),
      Text({ paragraph: true }, '• Works anywhere within Bluetooth range'),

      Text({ style: { fontWeight: 'bold', margin: '12px 0 8px' } }, '🔧 Manual Pairing (BLE Page)'),
      Text({ paragraph: true }, '• "Clear" - Remove old pairing'),
      Text({ paragraph: true }, '• "Pair" - Scan for Tesla, tap NFC card'),
      Text({ paragraph: true }, '• "Connect" - Establish BLE session'),

      // Troubleshooting
      Text({ style: SECTION_TITLE }, '🆘 Troubleshooting'),
      
      ExpandableSection('❌ Connection Failed', 
        'Restart Tesla (press brake, then power button). Ensure watch is within 10m. Check Tesla Bluetooth is enabled. Try pairing again.'),
      ExpandableSection('📡 Offline Status', 
        'Vehicle is too far away (out of range). Wake vehicle (tap steering wheel). Click "Retry" button on main page.'),
      ExpandableSection('🔑 Key Pool Empty', 
        'Bring watch near phone. Phone app automatically detects low pool and syncs 15 new keys in background. No action needed.'),
      ExpandableSection('📱 NFC Card Not Recognized', 
        'Hold card on STEERING WHEEL TRIM (not dashboard). Try different spots. Wait 2-3 seconds for reader to detect.'),
      ExpandableSection('⏱️ Session Timeout', 
        'On BLE page: click "Connect" button again to re-establish session. Then try lock/unlock command again.'),

      // Key Sync Info
      Text({ style: { fontWeight: 'bold', margin: '16px 0 8px' } }, '📱 Need to Sync Keys?'),
      Text({ paragraph: true }, 'If key pool runs low (< 5 keys), bring watch near phone. Phone app automatically detects this and syncs 15 new keys. You don\'t need to do anything—it happens automatically!'),

      // Privacy & Footer
      Text({ style: { fontWeight: 'bold', margin: '16px 0 8px', color: '#90EE90' } }, '🔐 Privacy & Security'),
      Text({ paragraph: true }, '✅ All communication is LOCAL Bluetooth'),
      Text({ paragraph: true }, '✅ No data collected or sent anywhere'),
      Text({ paragraph: true }, '✅ No internet required after pairing'),
      Text({ paragraph: true }, '✅ Your vehicle and keys stay under your control'),

      Text({ style: { fontSize: '12px', color: '#999999', margin: '16px 0', textAlign: 'center' } }, 'Version 1.0 • April 2026'),
    ])
  },
})

function QuickStartStep(number, title, description) {
  return View({
    style: {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'flex-start',
      background: '#2A2B2D',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '8px',
      gap: '12px',
    }
  }, [
    Text({
      style: {
        background: '#4A90E2',
        color: '#000000',
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }
    }, String(number)),
    View({}, [
      Text({ style: { fontWeight: 'bold', marginBottom: '4px' } }, title),
      Text({ paragraph: true, style: { fontSize: '12px', color: '#CCCCCC' } }, description),
    ]),
  ])
}

function ExpandableSection(title, content) {
  const stateKey = `expanded_${title.replace(/\W/g, '_')}`
  return View({
    style: {
      background: '#2A2B2D',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '8px',
      cursor: 'pointer',
    }
  }, [
    Text({
      style: {
        fontWeight: 'bold',
        userSelect: 'none',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
      }
    }, title),
    Text({
      paragraph: true,
      style: { fontSize: '12px', color: '#999999', marginTop: '8px' }
    }, content),
  ])
}
