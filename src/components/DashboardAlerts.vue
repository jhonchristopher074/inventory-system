<template>
  <!-- The first thing under a dashboard's header: what's wrong right now,
       in colour, so nobody has to read the tiles to find it.
         red    something is empty or late (out of stock, overdue)
         amber  something to watch (running low, not sent)
         green  nothing wrong
       Each line opens the page where it's fixed. -->
  <section
    v-if="loaded"
    class="alerts"
    :class="alerts.length === 0 ? 'is-ok' : critical ? 'is-critical' : 'is-warning'"
    aria-label="Alerts"
  >
    <p v-if="alerts.length === 0" class="alerts-ok">
      <NavIcon name="check" class="h-5 w-5 shrink-0" />
      {{ okText }}
    </p>

    <template v-else>
      <div class="alerts-head">
        <span class="alerts-icon" aria-hidden="true">
          <NavIcon name="alert" class="h-5 w-5" />
        </span>
        <p class="alerts-title">{{ critical ? 'Needs action now' : 'Keep an eye on' }}</p>
      </div>

      <ul class="alerts-list">
        <li v-for="alert in alerts" :key="alert.key">
          <RouterLink :to="alert.to" class="alert-row" :class="alert.level">
            <span class="alert-dot" aria-hidden="true"></span>
            <span class="alert-text">
              <b>{{ alert.text }}</b>
              <span v-if="alert.detail" class="alert-detail">{{ alert.detail }}</span>
            </span>
            <span class="alert-go">
              {{ alert.action }}
              <NavIcon name="chevron" class="h-4 w-4" />
            </span>
          </RouterLink>
        </li>
      </ul>
    </template>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import NavIcon from './NavIcon.vue'

const props = defineProps({
  // [{ key, level: 'critical' | 'warning', text, detail?, to, action }]
  alerts: { type: Array, default: () => [] },
  // false while the first load is running (nothing is shown until then)
  loaded: { type: Boolean, default: true },
  okText: { type: String, default: 'All good. Nothing needs action right now.' },
})

const critical = computed(() => props.alerts.some((alert) => alert.level === 'critical'))
</script>

<style scoped>
.alerts {
  margin-bottom: 1rem;
  border-radius: var(--radius-md);
  border: 1px solid;
}

.is-critical {
  --alert: #f4344c;
  border-color: rgba(244, 52, 76, 0.5);
  background: linear-gradient(90deg, rgba(224, 27, 50, 0.2), rgba(224, 27, 50, 0.06));
  box-shadow: 0 10px 30px -18px rgba(224, 27, 50, 0.8);
}

.is-warning {
  --alert: #fbbf24;
  border-color: rgba(251, 191, 36, 0.4);
  background: linear-gradient(90deg, rgba(245, 158, 11, 0.14), rgba(245, 158, 11, 0.04));
}

.is-ok {
  border-color: rgba(52, 211, 153, 0.25);
  background: rgba(5, 150, 105, 0.08);
}

.alerts-ok {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.7rem 1rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--color-emerald-400);
}

.alerts-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 1rem 0.25rem;
}

.alerts-icon {
  position: relative;
  display: grid;
  flex: none;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  background: var(--alert);
  color: #000;
}

/* red: a ring that keeps pulsing out of the icon */
.is-critical .alerts-icon {
  color: #fff;
}

.is-critical .alerts-icon::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 2px solid var(--alert);
  animation: alert-pulse 1.8s ease-out infinite;
}

@keyframes alert-pulse {
  from {
    transform: scale(1);
    opacity: 0.8;
  }
  to {
    transform: scale(1.8);
    opacity: 0;
  }
}

.alerts-title {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--alert);
}

.alerts-list {
  padding: 0.25rem 0.5rem 0.5rem;
}

.alert-row {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.55rem;
}

.alert-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

.alert-dot {
  flex: none;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
}

.critical .alert-dot {
  background: #f4344c;
  box-shadow: 0 0 0 3px rgba(244, 52, 76, 0.25);
}

.warning .alert-dot {
  background: #fbbf24;
  box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.2);
}

.alert-text {
  min-width: 0;
  flex: 1;
  font-size: 0.9rem;
  color: #fff;
}

/* the names, after the count: "Steel nails 2", Cement 40kg" */
.alert-detail {
  margin-left: 0.4rem;
  font-size: 0.8rem;
  color: var(--color-zinc-400);
}

.alert-go {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.15rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-zinc-300);
}

.alert-row:hover .alert-go {
  color: #fff;
}

/* phones: the names go under the count */
@media (max-width: 640px) {
  .alert-detail {
    display: block;
    margin-left: 0;
  }
}
</style>
