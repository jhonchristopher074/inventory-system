import { computed, onBeforeUnmount, ref, watch } from 'vue'

/**
 * Shows a long list a page at a time, so screens stay fast on phones as the
 * number of products grows: the first `pageSize` items, then the next page
 * whenever the end of the list scrolls into view (or "Show more" is pressed).
 *
 *   const { visible, remaining, sentinel, showMore, reset } = useShowMore(filteredItems)
 *
 * In the template: v-for over `visible`, and after the list an element with
 * ref="<the name you gave sentinel>" shown while remaining > 0. Call reset()
 * when the search or filter changes, so a new search starts at the top.
 */
export function useShowMore(items, pageSize = 40) {
  const limit = ref(pageSize)
  const sentinel = ref(null)

  const visible = computed(() => items.value.slice(0, limit.value))
  const remaining = computed(() => Math.max(items.value.length - limit.value, 0))

  function showMore() {
    limit.value += pageSize
  }

  function reset() {
    limit.value = pageSize
  }

  const observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting) && remaining.value > 0) showMore()
          },
          // start loading a little before the end is reached
          { rootMargin: '600px 0px' }
        )

  // Observe again after every page: if the end is still on screen (tall
  // screen, short rows), that loads the next page as well.
  watch(
    [sentinel, limit],
    () => {
      if (!observer) return
      observer.disconnect()
      if (sentinel.value) observer.observe(sentinel.value)
    },
    { flush: 'post' }
  )

  onBeforeUnmount(() => observer?.disconnect())

  return { visible, remaining, sentinel, showMore, reset }
}
