/**
 * Aviso sonoro de mensaje nuevo.
 *
 * El sonido se SINTETIZA en el navegador en vez de servir un archivo. Tres
 * razones, y las tres importan:
 *
 *   1. Un mp3 son ~20 KB que hay que descargar antes de poder sonar. El
 *      primer mensaje del dia llegaria en silencio mientras se baja.
 *   2. Sin archivo no hay nada que se pueda perder en un despliegue ni que
 *      dependa de que el almacenamiento este disponible.
 *   3. El tono se puede afinar por canal sin producir tres archivos: cada
 *      canal suena distinto y se sabe de donde entro el mensaje sin mirar
 *      la pantalla.
 *
 * Los navegadores prohiben reproducir audio antes de que la persona
 * interactue con la pagina. Por eso `prepararAudio()` se llama en el primer
 * clic o tecla, no al cargar.
 */

type Canal = 'whatsapp' | 'facebook' | 'instagram'

let contexto: AudioContext | null = null

/**
 * Deja el audio listo. Debe invocarse desde un gesto de la persona (clic,
 * tecla); llamado antes, el navegador crea el contexto en estado
 * 'suspended' y el primer aviso no suena.
 *
 * Se puede llamar tantas veces como se quiera: si el contexto ya existe se
 * limita a reanudarlo. Eso importa porque el navegador SUSPENDE el contexto
 * cuando la pestaña pasa a segundo plano -- justo cuando el aviso hace mas
 * falta -- y solo un gesto de la persona puede reanimarlo.
 */
export function prepararAudio(): void {
  if (contexto) {
    if (contexto.state === 'suspended') void contexto.resume()
    return
  }
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (Ctor) contexto = new Ctor()
  } catch {
    // Sin audio disponible se sigue sin sonido: nunca se rompe la bandeja
    // por no poder emitir un aviso.
  }
}

/**
 * Engancha los gestos que mantienen el audio vivo.
 *
 * Se registra SIN `once`: un solo gesto no alcanza. El navegador vuelve a
 * suspender el contexto cada vez que la pestaña queda en segundo plano un
 * rato, y si solo se escuchara el primer clic de la sesion el aviso se
 * apagaria para siempre a media mañana sin que nadie supiera por que.
 *
 * Devuelve la funcion para desengancharlo.
 */
export function mantenerAudioVivo(): () => void {
  const alInteractuar = () => prepararAudio()
  window.addEventListener('pointerdown', alInteractuar)
  window.addEventListener('keydown', alInteractuar)
  document.addEventListener('visibilitychange', alInteractuar)
  return () => {
    window.removeEventListener('pointerdown', alInteractuar)
    window.removeEventListener('keydown', alInteractuar)
    document.removeEventListener('visibilitychange', alInteractuar)
  }
}

/**
 * Dos notas por canal, en frecuencias distintas.
 *
 * WhatsApp sube (mensaje de trabajo, tono neutro y claro), Facebook es mas
 * grave, Instagram mas agudo. La diferencia es suficiente para
 * distinguirlos de oido sin que ninguno resulte estridente.
 */
const TONOS: Record<Canal, [number, number]> = {
  whatsapp: [880, 1174.7], // La5 → Re6
  facebook: [587.3, 784.0], // Re5 → Sol5
  instagram: [1046.5, 1396.9], // Do6 → Fa6
}

/**
 * Emite el aviso. Silencioso y sin lanzar si el audio no esta disponible:
 * un aviso que falla no puede interrumpir la atencion.
 */
export function sonarAvisoDeMensaje(canal: Canal = 'whatsapp'): void {
  if (!contexto) prepararAudio()
  if (!contexto || contexto.state === 'closed') return

  const ctx = contexto

  // Suspendido: se reanuda y SE TOCA IGUAL cuando termine.
  //
  // La version anterior reanudaba y se iba con un `return`, asi que ese aviso
  // se perdia entero. Como el navegador suspende el contexto cada vez que la
  // pestaña queda en segundo plano, el mensaje que llegaba mientras estabas
  // en otra pestaña -- el unico que de verdad necesitas oir -- era
  // exactamente el que nunca sonaba.
  if (ctx.state === 'suspended') {
    void ctx.resume().then(
      () => {
        if (ctx.state === 'running') emitir(ctx, canal)
      },
      () => {
        // Reanudar sin un gesto reciente esta prohibido y el rechazo es
        // normal. Se calla y ya.
      },
    )
    return
  }

  emitir(ctx, canal)
}

function emitir(ctx: AudioContext, canal: Canal): void {
  const ahora = ctx.currentTime
  const [nota1, nota2] = TONOS[canal] ?? TONOS.whatsapp

  const tocar = (frecuencia: number, desde: number, duracion: number) => {
    const osc = ctx.createOscillator()
    const vol = ctx.createGain()

    // Onda triangular: mas suave que la cuadrada, con mas cuerpo que la
    // senoidal. Se oye por encima del ruido de oficina sin resultar dura.
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(frecuencia, desde)

    // La envolvente evita el "clic" que produce arrancar y cortar una onda
    // de golpe. El volumen maximo es 0.12: audible, no molesto en repeticion.
    vol.gain.setValueAtTime(0, desde)
    vol.gain.linearRampToValueAtTime(0.12, desde + 0.012)
    vol.gain.exponentialRampToValueAtTime(0.0001, desde + duracion)

    osc.connect(vol)
    vol.connect(ctx.destination)
    osc.start(desde)
    osc.stop(desde + duracion + 0.02)
  }

  tocar(nota1, ahora, 0.12)
  tocar(nota2, ahora + 0.1, 0.2)
}

/**
 * Evita la avalancha.
 *
 * Cuando entran diez mensajes juntos -- una campana que rebota, alguien que
 * escribe cinco lineas seguidas -- diez avisos encimados suenan a alarma.
 * Con esto suena uno y los demas quedan callados por medio segundo.
 */
let ultimoAviso = 0
export function avisarMensajeNuevo(canal: Canal = 'whatsapp'): void {
  const ahora = Date.now()
  if (ahora - ultimoAviso < 500) return
  ultimoAviso = ahora
  sonarAvisoDeMensaje(canal)
}

// ============================================================
// Preferencia
// ============================================================

const CLAVE = 'wacrm.inbox.sonido'

export function sonidoActivado(): boolean {
  try {
    // Activado por defecto: el pedido era justamente enterarse sin mirar.
    return localStorage.getItem(CLAVE) !== 'off'
  } catch {
    return true
  }
}

export function cambiarSonido(activado: boolean): void {
  try {
    localStorage.setItem(CLAVE, activado ? 'on' : 'off')
  } catch {}
}
