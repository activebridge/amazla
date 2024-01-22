
const vibrator = hmSensor.createSensor(hmSensor.id.VIBRATE)

export default (scene = 23) => {
  vibrator.stop()
  vibrator.scene = scene
  vibrator.start()
  return vibrator
}
