/**
 * El AudioContext compartido de la aplicación.
 *
 * Uno solo para todo: el aviso de mensaje nuevo y los tonos del teclado del
 * teléfono. Tener uno por módulo funcionaría, pero cada contexto es un
 * recurso de audio del sistema, los navegadores limitan cuántos se pueden
 * abrir, y sobre todo: cada uno habría que desbloquearlo por separado con un
 * gesto de la persona. Con uno solo, el primer clic los desbloquea todos.
 *
 * Los navegadores prohíben reproducir audio antes de que la persona
 * interactúe con la página, y vuelven a suspender el contexto cuando la
 * pestaña pasa a segundo plano. Por eso `desbloquear()` no se llama una vez
 * al arrancar sino en cada gesto (ver `mantenerAudioVivo`).
 */

let contexto: AudioContext | null = null

/**
 * Devuelve el contexto, creándolo si hace falta. `null` si el navegador no
 * tiene Web Audio: quien llama simplemente no suena, nunca falla.
 */
export function obtenerContexto(): AudioContext | null {
  if (contexto) return contexto
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (Ctor) contexto = new Ctor()
  } catch {
    // Sin audio disponible se sigue sin sonido.
  }
  return contexto
}

/** Crea el contexto si no existe y lo reanuda si estaba suspendido. */
export function desbloquear(): void {
  const ctx = obtenerContexto()
  if (ctx && ctx.state === 'suspended') void ctx.resume()
}

/**
 * Engancha los gestos que mantienen el audio vivo. Devuelve la función para
 * desengancharlos.
 *
 * Se registra SIN `once` a propósito: un solo gesto no alcanza. El navegador
 * vuelve a suspender el contexto cada vez que la pestaña queda en segundo
 * plano un rato, y si solo se escuchara el primer clic de la sesión el sonido
 * se apagaría para siempre a media mañana sin que nadie supiera por qué.
 */
export function mantenerAudioVivo(): () => void {
  const alInteractuar = () => desbloquear()
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
 * Ejecuta `emitir` con el contexto listo.
 *
 * Si estaba suspendido lo reanuda y emite CUANDO TERMINE, en vez de darse por
 * vencido: reanudar es asíncrono, y salir sin sonar significaba perder
 * justamente el aviso del mensaje que llegó mientras mirabas otra pestaña.
 */
export function conAudioListo(emitir: (ctx: AudioContext) => void): void {
  const ctx = obtenerContexto()
  if (!ctx || ctx.state === 'closed') return

  if (ctx.state === 'suspended') {
    void ctx.resume().then(
      () => {
        if (ctx.state === 'running') emitir(ctx)
      },
      () => {
        // Reanudar sin un gesto reciente está prohibido y el rechazo es
        // normal. Se calla y ya.
      },
    )
    return
  }

  emitir(ctx)
}
