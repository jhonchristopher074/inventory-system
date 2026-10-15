/**
 * Prints the receipt shown on screen in its own small window.
 *
 * Before this existed, the POS and Sales History screens each had their
 * own copy of this code, and all of them crashed when the browser blocked
 * the pop-up (window.open returns null). They also closed the window
 * straight after print(), which cancels the print dialog in some browsers.
 */

const RECEIPT_STYLES = `
  body { font-family: Arial, sans-serif; padding: 20px; }
  .text-center { text-align: center; }
  .font-bold { font-weight: bold; }
  .font-extrabold { font-weight: 800; }
  .text-2xl { font-size: 24px; }
  .text-lg { font-size: 18px; }
  .text-sm { font-size: 14px; }
  .text-xs { font-size: 12px; }
  .flex { display: flex; }
  .justify-between { justify-content: space-between; }
  .gap-3 { gap: 12px; }
  .my-4 { margin-top: 16px; margin-bottom: 16px; }
  .mt-2 { margin-top: 8px; }
  .mt-5 { margin-top: 20px; }
  .space-y-3 > * + * { margin-top: 12px; }
  .border-t { border-top: 1px dashed #000; }
  @media print { body { margin: 0; } }
`

/**
 * @param {string} elementId  id of the element holding the receipt
 */
export function printElement(elementId) {
  const element = document.getElementById(elementId)
  if (!element) return

  const printWindow = window.open('', '', 'width=400,height=600')

  if (!printWindow) {
    alert('Your browser blocked the print window. Allow pop-ups for this site, then press Print again.')
    return
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>Receipt</title>
        <style>${RECEIPT_STYLES}</style>
      </head>
      <body>${element.innerHTML}</body>
    </html>
  `)
  printWindow.document.close()

  // close only once printing is done (or the dialog was cancelled)
  printWindow.onafterprint = () => printWindow.close()
  printWindow.focus()
  printWindow.print()
}
