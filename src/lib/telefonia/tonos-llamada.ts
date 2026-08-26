/**
 * Tono de llamada y timbre.
 *
 * WebRTC no trae ninguno de los dos. En un teléfono de toda la vida el tono
 * que oís mientras suena del otro lado lo genera la central y viaja por la
 * línea; en el navegador no llega nada hasta que el otro contesta, así que
 * pulsar "Llamar" y quedarse en silencio es indistinguible de que la llamada
 * no haya salido. Estos tonos los produce el propio navegador.
 *
 * Las dos funciones devuelven la manera de pararlos. Quien las llama es
 * responsable de hacerlo: un tono que sigue sonando después de contestar se
 * mezcla con la voz.
 */

import { conAudioListo, obtenerContexto } from '@/lib/audio/contexto'

interface Cadencia {
  /** Frecuencias que suenan a la vez. */
  frecuencias: number[]
  /** Segundos de sonido. */
  encendido: number
  /** Segundos de silencio hasta el siguiente. */
  apagado: number
  volumen: number
}

/**
 * Tono de llamada saliente: 425 Hz, el estándar en Latinoamérica y Europa.
 *
 * La cadencia real acá es 1 segundo de tono y 4 de silencio. Se acorta el
 * silencio a 2: cuatro segundos de nada justo después de pulsar "Llamar" es
 * exactamente la sensación de "no funcionó" que este tono viene a evitar.
 */
const LLAMANDO: Cadencia = {
  frecuencias: [425],
  encendido: 1,
  apagado: 2,
  volumen: 0.07,
}

/**
 * Timbre de llamada entrante: dos frecuencias y ráfaga doble.
 *
 * Distinto a propósito del tono de llamada saliente: hay que poder
 * distinguir de oído "te están llamando" de "estás llamando", sobre todo
 * cuando la pestaña está en segundo plano.
 */
const TIMBRE: Cadencia = {
  frecuencias: [440, 480],
  encendido: 0.4,
  apagado: 0.2,
  volumen: 0.09,
}

function reproducirCadencia(cadencia: Cadencia, doble: boolean): () => void {
  let parado = false
  let temporizador: ReturnType<typeof setTimeout> | null = null
  const vivos: { osc: OscillatorNode; gain: GainNode }[] = []

  const rafaga = (ctx: AudioContext, desde: number) => {
    const mezcla = ctx.createGain()
    mezcla.gain.setValueAtTime(0, desde)
    mezcla.gain.linearRampToValueAtTime(cadencia.volumen, desde + 0.02)
    mezcla.gain.setValueAtTime(cadencia.volumen, desde + cadencia.encendido - 0.03)
    mezcla.gain.exponentialRampToValueAtTime(0.0001, desde + cadencia.encendido)
    mezcla.connect(ctx.destination)

    for (const f of cadencia.frecuencias) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(f, desde)
      osc.connect(mezcla)
      osc.start(desde)
      osc.stop(desde + cadencia.encendido + 0.05)
      vivos.push({ osc, gain: mezcla })
    }
  }

  const ciclo = () => {
    if (parado) return
    conAudioListo((ctx) => {
      if (parado) return
      const ahora = ctx.currentTime
      rafaga(ctx, ahora)
      // El timbre entrante son dos ráfagas seguidas y luego la pausa larga,
      // como el "ring-ring" de un teléfono.
      if (doble) rafaga(ctx, ahora + cadencia.encendido + cadencia.apagado)
    })

    const largo = doble
      ? (cadencia.encendido + cadencia.apagado) * 2 + cadencia.apagado * 4
      : cadencia.encendido + cadencia.apagado
    temporizador = setTimeout(ciclo, largo * 1000)
  }

  ciclo()

  return () => {
    parado = true
    if (temporizador) clearTimeout(temporizador)
    // Se cortan los osciladores que quedaran sonando. Sin esto, colgar en
    // mitad de una ráfaga la dejaría terminar encima de la voz.
    const ctx = obtenerContexto()
    for (const { osc, gain } of vivos) {
      try {
        if (ctx) gain.gain.cancelScheduledValues(ctx.currentTime)
        gain.gain.setValueAtTime(0, ctx ? ctx.currentTime : 0)
        osc.stop()
      } catch {
        // Ya había terminado por su cuenta. Es lo normal.
      }
    }
    vivos.length = 0
  }
}

/** Tono mientras esperás que el otro conteste. Devuelve cómo pararlo. */
export function iniciarTonoDeLlamada(): () => void {
  return reproducirCadencia(LLAMANDO, false)
}

/** Timbre de llamada entrante. Devuelve cómo pararlo. */
export function iniciarTimbre(): () => void {
  return reproducirCadencia(TIMBRE, true)
}
