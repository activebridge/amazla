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

    const actionSections = View(
      {},
      actions.map((a, i) => {
        return Section({
          style: {
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "start",
            padding: "20px",
            gap: "20px",
            margin: "20px 0",
            boxShadow: "rgba(0, 0, 0, 0.19) 0px 10px 20px, rgba(0, 0, 0, 0.23) 0px 6px 6px",
            background: "white",
            borderRadius: "20px",
          },
        }, [

          TextInput({
            label: 'Title',
            placeholder: 'Run',
            value: a.title,
            onChange: value => { save(i, 'title', value) },
          }),

          Select({
            label: 'Icon',
            options: [
              { value: '▶', name: '▶' },
              { value: '★', name: '★' },
              { value: '☎', name: '☎' },
              { value: '⚠', name: '⚠' },
              { value: '☯', name: '☯' },
              { value: '♨', name: '♨' },
              { value: '♻', name: '♻' },
            ],
            multiple: false,
            value: a.icon || '▶',
            onChange: (value) => {
              actions[i].icon = value
              props.settingsStorage.setItem('actions', JSON.stringify(actions))
              console.log(value)
            },
          }),
          Text({ bold: true }, a.icon),

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
            value: "GET",
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
            label: '× DELETE',
            style: {
              background: 'red',
              borderRadius: '20px',
              margin: '0 -20px -20px -20px',
              color: 'white',
              width: 'calc(100% + 40px)',
              display: 'inline-block',
              padding: '10px',
              textAlign: 'center',
            },
            onClick: () => {
              actions.pop(i)
              props.settingsStorage.setItem('actions', JSON.stringify(actions))
              console.log('Click')
            }
          }),
        ])
      })
    )

    return View(
      {
        style: {
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "start",
          height: "100vh",
          fontFamily: "Circular,Helvetica,Arial,sans-serif",
          fontSize: "16px",
          fontWeight: "400",
          padding: '10px 20px 100px 20px',
        },
      },
      [
        actionSections,

        Button({
          label: '+ Add Action',
          style: {
            borderRadius: '20px',
            display: 'inline-block',
            boxSizing: 'border-box',
            width: '100%',
            textAlign: 'center',
            background: '#00CA4E',
            padding: '10px',
            color: 'white'
          },
          onClick: () => {
            actions.push({})
            props.settingsStorage.setItem('actions', JSON.stringify(actions))
            console.log('Click')
          }
        }),

        Text({ style: { color: 'transparent' } }, 'Spacer'),
      ],
    )
  },
})
