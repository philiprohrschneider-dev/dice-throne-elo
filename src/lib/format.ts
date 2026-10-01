export function signed(n: number): string {
  if (n > 0) return `+${n}`
  if (n < 0) return `−${Math.abs(n)}`
  return '±0'
}

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
export const formatDate = (iso: string) => (iso ? dateFmt.format(new Date(iso)) : '')

export const percent = (p: number) => `${Math.round(p * 100)} %`
