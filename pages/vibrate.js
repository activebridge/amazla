import { Vibrator, VIBRATOR_SCENE_SHORT_MIDDLE, VIBRATOR_SCENE_DURATION } from '@zos/sensor'

const vibrator = hmSensor?.createSensor(hmSensor?.id?.VIBRATE) || new Vibrator()

export default (scene = 23) => {
  vibrator.stop()
  // vibrator.scene = scene
  vibrator.setMode(VIBRATOR_SCENE_SHORT_MIDDLE)
  vibrator.start()
  return vibrator
}
