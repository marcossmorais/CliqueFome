import 'server-only';

/** Data civil da operação, estável para a renderização/hidratação. */
export function dataHojeEmSaoPaulo() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

export function intervaloHojeEmSaoPaulo() {
  const data = dataHojeEmSaoPaulo();
  const amanhaUtc = new Date(`${data}T12:00:00Z`);
  amanhaUtc.setUTCDate(amanhaUtc.getUTCDate() + 1);
  const amanha = amanhaUtc.toISOString().slice(0, 10);
  return {
    data,
    inicio: `${data}T00:00:00-03:00`,
    fim: `${amanha}T00:00:00-03:00`,
  };
}
