import { Header } from './components/header.js'
import { BUTTON_ACTION_OPTIONS } from '../shared/button-action.js'
import { ICON_BLUETOOTH, ICON_INFO, ICON_NO_PHONE, ICON_OFFLINE, ICON_PENCIL } from './icons.js'
import { openFaqDialog } from './libs/faq.js'
import { openInfoDialog } from './libs/infoDialog.js'
import { openPairStepsDialog } from './libs/pairSteps.js'
import { openVehicleDialog } from './libs/vinInput.js'
import {
  BODY,
  CARD,
  CARD_DISABLED,
  CARD_EDIT_HINT,
  CARD_EDIT_ICON,
  CARD_EDIT_TEXT,
  CHIP,
  CHIP_ON,
  CHIP_ROW,
  CHIP_TEXT,
  CHIP_TEXT_ON,
  FAQ_FAB,
  FOOTER_FEATURE_DOT,
  FOOTER_FEATURE_ICON,
  FOOTER_FEATURE_ITEM,
  FOOTER_FEATURES,
  INFO_ICON_BUTTON,
  MAIN,
  PAIR_BUTTON,
  PAIRED_VALUE_ROW,
  SECTION_SETUP,
  SELECT_ROW,
  SETTING_DESC,
  SETTING_ROW,
  SETTING_ROW_DIVIDER,
  SETTING_TEXTS,
  SETTING_TITLE,
  SETTING_TITLE_ROW,
  SWITCH_KNOB,
  SWITCH_KNOB_ON,
  SWITCH_TRACK,
  SWITCH_TRACK_ON,
  VEHICLE_LABEL,
  VEHICLE_ROW,
  VEHICLE_VALUE,
  VEHICLE_VALUE_OK,
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
          View({ style: CARD }, [
            View({ style: CARD_EDIT_HINT, onClick: (e) => openVehicleDialog(e, settingsStorage) }, [
              Image({ alt: 'Edit', src: ICON_PENCIL, width: 14, height: 14, style: CARD_EDIT_ICON }),
              Text({ style: CARD_EDIT_TEXT }, 'Edit'),
            ]),
            VehicleRow('Name:', settingsStorage.getItem('vehicleName'), settingsStorage),
            VehicleRow('VIN:', settingsStorage.getItem('vehicleVin'), settingsStorage),
            View({ style: VEHICLE_ROW }, [
              Text({ style: VEHICLE_LABEL }, 'Paired At:'),
              isPaired
                ? Text({ style: { ...VEHICLE_VALUE, ...VEHICLE_VALUE_OK } }, `✓ ${pairedAt}`)
                : View({ style: PAIRED_VALUE_ROW }, [
                    Text({ style: { ...VEHICLE_VALUE, flex: 'none' } }, 'Not Paired'),
                    View({ style: INFO_ICON_BUTTON, onClick: (e) => openPairStepsDialog(e) }, [
                      Image({ alt: 'How to pair', src: ICON_INFO, width: 18, height: 18 }),
                    ]),
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
              false,
              {
                title: 'Auto-Unlock',
                body:
                  'When on, the car <b>unlocks by itself the moment the watch connects</b> to it and the car is locked — no tap needed.' +
                  '<ul>' +
                  '<li>Works everywhere the app connects: the main app, the shortcut card, and the key-card widget.</li>' +
                  "<li>It only unlocks a <b>locked</b> car, so it never re-locks or interferes if you're already in.</li>" +
                  '<li>A change here reaches the watch on its <b>next connection</b>, not instantly.</li>' +
                  '</ul>',
              },
            ),
            SettingSelect(
              settingsStorage,
              'buttonAction',
              'lockUnlock',
              'Watch Button Action',
              'What a press of the watch button does while the app is open.',
              BUTTON_ACTION_OPTIONS,
              !isPaired,
              {
                title: 'Watch Button',
                body:
                  "Pick what the watch's physical button does <b>while the app is open</b>:" +
                  '<ul>' +
                  '<li><b>Lock/Unlock</b> — toggles the doors.</li>' +
                  '<li><b>Frunk</b> — opens/closes the front trunk.</li>' +
                  '<li><b>Trunk</b> — opens/closes the rear trunk.</li>' +
                  '</ul>' +
                  "Press the side/shortcut button (or the crown) to trigger it. If you map that same button to launch Amazla Key, the first press opens the app and the second press runs your selected action (Lock/Unlock, Frunk, or Trunk). If you're not connected yet, a press <b>reconnects</b> instead — press again once it shows Connected.",
              },
            ),
          ]),
        ]),

        // Footer
        Text(
          { style: { fontSize: '12px', color: 'rgba(255,255,255,0.5)', margin: '24px 0 16px', textAlign: 'center' } },
          'Your car unlocks with a secure digital key — stored only on your devices',
        ),
        View({ style: FOOTER_FEATURES }, [
          View({ style: FOOTER_FEATURE_ITEM }, [
            Image({ alt: '', src: ICON_BLUETOOTH, width: 13, height: 13, style: FOOTER_FEATURE_ICON }),
            Text({}, 'Pure Bluetooth'),
          ]),
          Text({ style: FOOTER_FEATURE_DOT }, '·'),
          View({ style: FOOTER_FEATURE_ITEM }, [
            Image({ alt: '', src: ICON_NO_PHONE, width: 13, height: 13, style: FOOTER_FEATURE_ICON }),
            Text({}, 'No phone needed'),
          ]),
          Text({ style: FOOTER_FEATURE_DOT }, '·'),
          View({ style: FOOTER_FEATURE_ITEM }, [
            Image({ alt: '', src: ICON_OFFLINE, width: 13, height: 13, style: FOOTER_FEATURE_ICON }),
            Text({}, 'Works offline'),
          ]),
        ]),
        Text(
          { style: { fontSize: '11px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginBottom: '32px' } },
          'Not affiliated with or endorsed by Tesla, Inc. Tesla and the Tesla logo are trademarks of Tesla, Inc.',
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
// Setting title + an optional little (i) info-icon that opens a help dialog. `info`,
// when given, is { title, body } passed to openInfoDialog (same icon/pattern as the
// pairing help). Reused by the toggle and the select so both look identical.
function SettingTitle(title, info) {
  return View({ style: SETTING_TITLE_ROW }, [
    Text({ style: SETTING_TITLE }, title),
    info
      ? View({ style: INFO_ICON_BUTTON, onClick: (e) => openInfoDialog(e, info.title, info.body) }, [
          Image({ alt: info.title, src: ICON_INFO, width: 16, height: 16 }),
        ])
      : null,
  ])
}

function SettingToggle(settingsStorage, key, defaultOn, title, description, disabled, divider, info) {
  const raw = settingsStorage.getItem(key)
  const on = raw == null || raw === '' ? defaultOn : raw === '1'
  const trackStyle = on ? { ...SWITCH_TRACK, ...SWITCH_TRACK_ON } : SWITCH_TRACK
  let rowStyle = divider ? { ...SETTING_ROW, ...SETTING_ROW_DIVIDER } : SETTING_ROW
  if (disabled) rowStyle = { ...rowStyle, ...CARD_DISABLED }
  // Tesla layout: toggle on the left, label + helper text to the right of it.
  return View({ style: rowStyle }, [
    View(
      {
        style: disabled ? { ...trackStyle, cursor: 'default' } : trackStyle,
        onClick: disabled ? undefined : () => settingsStorage.setItem(key, on ? '0' : '1'),
      },
      [View({ style: on ? { ...SWITCH_KNOB, ...SWITCH_KNOB_ON } : SWITCH_KNOB })],
    ),
    View({ style: SETTING_TEXTS }, [
      SettingTitle(title, info),
      Text({ paragraph: true, style: SETTING_DESC }, description),
    ]),
  ])
}

// Segmented single-choice select (title/description + a row of chips). Persists the
// chosen option's value to settingsStorage[key]; GET_SETTINGS syncs it to the watch
// (store.buttonAction). options: [{ value, label }]. Custom (not the native Select) to
// match the Tesla-dark toggle rows. Dimmed + inert until the watch is paired.
function SettingSelect(settingsStorage, key, defaultValue, title, description, options, disabled, info) {
  const current = settingsStorage.getItem(key) || defaultValue
  const rowStyle = disabled ? { ...SELECT_ROW, ...CARD_DISABLED } : SELECT_ROW
  return View({ style: rowStyle }, [
    View({ style: SETTING_TEXTS }, [
      SettingTitle(title, info),
      Text({ paragraph: true, style: SETTING_DESC }, description),
    ]),
    View(
      { style: CHIP_ROW },
      options.map((o) => {
        const active = o.value === current
        return View(
          {
            style: active ? { ...CHIP, ...CHIP_ON } : CHIP,
            onClick: disabled ? undefined : () => settingsStorage.setItem(key, o.value),
          },
          [Text({ style: active ? { ...CHIP_TEXT, ...CHIP_TEXT_ON } : CHIP_TEXT }, o.label)],
        )
      }),
    ),
  ])
}
