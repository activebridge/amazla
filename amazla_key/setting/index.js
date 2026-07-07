import { Header } from './components/header.js'
import { ICON_PENCIL } from './icons.js'
import { openFaqDialog } from './libs/faq.js'
import { openPairStepsDialog } from './libs/pairSteps.js'
import { openVehicleDialog } from './libs/vinInput.js'
import {
  BODY,
  CARD,
  CARD_DISABLED,
  CARD_DONE,
  FAQ_FAB,
  CARD_EDIT_HINT,
  CARD_EDIT_ICON,
  CARD_EDIT_TEXT,
  MAIN,
  PAIR_BUTTON,
  PAIRED_VALUE_ROW,
  SECTION_SETUP,
  SETTING_DESC,
  SETTING_ROW,
  SETTING_ROW_DIVIDER,
  SETTING_TEXTS,
  SETTING_TITLE,
  SWITCH_KNOB,
  SWITCH_KNOB_ON,
  SWITCH_TRACK,
  SWITCH_TRACK_ON,
  VEHICLE_LABEL,
  VEHICLE_ROW,
  VEHICLE_VALUE,
} from './styles.js'

AppSettingsPage({
  build({ settingsStorage }) {
    // Paired = vehiclePairedAt set (watch fires SAVE_PAIRED on pairing success).
    // No MAC involved: Tesla rotates the BLE MAC, so it's never synced to the phone.
    const pairedAtRaw = settingsStorage.getItem('vehiclePairedAt')
    const isPaired = !!pairedAtRaw
    const pairedAt = pairedAtRaw
      ? new Date(parseInt(pairedAtRaw, 10)).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : null
    return View({ style: BODY }, [
      View({ style: MAIN }, [
        // SETUP section — one card: vehicle info + paired state (+ pairing help)
        View({ style: SECTION_SETUP }, [
          ...Header(),
          View({ style: isPaired ? { ...CARD, ...CARD_DONE } : CARD }, [
            View({ style: CARD_EDIT_HINT, onClick: (e) => openVehicleDialog(e, settingsStorage) }, [
              Image({ alt: 'Edit', src: ICON_PENCIL, width: 14, height: 14, style: CARD_EDIT_ICON }),
              Text({ style: CARD_EDIT_TEXT }, 'Edit'),
            ]),
            VehicleRow('Name:', settingsStorage.getItem('vehicleName'), settingsStorage),
            VehicleRow('VIN:', settingsStorage.getItem('vehicleVin'), settingsStorage),
            View({ style: VEHICLE_ROW }, [
              Text({ style: VEHICLE_LABEL }, 'Paired At:'),
              isPaired
                ? Text({ style: VEHICLE_VALUE }, pairedAt)
                : View({ style: PAIRED_VALUE_ROW }, [
                    Text({ style: { ...VEHICLE_VALUE, flex: 'none' } }, 'Not Paired'),
                    View({ style: PAIR_BUTTON, onClick: (e) => openPairStepsDialog(e) }, [Text({}, 'How to Pair')]),
                  ]),
            ]),

            // Behavior settings, synced to the watch via GET_SETTINGS.
            // Disabled (dimmed, inert) until the watch is paired.
            SettingToggle(
              settingsStorage,
              'autoUnlock',
              false,
              'Auto-Unlock on Connect',
              'Unlock the car as soon as the watch connects to it.',
              !isPaired,
              true,
            ),
            SettingToggle(
              settingsStorage,
              'autoLock',
              false,
              'Auto-Lock on Exit',
              'Lock the car when you close the app — skipped if someone is still inside. Walk-away lock works on its own, but only while the app stays open.',
              !isPaired,
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

      // Floating FAQ button
      View({ style: FAQ_FAB, onClick: (e) => openFaqDialog(e) }, [Text({}, '?')]),
    ])
  },
})

// Name/VIN row. When the value is missing, an inline "Enter" button (same look as
// "How to Pair") opens the vehicle dialog.
function VehicleRow(label, value, settingsStorage) {
  return View({ style: VEHICLE_ROW }, [
    Text({ style: VEHICLE_LABEL }, label),
    value
      ? Text({ style: VEHICLE_VALUE }, value)
      : View({ style: PAIRED_VALUE_ROW }, [
          Text({ style: { ...VEHICLE_VALUE, flex: 'none' } }, 'Not set'),
          View({ style: PAIR_BUTTON, onClick: (e) => openVehicleDialog(e, settingsStorage) }, [Text({}, 'Enter')]),
        ]),
  ])
}

// Toggle setting row (inside the setup card). Value lives in settingsStorage as
// '1'/'0'; unset = OFF. Must match the checks in app-side GET_SETTINGS and
// lib/store.js. Toggling writes the key, which re-runs build() and syncs the pref
// to the watch on its next GET_SETTINGS. Only the switch itself toggles — the row
// body is inert. disabled: dimmed and non-interactive (needs a paired watch).
// divider: separator line above the row (first toggle after the vehicle rows).
function SettingToggle(settingsStorage, key, defaultOn, title, description, disabled, divider) {
  const raw = settingsStorage.getItem(key)
  const on = raw == null || raw === '' ? defaultOn : raw === '1'
  const trackStyle = on ? { ...SWITCH_TRACK, ...SWITCH_TRACK_ON } : SWITCH_TRACK
  let rowStyle = divider ? { ...SETTING_ROW, ...SETTING_ROW_DIVIDER } : SETTING_ROW
  if (disabled) rowStyle = { ...rowStyle, ...CARD_DISABLED }
  return View({ style: rowStyle }, [
    View({ style: SETTING_TEXTS }, [
      Text({ style: SETTING_TITLE }, title),
      Text({ paragraph: true, style: SETTING_DESC }, description),
    ]),
    View(
      {
        style: disabled ? { ...trackStyle, cursor: 'default' } : trackStyle,
        onClick: disabled ? undefined : () => settingsStorage.setItem(key, on ? '0' : '1'),
      },
      [View({ style: on ? { ...SWITCH_KNOB, ...SWITCH_KNOB_ON } : SWITCH_KNOB })],
    ),
  ])
}
