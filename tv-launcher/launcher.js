// My Brain's TV launcher (docs/SPEC.md §9 The launcher). It fills the screen with the TV page from the site and keeps
// the TV awake (no screen saver) the whole time it shows, through Samsung's calls, which the page can't make itself. Plain old JavaScript: the TV's engine is about Chrome 63.
;(function () {
  // The site the TV page comes from. To try another one (a deploy preview), change it here and in config.xml.
  var SITE = 'https://myadhdbrain.netlify.app'
  var RETRY_MS = 30000
  var HUNG_MS = 120000

  var frame = document.getElementById('page')
  var ready = false
  var retry = null

  function keepAwake(on) {
    try {
      var common = window.webapis && window.webapis.appcommon
      var states = common && common.AppCommonScreenSaverState
      if (states) common.setScreenSaver(on ? states.SCREEN_SAVER_OFF : states.SCREEN_SAVER_ON)
    } catch (e) {
      // Not allowed: the TV dims as usual.
    }
    try {
      var power = window.tizen && window.tizen.power
      if (power) {
        if (on) power.request('SCREEN', 'SCREEN_NORMAL')
        else power.release('SCREEN')
      }
    } catch (e) {
      // Not allowed: the TV dims as usual.
    }
  }

  // Loads the TV page. If it finished loading without saying it's ready (My Brain was out of reach), tries again
  // 30 seconds later; a page still loading on a slow network is left to finish (up to 2 minutes). An error screen may dim as usual.
  function load() {
    ready = false
    keepAwake(false)
    frame.src = SITE + '/tv/'
    // A load that hangs (no page and no error) is tried again after 2 minutes.
    clearTimeout(retry)
    retry = setTimeout(function () {
      if (!ready) load()
    }, HUNG_MS)
  }
  function retryUnlessReady() {
    clearTimeout(retry)
    retry = setTimeout(function () {
      if (!ready) load()
    }, RETRY_MS)
  }

  // The remote's keys go to whichever page has focus: keep it on the TV page.
  function focusPage() {
    try {
      frame.contentWindow.focus()
    } catch (e) {
      frame.focus()
    }
  }

  // Only the TV page, from the site, in this frame, may say it's ready. The shape matches src/tv/screen/launcher.ts.
  window.addEventListener('message', function (event) {
    if (event.origin !== SITE || event.source !== frame.contentWindow) return
    var data = event.data || {}
    if (data.myBrainTv === 'ready') {
      ready = true
      clearTimeout(retry)
      keepAwake(true)
      focusPage()
    }
  })

  window.addEventListener('online', function () {
    if (!ready) load()
  })
  frame.addEventListener('load', function () {
    focusPage()
    if (!ready) retryUnlessReady()
  })
  window.addEventListener('focus', focusPage)
  document.addEventListener('keydown', focusPage)

  load()
})()
