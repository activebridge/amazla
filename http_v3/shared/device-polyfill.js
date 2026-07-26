import './es6-promise'
ES6Promise.polyfill()

Promise._setScheduler((flush) => {
  flush && flush()
})
