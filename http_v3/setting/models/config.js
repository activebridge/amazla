class Config {
  constructor(settingsStorage) {
    this.settingsStorage = settingsStorage
  }

  get data() { return JSON.parse(this.settingsStorage.getItem('config') || '{}') }
  get output() { return this.data.output || 'toast' }
  get exit() { return this.data.exit || false }
  get awake() { return this.data.awake || false }
  get buttons() { return this.data.buttons || 1 }
  get long() { return this.data.long }
  get double() { return this.data.double }
  get widget() { return this.data.widget }
  get secondary() { return this.data.secondary }

  set output(value) { return this.update('output', value) }
  set exit(value) { return this.update('exit', value) }
  set awake(value) { return this.update('awake', value) }
  set buttons(value) { return this.update('buttons', value) }
  set long(value) { return this.update('long', value) }
  set double(value) { return this.update('double', value) }
  set widget(value) { return this.update('widget', value) }
  set secondary(value) { return this.update('secondary', value) }

  update(name, value) {
    const data = this.data
    data[name] = value
    return this.settingsStorage.setItem('config', JSON.stringify(data))
    return value
  }

  delete() {
    return this.settingsStorage.removeItem('config', JSON.stringify(value))
  }
}

export { Config }
