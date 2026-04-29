import { H2 } from './components/h2.js'
import { Header } from './components/header.js'
import { ICON_PENCIL } from './icons.js'
import { openVehicleDialog } from './libs/vinInput.js'
import {
  BODY,
  CARD,
  CARD_DONE,
  CARD_EDIT_HINT,
  CARD_EDIT_ICON,
  CARD_EDIT_TEXT,
  MAIN,
  NAV_BG_BLUE,
  NAV_BG_GREEN,
  NAV_BG_HALF,
  PROGRESS_CONNECT,
  PROGRESS_CONNECT_FILLED,
  PROGRESS_LABEL,
  PROGRESS_LABEL_ACTIVE,
  PROGRESS_NAV,
  PROGRESS_STEP,
  PROGRESS_STEP_ACTIVE,
  PROGRESS_STEP_DONE,
  PROGRESS_STEP_ITEM,
  SECTION_PAIR,
  SECTION_SETUP,
  SECTION_USE,
  STEP_BADGE,
  VEHICLE_LABEL,
  VEHICLE_ROW,
  VEHICLE_VALUE,
} from './styles.js'

const scrollToSection = (e, sectionIdx) => {
  const item = e.currentTarget || e.target
  const main = item && item.parentElement && item.parentElement.parentElement
  const section = main && main.children[sectionIdx]
  if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const navStep = (label, status, index) => {
  const circleStyle =
    status === 'done'
      ? { ...PROGRESS_STEP, ...PROGRESS_STEP_DONE }
      : status === 'active'
        ? { ...PROGRESS_STEP, ...PROGRESS_STEP_ACTIVE }
        : PROGRESS_STEP
  const labelStyle = status === 'todo' ? PROGRESS_LABEL : { ...PROGRESS_LABEL, ...PROGRESS_LABEL_ACTIVE }
  return View({ style: PROGRESS_STEP_ITEM, onClick: (e) => scrollToSection(e, index) }, [
    View({ style: circleStyle }, [Text({}, status === 'done' ? '✓' : String(index))]),
    Text({ style: labelStyle }, label),
  ])
}

const navConnect = (filled) =>
  View({ style: filled ? { ...PROGRESS_CONNECT, ...PROGRESS_CONNECT_FILLED } : PROGRESS_CONNECT })

AppSettingsPage({
  build({ settingsStorage }) {
    const hasVin = !!settingsStorage.getItem('vehicleVin')
    const vehicleMac = settingsStorage.getItem('vehicleMac')
    const isPaired = !!vehicleMac
    const pairedAtRaw = settingsStorage.getItem('vehiclePairedAt')
    const pairedAt = pairedAtRaw
      ? new Date(parseInt(pairedAtRaw, 10)).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : null
    const status1 = hasVin ? 'done' : 'active'
    const status2 = isPaired ? 'done' : hasVin ? 'active' : 'todo'
    const status3 = isPaired ? 'done' : 'todo'
    const navBg = isPaired ? NAV_BG_GREEN : hasVin ? NAV_BG_HALF : NAV_BG_BLUE

    return View({ style: BODY }, [
      View({ style: MAIN }, [
        // Progress nav (state-driven)
        View({ style: { ...PROGRESS_NAV, ...navBg } }, [
          navStep('Setup', status1, 1),
          navConnect(hasVin),
          navStep('Pair', status2, 2),
          navConnect(isPaired),
          navStep('Use', status3, 3),
        ]),

        // SETUP section
        View({ style: SECTION_SETUP }, [
          ...Header(),
          H2('⚙️ Setup'),
          View(
            {
              style: {
                ...(hasVin ? { ...CARD, ...CARD_DONE } : CARD),
              },
              onClick: (e) => openVehicleDialog(e, settingsStorage),
            },
            [
              View({ style: CARD_EDIT_HINT }, [
                Image({ alt: 'Edit', src: ICON_PENCIL, width: 14, height: 14, style: CARD_EDIT_ICON }),
                Text({ style: CARD_EDIT_TEXT }, 'Edit'),
              ]),
              View({ style: VEHICLE_ROW }, [
                Text({ style: VEHICLE_LABEL }, '🚗 Name:'),
                Text({ style: VEHICLE_VALUE }, settingsStorage.getItem('vehicleName') || 'Not set'),
              ]),
              View({ style: VEHICLE_ROW }, [
                Text({ style: VEHICLE_LABEL }, '🔢 VIN:'),
                Text({ style: VEHICLE_VALUE }, settingsStorage.getItem('vehicleVin') || 'Not set'),
              ]),
            ],
          ),
        ]),

        // PAIR section
        View({ style: SECTION_PAIR }, [
          H2('🔗 Pair'),
          isPaired
            ? View({ style: { ...CARD, ...CARD_DONE } }, [
                View({ style: VEHICLE_ROW }, [
                  Text({ style: VEHICLE_LABEL }, 'MAC:'),
                  Text({ style: VEHICLE_VALUE }, vehicleMac),
                ]),
                pairedAt
                  ? View({ style: VEHICLE_ROW }, [
                      Text({ style: VEHICLE_LABEL }, 'Paired At:'),
                      Text({ style: VEHICLE_VALUE }, pairedAt),
                    ])
                  : null,
              ])
            : StepsCard([
                [
                  1,
                  'Open "Add Key" on Tesla',
                  'Get in the car and have your NFC key card ready in hand. On the center screen, tap Car → Locks → Add Key.',
                ],
                [
                  2,
                  'Tap Pair on Watch',
                  'Open "Amazla Key" app on the watch and tap "Pair" button and follow the instructions on the watch.',
                ],
                [
                  3,
                  'Tap NFC Card on Console',
                  'The watch will vibrate and prompt you to tap your NFC key card. Place it flat on the console reader (between the front seats, behind the cup holders).',
                ],
                [
                  4,
                  'Confirm on Tesla Screen',
                  'Tesla will show the new key. Tap "Confirm" on the center screen to authorize your watch.',
                ],
                [
                  5,
                  'Rename the Key (Optional)',
                  'Tesla lists the new key as "Phone". On the center screen, tap Car → Locks → "Phone" → rename it (e.g. "Watch") so you can identify it later.',
                ],
                [
                  6,
                  'Done!',
                  'Your watch is now paired! Go back to the main page and test: tap lock/unlock to control your car.',
                ],
              ]),
        ]),

        // USE section
        View({ style: SECTION_USE }, [
          H2('⌚ Use'),
          SimpleCard('Lock Your Car', 'On the main page, tap the lock button. Your car will lock immediately.'),
          SimpleCard('Unlock Your Car', 'On the main page, tap the unlock button. Your car will unlock immediately.'),
          SimpleCard(
            'Works Offline',
            "You don't need your phone. As long as your watch is near the car (within 30 feet), it will work.",
          ),
          View({ style: CARD }, [
            Text(
              { style: { fontWeight: 'bold', fontSize: '14px', color: 'white', marginBottom: '6px' } },
              'If pairing does not work:',
            ),
            Text(
              { paragraph: true, style: { fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: '1.6' } },
              '1. On the BLE page, tap "Clear" to remove the old pairing',
            ),
            Text(
              { paragraph: true, style: { fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: '1.6' } },
              '2. Start over from "How to Pair" step 1',
            ),
          ]),
        ]),

        // Footer
        Text(
          { style: { fontSize: '12px', color: 'rgba(255,255,255,0.5)', margin: '24px 0 4px', textAlign: 'center' } },
          'Your car unlocks with a secure digital key',
        ),
        Text(
          { style: { fontSize: '12px', color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: '32px' } },
          'No data is shared or stored anywhere',
        ),
      ]),
    ])
  },
})

function stepBadgeStyle(number) {
  const t = (number - 1) / 5
  const r = Math.round(70 + (60 - 70) * t)
  const g = Math.round(140 + (200 - 140) * t)
  const b = Math.round(255 + (120 - 255) * t)
  return {
    ...STEP_BADGE,
    color: 'white',
    background: `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.95), rgba(${r}, ${g}, ${b}, 0.55))`,
    border: `1px solid rgba(${r}, ${g}, ${b}, 0.65)`,
    boxShadow: `0 0 12px rgba(${r}, ${g}, ${b}, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)`,
    textShadow: '0 1px 0 rgba(0, 0, 0, 0.25)',
  }
}

function StepRow(number, title, description, isLast) {
  return View(
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: '6px',
        paddingBottom: isLast ? '0' : '14px',
        marginBottom: isLast ? '0' : '14px',
        borderBottom: isLast ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
      },
    },
    [
      View({ style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px' } }, [
        Text({ style: stepBadgeStyle(number) }, String(number)),
        Text(
          {
            style: {
              fontFamily: 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, Roboto, sans-serif',
              fontWeight: 'bold',
              fontSize: '15px',
              color: 'white',
            },
          },
          title,
        ),
      ]),
      Text(
        { paragraph: true, style: { fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: '1.5' } },
        description,
      ),
    ],
  )
}

function StepsCard(steps) {
  return View(
    { style: { ...CARD, flexDirection: 'column', alignItems: 'stretch' } },
    steps.map((s, i) => StepRow(s[0], s[1], s[2], i === steps.length - 1)),
  )
}

function SimpleCard(title, description) {
  return View({ style: CARD }, [
    Text({ style: { fontWeight: 'bold', fontSize: '15px', marginBottom: '5px', color: 'white' } }, title),
    Text(
      { paragraph: true, style: { fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: '1.5' } },
      description,
    ),
  ])
}
