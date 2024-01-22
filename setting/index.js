import { CLIENT_ID, CLIENT_SECRET } from '../secrets'
import {
  MAIN,
  CONNECT_BTN,
  RESET_BTN,
  PREVIEW,
  LOGO_SRC,
  SUB,
  NAME,
  EXTERNAL_LINK,
} from './styles'

AppSettingsPage({
  build({ settingsStorage }) {
    const saveCode = ({ code }) => {
      settingsStorage.removeItem('debug')
      settingsStorage.removeItem('access_token')
      settingsStorage.removeItem('refresh_token')
      settingsStorage.setItem('code', code)
    }

    const rgbToHex = (r, g, b) => [r, g, b].map(x => {
      const hex = x.toString(16)
      return hex.length === 1 ? '0' + hex : hex
    }).join('')

    const saveColor = (type, val) => {
      settingsStorage.setItem(type, val)
      const r = settingsStorage.getItem('red') || 0
      const g = settingsStorage.getItem('green') || 0
      const b = settingsStorage.getItem('blue') || 0
      settingsStorage.setItem('color', rgbToHex(r, g, b))
    }

    const name = settingsStorage.getItem('name')
    const code = settingsStorage.getItem('code')
    const token = settingsStorage.getItem('refresh_token')
    const color = settingsStorage.getItem('color')
    const custom_color = settingsStorage.getItem('custom_color')
    const red = settingsStorage.getItem('red')
    const green = settingsStorage.getItem('green')
    const blue = settingsStorage.getItem('blue')

    return View({ style: MAIN }, [
      Image({
        alt: 'Tesla',
        src: LOGO_SRC,
        width: 100,
        height: 100,
        style: {
          margin: '0 auto',
          display: 'block',
        },
      }),

      View({}, [
        Toggle({
          label: 'Europe, Middle East, Africa',
          value: settingsStorage.getItem('eu'),
          onChange: val => {
            if (val) return settingsStorage.setItem('eu', true)
            settingsStorage.removeItem('eu')
          }},
        ),
      ]),

      (!code && !token) && View({ style: CONNECT_BTN }, [
        Auth({
          label: '👤 CONNECT TESLA ACCOUNT',
          // description: 'We do not collect any of your login credentials. Everiting happens on Tesla side',
          authorizeUrl: 'https://auth.tesla.com/oauth2/v3/authorize',
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          requestTokenUrl: 'https://auth.tesla.com/oauth2/v3/token',
          scope: 'openid offline_access vehicle_device_data vehicle_cmds vehicle_charging_cmds',
          pkce: false,
          onAccessToken: saveCode,
          onReturn: saveCode,
        }),
      ]),

      (token || code) && Button({
        label: '🔶 RESET',
        style: RESET_BTN,
        onClick: () => {
          settingsStorage.removeItem('id')
          settingsStorage.removeItem('name')
          settingsStorage.removeItem('access_token')
          settingsStorage.removeItem('refresh_token')
          settingsStorage.removeItem('cpde')
        }
      }),

      Text({
        style: NAME,
        paragraph: true,
        bold: true,
        align: 'center',
      }, name),

      name && Text({
        style: SUB,
        paragraph: true,
        align: 'center',
      }, 'Vehicle connected. Open app on your watch'),

      View({}, [
        Text({ paragraph: true, bold: true }, 'To be able to send commands to your car your need to deploy a key'),
      ]),

      Text({ paragraph: true }, 'This requires the vehicle to be online and connected with the phone via Bluetooth'),

      View({ style: CONNECT_BTN }, [
        Auth({
          label: '🔑 DEPLOY PUBLIC KEY',
          authorizeUrl: 'https://tesla.com/_ak/tesla.activebridge.org',
        }),
      ]),

      Text({ paragraph: true, style: { textAlign: 'center', width: '100%' } }, 'or'),

      View({}, [
        Text({}, 'Copy a '),
        View({ style: EXTERNAL_LINK }, [
          TextInput({
            label: '🔗 Deploy Key Url',
            value: 'https://tesla.com/_ak/tesla.activebridge.org',
            multiline: true,
            rows: 2,
            disabled: true,
            subStyle: { display: 'none', },
          }),
        ]),
        Text({}, ' and open it in your browser'),

        // Link({ source: 'https://tesla.com/_ak/tesla.activebridge.org' }, [
        //   Text({ paragraph: true, style: { color: '#E82127' } }, 'https://tesla.com/_ak/tesla.activebridge.org'),
        // ]),
      ]),

      View({}, [
        Text({ paragraph: true, bold: true }, 'Still does not work? Hard reset:'),
        Text({ paragraph: true }, '- Go to your Tesla account settings'),
        View({}, [
          Text({}, '- Go to Manage '),
          View({ style: EXTERNAL_LINK }, [
            TextInput({
              label: '🔗 3rd Party Apps Url',
              value: 'https://accounts.tesla.com/en_US/account-settings/security?tab=tpty-apps',
              multiline: true,
              rows: 4,
              disabled: true,
              subStyle: { display: 'none', },
            }),
          ]),
        ]),
        Text({ paragraph: true }, '- Revoke access to Amazla'),
        Text({ paragraph: true }, '- Cick RESET button above'),
        Text({ paragraph: true }, '- Connect your Tesla account'),
        Text({ paragraph: true }, '- Deploy a key to your car'),
      ]),

      View({}, [
        Toggle({
          label: 'Custom Car Color',
          settingsKey: 'custom_color',
        }),
      ]),

      custom_color === 'true' && View({
        style: {
          width: '100%',
        },
      }, [
        Section({}, [
          Text({ paragraph: true, style: { ...PREVIEW, background: `#${color}` }}, `#${color || ''}`),
        ]),
        Slider({ min: 0, max: 255, step: 1, label: 'Red', value: red, onChange: val => saveColor('red', val) }),
        Slider({ min: 0, max: 255, step: 1, label: 'Green', value: green, onChange: val => saveColor('green', val) }),
        Slider({ min: 0, max: 255, step: 1, label: 'Blue', value: blue, onChange: val => saveColor('blue', val) }),
      ]),

      Link({ source: 'https://buymeacoffee.com/galulex' }, [
        Text({
          paragraph: true,
          style: {
            margin: '10px 0',
            color: '#E82127',
          }
        }, 'Leave feadback or suggestions'),
      ]),
      Text({ paragraph: true }, 'buymeacoffee.com/galulex'),
      Text({ paragraph: true }, settingsStorage.getItem('debug')),
      // Text({ style: { overflow: 'auto' } }, settingsStorage.getItem('vehicle')),
    ])
  },
})
