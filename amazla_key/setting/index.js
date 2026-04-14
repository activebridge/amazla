import { BODY, CARD, HEADER, MAIN, SECTION_TITLE, STEP_BADGE, SUBHEADER, TESLA_LOGO } from './styles.js'

AppSettingsPage({
  build({ settingsStorage }) {
    return View({ style: BODY }, [
      View({ style: MAIN }, [

        // Header
        Image({
          alt: 'Tesla',
          src: TESLA_LOGO,
          width: 72,
          height: 72,
          style: { margin: '24px auto 12px', display: 'block' }
        }),
        Text({ style: HEADER }, 'Tesla Key Setup'),
        Text({ paragraph: true, style: SUBHEADER }, 'Pure Bluetooth • No Internet Required'),

        // Allow entering vehicle name and VIN from settings (saved to settingsStorage)
        View({ style: CARD }, [
          Text({ paragraph: true, bold: true }, 'Vehicle Name'),
          TextInput({
            label: 'Vehicle Name',
            value: settingsStorage.getItem('vehicleName') || '',
            onChange: val => settingsStorage.setItem('vehicleName', val),
          }),
          Text({ paragraph: true, bold: true, style: { marginTop: 8 } }, 'Vehicle VIN'),
          TextInput({
            label: 'Vehicle VIN',
            value: settingsStorage.getItem('vehicleVin') || '',
            onChange: val => settingsStorage.setItem('vehicleVin', val),
          }),
        ]),

        // HOW TO PAIR
        Text({ style: SECTION_TITLE }, 'How to Pair'),
        StepCard(1, 'Wake Tesla', 'Make sure your car is awake. Press the brake pedal, open a door, or tap a key card.'),
        StepCard(2, 'Open BLE Page', 'On your watch, go to the app and tap the BLE settings button.'),
        StepCard(3, 'Start Pairing', 'Tap the "Pair" button on the BLE page.'),
        StepCard(4, 'Use Your NFC Card', 'Hold your Tesla NFC card on the steering wheel trim (left or right side). Hold it there for 2–3 seconds.'),
        StepCard(5, 'Confirm on Tesla', 'Tesla will ask "Allow this device?" on the center screen. Tap "Confirm" with your finger or key card.'),
        StepCard(6, 'Done!', 'Your watch is now paired! Go back to the main page and test: tap lock/unlock to control your car.'),

        // HOW TO USE
        Text({ style: SECTION_TITLE }, 'How to Use'),
        SimpleCard('Lock Your Car', 'On the main page, tap the lock button. Your car will lock immediately.'),
        SimpleCard('Unlock Your Car', 'On the main page, tap the unlock button. Your car will unlock immediately.'),
        SimpleCard('Works Offline', "You don't need your phone. As long as your watch is near the car (within 30 feet), it will work."),

        // HOW TO RESET
        Text({ style: SECTION_TITLE }, 'How to Reset'),
        View({ style: CARD }, [
          Text({ style: { fontWeight: 'bold', fontSize: '14px', color: 'white', marginBottom: '6px' } }, 'If pairing does not work:'),
          Text({ paragraph: true, style: { fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: '1.6' } }, '1. On the BLE page, tap "Clear" to remove the old pairing'),
          Text({ paragraph: true, style: { fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: '1.6' } }, '2. Start over from "How to Pair" step 1'),
        ]),

        // TROUBLESHOOTING
        Text({ style: SECTION_TITLE }, 'Troubleshooting'),
        FAQCard('Car will not lock/unlock', 'Make sure the car is nearby (within 30 feet). If still not working, go to the BLE page and tap "Connect" to re-establish connection.'),
        FAQCard('Pairing failed', 'Make sure the car is awake and within 10 feet. Try again. If still failing, restart the car.'),
        FAQCard('Card not recognized', 'Try holding the NFC card on different spots on the steering wheel — left side or right side. Some cars are more sensitive to one side.'),
        FAQCard('Says "Session not established"', 'On the BLE page, tap "Connect" to establish the connection with your car.'),
        FAQCard('App keeps asking me to pair', 'Your car was restarted or lost connection. Just open the BLE page and tap "Connect" to get back online.'),

        // Footer
        Text({ style: { fontSize: '12px', color: 'rgba(255,255,255,0.5)', margin: '24px 0 4px', textAlign: 'center' } }, 'Your car unlocks with a secure digital key'),
        Text({ style: { fontSize: '12px', color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: '32px' } }, 'No data is shared or stored anywhere'),
      ]),
    ])
  },
})

function StepCard(number, title, description) {
  return View({
    style: {
      ...CARD,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: '14px',
    }
  }, [
    Text({
      style: STEP_BADGE,
    }, String(number)),
    View({ style: { flex: 1 } }, [
      Text({ style: { fontWeight: 'bold', fontSize: '15px', marginBottom: '5px', color: 'white' } }, title),
      Text({ paragraph: true, style: { fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: '1.5' } }, description),
    ]),
  ])
}

function SimpleCard(title, description) {
  return View({ style: CARD }, [
    Text({ style: { fontWeight: 'bold', fontSize: '15px', marginBottom: '5px', color: 'white' } }, title),
    Text({ paragraph: true, style: { fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: '1.5' } }, description),
  ])
}

function FAQCard(question, answer) {
  return View({ style: CARD }, [
    Text({ style: { fontWeight: 'bold', fontSize: '14px', marginBottom: '5px', color: 'rgba(255, 180, 180, 1)' } }, question),
    Text({ paragraph: true, style: { fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: '1.5' } }, answer),
  ])
}
