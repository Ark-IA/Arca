'use client'

/**
 * ¿Quién sigue con esta conversación?
 *
 * El mismo control en dos sitios: el nodo de entrega de un flujo y el paso
 * «asignar conversación» de una automatización. Es deliberado que sea el
 * mismo componente y no dos parecidos — la pregunta es idéntica, y dos
 * versiones se separarían al primer arreglo que alguien hiciera en una.
 *
 * Cada opción explica qué pasa después, porque la diferencia entre las tres
 * no está en el nombre sino en la consecuencia: entregar al agente de IA
 * vuelve a encender las respuestas automáticas, y mandar a una cola las
 * apaga. Sin decirlo, se elige a ciegas.
 */

import { Bot, UserRound, Users } from 'lucide-react'

import { cn } from '@/lib/utils'
import { COLOR_DE_COLA, useColas } from '@/hooks/use-colas'
import type { DestinoConversacion } from '@/lib/entrega/destino-conversacion'

const OPCIONES: {
  valor: DestinoConversacion
  icono: typeof Bot
  titulo: string
  detalle: string
}[] = [
  {
    valor: 'ia',
    icono: Bot,
    titulo: 'El agente de IA',
    detalle: 'Vuelve a responder solo, con tus propias palabras.',
  },
  {
    valor: 'cola',
    icono: Users,
    titulo: 'Una cola de asesores',
    detalle: 'Queda pendiente para el equipo que la atiende. La IA se calla.',
  },
  {
    valor: 'asesor',
    icono: UserRound,
    titulo: 'Un asesor concreto',
    detalle: 'Queda a nombre de una persona. La IA se calla.',
  },
]

export function SelectorDeDestino({
  destino,
  colaId,
  onCambiarDestino,
  onCambiarCola,
  /** El selector de persona lo pone quien llama: cada motor ya tiene el suyo. */
  selectorDeAsesor,
  className,
}: {
  destino: DestinoConversacion
  colaId?: string
  onCambiarDestino: (d: DestinoConversacion) => void
  onCambiarCola: (id: string) => void
  selectorDeAsesor?: React.ReactNode
  className?: string
}) {
  const { colas, cargando } = useColas()
  const activas = colas.filter((c) => c.is_active)
  const elegida = activas.find((c) => c.id === colaId)

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-col gap-2">
        {OPCIONES.map((o) => {
          const Icono = o.icono
          const seleccionado = destino === o.valor
          return (
            <button
              key={o.valor}
              type="button"
              aria-pressed={seleccionado}
              onClick={() => onCambiarDestino(o.valor)}
              className={cn(
                'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                seleccionado
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-background hover:border-primary/40 hover:bg-muted',
              )}
            >
              <Icono
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  seleccionado ? 'text-primary' : 'text-muted-foreground',
                )}
              />
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-sm font-medium',
                    seleccionado ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {o.titulo}
                </span>
                <span className="text-muted-foreground block text-xs leading-relaxed">
                  {o.detalle}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {destino === 'cola' && (
        <div>
          <label className="text-foreground mb-1 block text-xs font-medium">
            ¿A qué cola?
          </label>

          {cargando ? (
            <p className="text-muted-foreground text-xs">Cargando colas…</p>
          ) : activas.length === 0 ? (
            // Sin colas creadas, un desplegable vacío no explica nada. Se dice
            // dónde se crean, que es la única acción útil en este momento.
            <p className="text-xs leading-relaxed text-amber-400">
              Todavía no creaste ninguna cola. Se crean en Configuración →
              Colas de asesores; hasta entonces la conversación quedaría
              pendiente sin equipo asignado.
            </p>
          ) : (
            <>
              <select
                value={colaId ?? ''}
                onChange={(e) => onCambiarCola(e.target.value)}
                className="border-border bg-muted text-foreground focus:border-primary w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
              >
                <option value="">Elegí una cola…</option>
                {activas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {elegida && (
                <p className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-xs">
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      COLOR_DE_COLA[elegida.color] ?? COLOR_DE_COLA.slate,
                    )}
                  />
                  {elegida.miembros.length === 0
                    ? // Una cola sin nadie no le llega a nadie: la conversación
                      // quedaría pendiente para siempre y nadie se enteraría.
                      'Esta cola no tiene asesores. Nadie la va a ver hasta que le asignes gente.'
                    : `La atienden ${elegida.miembros.length} ${
                        elegida.miembros.length === 1 ? 'asesor' : 'asesores'
                      }: ${elegida.miembros
                        .map((m) => m.full_name ?? 'sin nombre')
                        .join(', ')}.`}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {destino === 'asesor' && selectorDeAsesor}
    </div>
  )
}
