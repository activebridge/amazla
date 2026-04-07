import { Section } from './section.js'
import { InstructionStep } from './instructionStep.js'
import { ExpandableCardView } from './expandableCard.js'
import { COLORS, SPACING, TYPOGRAPHY } from '../styles.js'

const STYLES = {
  content: {
    padding: SPACING.lg,
  },
  sectionTitle: {
    ...TYPOGRAPHY.sectionTitle,
    borderLeft: `4px solid ${COLORS.accent}`,
    paddingLeft: SPACING.md,
    marginTop: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  cardStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: SPACING.md,
  },
  card: {
    background: COLORS.surface,
    borderRadius: '8px',
    padding: SPACING.lg,
    boxShadow: `0 4px 8px ${COLORS.shadow}`,
  },
  cardTitle: {
    ...TYPOGRAPHY.cardTitle,
    marginBottom: SPACING.md,
  },
  cardText: {
    ...TYPOGRAPHY.body,
    marginBottom: SPACING.sm,
  },
  listItem: {
    ...TYPOGRAPHY.body,
    marginLeft: SPACING.lg,
    marginBottom: SPACING.sm,
  },
}

const faqItems = [
  {
    title: '❌ "Connection Failed"',
    content: 'Restart Tesla (press brake, then power button). Ensure watch is within 10m of vehicle. Check Tesla Bluetooth is enabled (not Airplane mode). Try pairing again.',
  },
  {
    title: '📡 "Offline Status" on Main Page',
    content: 'Vehicle is too far away (out of Bluetooth range). Wake vehicle (tap steering wheel). Click "Retry" button on main page to re-establish connection.',
  },
  {
    title: '🔑 "Key Pool Empty"',
    content: 'Bring watch near phone. Phone app detects low pool (< 5 keys) and syncs 15 new keys automatically in background. No action needed from you.',
  },
  {
    title: '📱 "NFC Card Not Recognized"',
    content: 'Hold card on STEERING WHEEL TRIM (not dashboard). Try different spots. Wait 2-3 seconds for reader to detect card.',
  },
  {
    title: '⏱️ "Session Timeout"',
    content: 'On BLE page: click "Connect" button again. Re-establishes BLE session with vehicle. Then try lock/unlock command again.',
  },
]

const howItWorksItems = [
  {
    title: '📱 Phone Syncs Key to Watch',
    content: 'Open phone app → Generate or import Tesla key → Click "Send to Watch" → Watch receives initial 20-key pool via Bluetooth. All done locally, no internet.',
  },
  {
    title: '⌚ Watch Works Offline',
    content: 'After pairing, watch works without phone. Each lock/unlock uses one key. After using 15+ keys, watch automatically syncs more from phone when nearby. Watch always maintains 20-key pool.',
  },
  {
    title: '🚗 Vehicle Authenticates Commands',
    content: 'Vehicle verifies cryptographic signature on each command. Vehicle checks key in whitelist. Vehicle ONLY accepts commands from YOUR watch. No Tesla app needed.',
  },
]

export const Body = () => {
  return View({ style: STYLES.content }, [
    // Quick Start Section
    Text({ style: STYLES.sectionTitle }, '🚀 Quick Start'),
    View({ style: STYLES.cardStack }, [
      InstructionStep({
        number: 1,
        title: 'Open Tesla Key App',
        description: 'Tap watch face to launch the app',
        icon: '⌚',
      }),
      InstructionStep({
        number: 2,
        title: 'Go to BLE Settings',
        description: 'Tap the "BLE" button on the main vehicle screen',
        icon: '⚙️',
      }),
      InstructionStep({
        number: 3,
        title: 'Pair with Tesla',
        description: 'Tap "Pair" → Hold NFC card on steering wheel trim → Tesla shows "Allow?" → Tap "Confirm"',
        icon: '🔑',
      }),
      InstructionStep({
        number: 4,
        title: 'You\'re Ready!',
        description: '20 digital keys synced to your watch. Lock/Unlock from main screen.',
        icon: '✅',
      }),
    ]),

    // How It Works Section
    Text({ style: STYLES.sectionTitle }, '💡 How It Works'),
    View({ style: STYLES.cardStack }, [
      ...howItWorksItems.map((item, idx) => 
        ExpandableCardView({
          title: item.title,
          content: item.content,
          state: { isExpanded: false },
        })
      ),
    ]),

    // Pairing Workflow Section
    Text({ style: STYLES.sectionTitle }, '🔗 Detailed Pairing Workflow'),
    View({ style: STYLES.card }, [
      Text({ style: STYLES.cardTitle }, '⚡ Before You Start'),
      Text({ style: STYLES.cardText }, '• Tesla must be AWAKE (press brake, open door, or use key)'),
      Text({ style: STYLES.cardText }, '• Watch must be within 10 meters of vehicle'),
      Text({ style: STYLES.cardText }, '• Both watch and vehicle must be powered'),
    ]),
    View({ style: STYLES.card }, [
      Text({ style: STYLES.cardTitle }, '📋 Pairing Steps'),
      Text({ style: STYLES.cardText }, '1. Go to app → BLE Page → Tap "Clear"'),
      Text({ style: STYLES.cardText }, '2. Tap "Pair" (watch scans for Tesla)'),
      Text({ style: STYLES.cardText }, '3. Hold NFC card on STEERING WHEEL TRIM'),
      Text({ style: STYLES.cardText }, '4. Tesla shows "Allow Device?" → Tap "Confirm"'),
      Text({ style: STYLES.cardText }, '5. Wait 10 seconds for sync (whitelist + 20 keys)'),
      Text({ style: STYLES.cardText }, '6. You see "✅ Session established"'),
      Text({ style: STYLES.cardText }, '7. Go back to main page'),
      Text({ style: STYLES.cardText }, '8. Test: Tap lock/unlock → car locks/unlocks'),
    ]),

    // Usage Guide Section
    Text({ style: STYLES.sectionTitle }, '🎮 Usage Modes'),
    View({ style: STYLES.card }, [
      Text({ style: STYLES.cardTitle }, '🏠 From Main Page (Easiest)'),
      Text({ style: STYLES.cardText }, '• Navigate to vehicle view'),
      Text({ style: STYLES.cardText }, '• Tap lock button to LOCK'),
      Text({ style: STYLES.cardText }, '• Tap unlock button to UNLOCK'),
      Text({ style: STYLES.cardText }, '• Works anywhere within Bluetooth range'),
    ]),
    View({ style: STYLES.card }, [
      Text({ style: STYLES.cardTitle }, '🔧 Manual Pairing (BLE Page)'),
      Text({ style: STYLES.cardText }, '• "Clear" - Remove old pairing if needed'),
      Text({ style: STYLES.cardText }, '• "Pair" - Scan for Tesla, tap NFC card'),
      Text({ style: STYLES.cardText }, '• "Connect" - Establish BLE session'),
      Text({ style: STYLES.cardText }, '• Now commands work'),
    ]),

    // Troubleshooting Section
    Text({ style: STYLES.sectionTitle }, '🆘 Troubleshooting'),
    View({ style: STYLES.cardStack }, [
      ...faqItems.map((item, idx) => 
        ExpandableCardView({
          title: item.title,
          content: item.content,
          state: { isExpanded: false },
        })
      ),
    ]),

    // Additional Info
    View({ style: STYLES.card }, [
      Text({ style: STYLES.cardTitle }, '📱 Need to Sync Keys?'),
      Text({ style: STYLES.cardText, paragraph: true }, 
        'If key pool runs low (< 5 keys), bring watch near your phone. ' +
        'Phone app automatically detects this and syncs 15 new keys in background. ' +
        'You don\'t need to do anything—it happens automatically!'
      ),
    ]),
  ])
}
