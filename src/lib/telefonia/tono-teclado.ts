/**
 * Tonos del teclado del teléfono.
 *
 * No son un "clic" genérico: son los DTMF de verdad, los mismos que emite un
 * teléfono físico. Cada tecla suena como dos frecuencias a la vez -- una de
 * su fila y otra de su columna -- y esa combinación es exactamente lo que las
 * centrales del mundo entero interpretan como dígito desde 1963.
 *
 * Importa que sean los reales y no un pitido inventado: cuando marcás dentro
 * de una llamada (un menú de voz, una extensión), el tono que oís por el
 * altavoz coincide con el que Asterisk está enviando por la línea. Si fueran
 * distintos, un menú que no responde sonaría igual que uno que sí, y no
 * habría forma de saber cuál falló.
 */

import { conAudioListo } from '@/lib/audio/contexto'

/**
 * La rejilla DTMF. Filas de arriba abajo (697, 770, 852, 941 Hz) y columnas
 * de izquierda a derecha (1209, 1336, 1477 Hz), igual que el teclado.
 */
const FILAS = [697, 770, 852, 941]
const COLUMNAS = [1209, 1336, 1477]

const REJILLA: Record<string, [number, number]> = {}
;[
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
].forEach((fila, f) => {
  fila.forEach((tecla, c) => {
    REJILLA[tecla] = [FILAS[f], COLUMNAS[c]]
  })
})

/** Duración de una pulsación. El mínimo que reconoce una central son 40 ms;
 *  80 ms se oye como un toque nítido sin arrastrarse. */
const DURACION = 0.08

export function sonarTecla(tecla: string): void {
  const par = REJILLA[tecla]
  if (!par) return

  conAudioListo((ctx) => {
    const desde = ctx.currentTime
    const mezcla = ctx.createGain()

    // Envolvente corta en la salida común, no en cada oscilador: si cada uno
    // arrancara por su cuenta se oiría un chasquido al desalinearse.
    // 0.08 de volumen: presente pero por debajo de la voz de la llamada, que
    // es lo que de verdad hay que escuchar.
    mezcla.gain.setValueAtTime(0, desde)
    mezcla.gain.linearRampToValueAtTime(0.08, desde + 0.008)
    mezcla.gain.setValueAtTime(0.08, desde + DURACION - 0.012)
    mezcla.gain.exponentialRampToValueAtTime(0.0001, desde + DURACION)
    mezcla.connect(ctx.destination)

    for (const frecuencia of par) {
      const osc = ctx.createOscillator()
      // Senoidal, no triangular: el DTMF real son dos senos puros. Una onda
      // con armónicos ensucia el par y deja de sonar a teléfono.
      osc.type = 'sine'
      osc.frequency.setValueAtTime(frecuencia, desde)
      osc.connect(mezcla)
      osc.start(desde)
      osc.stop(desde + DURACION + 0.02)
    }
  })
}
