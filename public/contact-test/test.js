// Temporary test page for the Contact Picker on the user's phone (Deploy Preview only, never merged).
const out = document.getElementById('out')
const log = (line) => { out.textContent += '\n' + line }
out.textContent = 'Browser: ' + navigator.userAgent
log('Picker available: ' + ('contacts' in navigator && 'ContactsManager' in window))
if (navigator.contacts && navigator.contacts.getProperties) {
  navigator.contacts.getProperties().then((p) => log('Supported: ' + JSON.stringify(p)), (e) => log('getProperties failed: ' + e))
}
let started = 0
document.addEventListener('visibilitychange', () => { if (started) log('  page ' + document.visibilityState + ' at ' + (Date.now() - started) + ' ms') })
for (const button of document.querySelectorAll('button')) {
  button.addEventListener('click', async () => {
    const props = button.dataset.props.split(',')
    const multiple = button.dataset.multiple === 'true'
    log('\n— Try ' + button.textContent.slice(0, 2) + ' select(' + JSON.stringify(props) + ', multiple: ' + multiple + ')')
    started = Date.now()
    try {
      const result = await navigator.contacts.select(props, { multiple })
      log('  answered after ' + (Date.now() - started) + ' ms with ' + result.length + ' contact(s):')
      log('  ' + JSON.stringify(result))
    } catch (e) {
      log('  failed after ' + (Date.now() - started) + ' ms: ' + (e && e.name) + ': ' + (e && e.message))
    }
    started = 0
  })
}
