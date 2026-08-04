// Keep the screen lit while a request is running / the action grid is on show.
// v1-native (hmSetting + hmApp) so it works on every runtime; @zos/display is not
// available in a v1-config build. Each call is guarded — not every device exposes
// the whole set.
export const keepScreenOn = (enable = true, seconds = 60) => {
  if (typeof hmApp !== 'undefined' && hmApp.setScreenKeep) hmApp.setScreenKeep(!!enable)
  if (typeof hmSetting === 'undefined') return
  if (enable) {
    if (hmSetting.setBrightScreen) hmSetting.setBrightScreen(seconds)
  } else {
    if (hmSetting.setBrightScreenCancel) hmSetting.setBrightScreenCancel()
  }
}
