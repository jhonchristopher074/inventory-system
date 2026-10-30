import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * A tab or filter kept in the address (?tab=inspections, ?stock=low), so a
 * refresh keeps it and a link (a notification, the Dashboard) can open it.
 *
 *   const tab = useQueryParam('tab', 'uploads', ['uploads', 'inspections'])
 *   tab.value = 'inspections'   // the page changes at once, the address follows
 *
 * The value changes right away and the address follows in the background:
 * every change of address first asks the server who is logged in, and a
 * click shouldn't wait for that. The default value isn't written in the
 * address, and anything not in `allowed` reads as the default.
 */
export function useQueryParam(name, fallback, allowed = null) {
  const route = useRoute()
  const router = useRouter()
  const pagePath = route.path

  function fromAddress() {
    const value = route.query[name]
    if (typeof value !== 'string' || !value) return fallback
    return allowed && !allowed.includes(value) ? fallback : value
  }

  const state = ref(fromAddress())

  // the address changed from outside (a link, Back): follow it
  watch(
    () => route.query[name],
    () => {
      if (route.path === pagePath) state.value = fromAddress()
    }
  )

  // the page changed it: write it in the address
  watch(state, (value) => {
    if (route.path !== pagePath || value === fromAddress()) return

    const query = { ...route.query }
    if (value === fallback) delete query[name]
    else query[name] = value

    router.replace({ query }).catch(() => {
      // the address couldn't follow (e.g. no connection): the page is right anyway
    })
  })

  return state
}
