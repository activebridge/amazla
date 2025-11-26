class Config {
  constructor(settingsStorage) {
    this.settingsStorage = settingsStorage
  }

  get data() {
    return JSON.parse(this.settingsStorage.getItem('config') || '{}')
  }
  get output() {
    return this.data.output || 'toast'
  }
  get exit() {
    return this.data.exit || false
  }
  get awake() {
    return this.data.awake || false
  }
  get buttons() {
    return this.data.buttons || 1
  }
  get press() {
    return this.data.press
  }
  get double() {
    return this.data.double
  }
  get vibrate() {
    return this.data.vibrate || false
  }

  set output(value) {
    this.update('output', value)
  }
  set exit(value) {
    this.update('exit', value)
  }
  set awake(value) {
    this.update('awake', value)
  }
  set buttons(value) {
    this.update('buttons', value)
  }
  set press(value) {
    this.update('press', value)
  }
  set double(value) {
    this.update('double', value)
  }
  set vibrate(value) {
    this.update('vibrate', value)
  }

  update(name, value) {
    const data = this.data
    data[name] = value
    return this.settingsStorage.setItem('config', JSON.stringify(data))
  }

  delete() {
    return this.settingsStorage.removeItem('config', JSON.stringify(value))
  }
}

export { Config }
