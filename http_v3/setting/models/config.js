class Config {
  constructor(settingsStorage) {
    this.settingsStorage = settingsStorage
  }

  get data() { return JSON.parse(this.settingsStorage.getItem('config') || '{}') }
  get output() { return this.data.output || 'toast' }
  get exit() { return this.data.exit || false }
  get awake() { return this.data.awake || false }
  get buttons() { return this.data.buttons || 1 }
  get press() { return this.data.press }
  get double() { return this.data.double }

  set output(value) { return this.update('output', value) }
  set exit(value) { return this.update('exit', value) }
  set awake(value) { return this.update('awake', value) }
  set buttons(value) { return this.update('buttons', value) }
  set press(value) { return this.update('press', value) }
  set double(value) { return this.update('double', value) }

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
