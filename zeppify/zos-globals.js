// v2/v3 compatibility shim. The shared pages/ui.js is written v1-native (it uses
// the hmUI / hmSetting globals), because the v1 runtime can't load @zos/* modules.
// On v2/v3 those globals don't exist, so we create them here from the @zos
// modules. This file is imported ONLY by the v2/v3 app (its static @zos imports
// are safe there) and must run BEFORE any page evaluates ui.js — so import it as
// the first line of app.js.
import * as hmUI from '@zos/ui'
import { getDeviceInfo } from '@zos/device'

globalThis.hmUI = hmUI
globalThis.hmSetting = { getDeviceInfo }
