import { BODY, CARD, BUTTON, RAW, H1 } from './styles.js'
import { IconSelect, xSelect } from './components/icon_select.js'

AppSettingsPage({
  state: {
    actions: [],
    props: {},
  },

  build(props) {
    console.log(props)
    const actions = JSON.parse(props.settingsStorage.getItem('actions') || '[{}]')
    const save = (i, name, value) => {
      actions[i][name] = value
      props.settingsStorage.setItem('actions', JSON.stringify(actions))
    }

    const update = () => {
      props.settingsStorage.setItem('actions', JSON.stringify(actions))
    }

    const actionSections = View(
      {},
      actions.map((a, i) => {
        return Section({ style: CARD }, [
          TextInput({
            label: 'Title',
            placeholder: 'Run',
            value: a.title,
            onChange: value => { save(i, 'title', value) },
            subStyle: { color: 'white' },
          }),

          View({ style: RAW }, [
            IconSelect({ action: a, onChange: value => { save(i, 'icon', value) } }),
            Text({ bold: true }, a.icon),
          ]),

          xSelect({
            options: [
              { name: 'OK', value: 'ok' },
              { name: 'Error', value: 'error' },
            ],
            multiple: true,
            value: a.x,
            onChange: value => { save(i, 'x', value) },
          }),

          TextInput({
            label: 'URL',
            placeholder: 'https://api.url.com',
            value: a.url || 'https://',
            onChange: value => { save(i, 'url', value) },
          }),

          Select({
            label: 'METHOD',
            options: [
              { value: 'GET', name: 'GET' },
              { value: 'POST', name: 'POST' },
              { value: 'PATCH', name: 'PATCH' },
              { value: 'PUT', name: 'PUT' },
              { value: 'DELETE', name: 'DELETE' },
            ],
            multiple: false,
            value: a.method,
            onChange: (value) => {
              actions[i].method = value
              props.settingsStorage.setItem('actions', JSON.stringify(actions))
              console.log(value)
            },
          }),
          Text({ bold: true }, a.method),

          TextInput({
            label: 'Headers',
            placeholder: 'Authorization=Token\nAnother header=value',
            value: a.headers,
            rows: 3,
            multiline: true,
            onChange: value => { save(i, 'headers', value) },
          }),

          TextInput({
            label: 'Body',
            labelStyle: {
              marginTop: '20px',
            },
            placeholder: 'key=value',
            value: a.body,
            multiline: true,
            rows: 3,
            onChange: value => { save(i, 'body', value) },
          }),

          Button({
            label: '×',
            style: BUTTON,
            onClick: () => {
              actions.pop(i)
              props.settingsStorage.setItem('actions', JSON.stringify(actions))
              console.log('Click')
            }
          }),
        ])
      })
    )

    return View({ style: BODY },
      [
        Text({ style: H1 }, 'Actions'),
        actionSections,

        Button({
          label: '+',
          style: BUTTON,
          onClick: () => {
            actions.push({})
            props.settingsStorage.setItem('actions', JSON.stringify(actions))
            console.log('Click')
          }
        }),

        Text({ style: H1 }, 'Settings'),

        Text({ style: { color: 'transparent' } }, 'Spacer'),
      ],
    )
  },
})
