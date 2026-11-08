// Pages that keep their lists up to date without pressing refresh.
//
// Something changed for this person when a notification reaches them
// (the bell gets those live: a staff upload, an approval, a delivery...).
// The bell calls announceChange(); every page that asked with
// onLiveRefresh(load) then reloads, quietly. As a fallback the page also
// reloads when the tab is shown again, and every 30 s while it's open.
//
//   import { onLiveRefresh } from '../lib/liveRefresh'
//   onLiveRefresh(() => { fetchDeliveries(); fetchApprovals() })
import { onBeforeUnmount, onMounted } from 'vue'

const listeners = new Set()
let timer = null

// several notifications at once: one reload
export function announceChange() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    for (const listener of listeners) {
      try {
        listener()
      } catch (err) {
        console.error(err)
      }
    }
  }, 400)
}

export function onLiveRefresh(load, { every = 30000 } = {}) {
  let interval = null
  const run = () => {
    if (document.visibilityState === 'visible') load()
  }

  onMounted(() => {
    listeners.add(run)
    document.addEventListener('visibilitychange', run)
    if (every) interval = setInterval(run, every)
  })

  onBeforeUnmount(() => {
    listeners.delete(run)
    document.removeEventListener('visibilitychange', run)
    clearInterval(interval)
  })
}
