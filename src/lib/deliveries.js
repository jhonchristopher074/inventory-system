// Delivery schedules (the Calendar's Delivery tab), shared by both
// calendars and the Owner's and Staff dashboards.

// a delivery whose status says it arrived (any of the words people used)
export function isDelivered(delivery) {
  return ['delivered', 'done', 'completed'].includes(String(delivery?.status || '').trim().toLowerCase())
}
