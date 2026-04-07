import { MAIN, SECTION_TITLE } from './styles.js'
import { TESLA_LOGO } from './styles.js'

AppSettingsPage({
  build({ settingsStorage }) {
    return View({ style: MAIN }, [
      // Header Section
      View({
        style: {
          textAlign: 'center',
          marginBottom: '24px',
          paddingBottom: '16px',
          borderBottom: '1px solid #3A3B3D',
        }
      }, [
        // Tesla Logo
        Image({
          alt: 'Tesla',
          src: TESLA_LOGO,
          width: 100,
          height: 100,
          style: {
            margin: '0 auto 12px',
            display: 'block',
          }
        }),

        // Header Title
        Text({
          style: {
            fontSize: '28px',
            fontWeight: 'bold',
            margin: '0 0 8px',
            textAlign: 'center',
            width: '100%',
          }
        }, '�� Tesla Key Setup'),

        // Subtitle
        Text({
          style: {
            fontSize: '13px',
            color: '#999999',
            margin: '0',
            textAlign: 'center',
            width: '100%',
          }
        }, 'Pure Bluetooth • No Internet Required'),
      ]),

      // HOW TO PAIR
      Text({ style: SECTION_TITLE }, '🔗 How to Pair'),
      
      StepCard(1, 'Wake Tesla', 'Make sure your car is awake. Press the brake pedal, open a door, or tap a key card.'),
      StepCard(2, 'Open BLE Page', 'On your watch, go to the app and tap the BLE settings button.'),
      StepCard(3, 'Start Pairing', 'Tap the "Pair" button on the BLE page.'),
      StepCard(4, 'Use Your NFC Card', 'Hold your Tesla NFC card on the steering wheel trim (left or right side). Hold it there for 2-3 seconds.'),
      StepCard(5, 'Confirm on Tesla', 'Tesla will ask "Allow this device?" on the center screen. Tap "Confirm" with your finger or key card.'),
      StepCard(6, 'Done!', 'Your watch is now paired! Go back to the main page and test: tap lock/unlock to control your car.'),

      // HOW TO USE
      Text({ style: SECTION_TITLE }, '🎯 How to Use'),
      
      SimpleCard('Lock Your Car', 'On the main page, tap the lock button. Your car will lock immediately.'),
      SimpleCard('Unlock Your Car', 'On the main page, tap the unlock button. Your car will unlock immediately.'),
      SimpleCard('Works Offline', 'You don\'t need your phone. As long as your watch is near the car (within 30 feet), it will work.'),

      // HOW TO RESET
      Text({ style: SECTION_TITLE }, '🔄 How to Reset'),
      
      Text({ style: { fontSize: '14px', fontWeight: 'bold', color: '#CCCCCC', marginBottom: '8px' } }, 'If pairing doesn\'t work:'),
      Text({ paragraph: true, style: { fontSize: '13px', color: '#999999', marginBottom: '12px' } }, '1. On the BLE page, tap "Clear" to remove the old pairing'),
      Text({ paragraph: true, style: { fontSize: '13px', color: '#999999', marginBottom: '12px' } }, '2. Start over from "How to Pair" step 1'),
      
      // TROUBLESHOOTING
      Text({ style: SECTION_TITLE }, '❓ Troubleshooting'),
      
      FAQCard('Car won\'t lock/unlock', 'Make sure the car is nearby (within 30 feet). If still not working, go to the BLE page and tap "Connect" to re-establish connection.'),
      FAQCard('Pairing failed', 'Make sure the car is awake and within 10 feet. Try again. If still failing, restart the car.'),
      FAQCard('Card not recognized', 'Try holding the NFC card on different spots on the steering wheel - left side or right side. Some cars are more sensitive to one side.'),
      FAQCard('Says "Session not established"', 'On the BLE page, tap "Connect" to establish the connection with your car.'),
      FAQCard('App keeps asking me to pair', 'Your car was restarted or lost connection. Just open the BLE page and tap "Connect" to get back online.'),

      // Footer
      Text({ style: { fontSize: '12px', color: '#999999', margin: '24px 0 8px', textAlign: 'center' } }, '✅ Your car unlocks with a secure digital key'),
      Text({ style: { fontSize: '12px', color: '#999999', textAlign: 'center' } }, 'No data is shared or stored anywhere'),
    ])
  },
})

function StepCard(number, title, description) {
  return View({
    style: {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'flex-start',
      background: '#2A2B2D',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '12px',
      gap: '16px',
    }
  }, [
    Text({
      style: {
        background: '#4A90E2',
        color: '#000000',
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        fontWeight: 'bold',
        fontSize: '18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }
    }, String(number)),
    View({ style: { flex: 1 } }, [
      Text({ style: { fontWeight: 'bold', fontSize: '16px', marginBottom: '6px', color: '#CCCCCC' } }, title),
      Text({ paragraph: true, style: { fontSize: '13px', color: '#999999', lineHeight: '1.4' } }, description),
    ]),
  ])
}

function SimpleCard(title, description) {
  return View({
    style: {
      background: '#2A2B2D',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '12px',
    }
  }, [
    Text({ style: { fontWeight: 'bold', fontSize: '15px', marginBottom: '8px', color: '#CCCCCC' } }, title),
    Text({ paragraph: true, style: { fontSize: '13px', color: '#999999', lineHeight: '1.4' } }, description),
  ])
}

function FAQCard(question, answer) {
  return View({
    style: {
      background: '#2A2B2D',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '12px',
    }
  }, [
    Text({ style: { fontWeight: 'bold', fontSize: '14px', marginBottom: '8px', color: '#FF6B6B' } }, question),
    Text({ paragraph: true, style: { fontSize: '13px', color: '#999999', lineHeight: '1.4' } }, answer),
  ])
}
