'use client'

/**
 * Quién contesta primero.
 *
 * Cuando llega un mensaje, cuatro cosas podrían responderlo y solo una lo
 * hace. El orden es siempre el mismo y no es negociable:
 *
 *   flujo  ->  automatización  ->  agente de IA  ->  humano
 *
 * Lo determinista gana a lo probabilístico. Si el flujo se hace cargo del
 * mensaje, la IA no contesta — porque si contestaran los dos, el cliente
 * recibiría dos respuestas a la misma pregunta.
 *
 * Este cuadrito existe porque esa regla es invisible desde la interfaz, y su
 * ausencia produce siempre la misma pregunta: «configuré el agente de IA,
 * ¿por qué no responde?». Se muestra en los tres módulos y marca en cuál
 * está parado el usuario, para que la respuesta llegue antes que la duda.
 */

import { useTranslations } from 'next-intl'
import { Bot, ChevronRight, UserRound, Workflow, Zap } from 'lucide-react'

import { cn } from '@/lib/utils'

export type EslabonCadena = 'flujos' | 'automatizaciones' | 'ia' | 'humano'

const ESLABONES: { clave: EslabonCadena; icono: typeof Workflow }[] = [
  { clave: 'flujos', icono: Workflow },
  { clave: 'automatizaciones', icono: Zap },
  { clave: 'ia', icono: Bot },
  { clave: 'humano', icono: UserRound },
]

export function QuienContestaPrimero({
  /** El módulo en el que está el usuario. Se resalta. */
  actual,
  className,
}: {
  actual?: EslabonCadena
  className?: string
}) {
  const t = useTranslations('PuestaEnMarcha.cadena')

  return (
    <section
      className={cn(
        'border-border bg-card/50 rounded-lg border px-4 py-3',
        className,
      )}
      aria-label={t('titulo')}
    >
      <p className="text-muted-foreground mb-3 text-xs font-medium">{t('titulo')}</p>

      {/* Desborda en horizontal dentro de su propia caja: en un móvil la
          cadena no cabe, y lo que no puede pasar es que empuje la página. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <ol className="flex min-w-max items-stretch gap-1">
          {ESLABONES.map((eslabon, indice) => {
            const Icono = eslabon.icono
            const esActual = eslabon.clave === actual
            return (
              <li key={eslabon.clave} className="flex items-stretch gap-1">
                <div
                  className={cn(
                    'flex w-[7.5rem] flex-col gap-1 rounded-md border px-2.5 py-2 transition-colors',
                    esActual
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border bg-background',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Icono
                      className={cn(
                        'h-3.5 w-3.5 shrink-0',
                        esActual ? 'text-primary' : 'text-muted-foreground',
                      )}
                    />
                    <span
                      className={cn(
                        'text-xs font-semibold',
                        esActual ? 'text-primary' : 'text-foreground',
                      )}
                    >
                      {t(`${eslabon.clave}.titulo`)}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-[11px] leading-snug">
                    {t(`${eslabon.clave}.detalle`)}
                  </span>
                  {esActual && (
                    <span className="text-primary mt-0.5 text-[10px] font-semibold uppercase tracking-wide">
                      {t('estasAca')}
                    </span>
                  )}
                </div>
                {indice < ESLABONES.length - 1 && (
                  <ChevronRight
                    className="text-muted-foreground/50 h-3.5 w-3.5 shrink-0 self-center"
                    aria-hidden
                  />
                )}
              </li>
            )
          })}
        </ol>
      </div>

      <p className="text-muted-foreground mt-3 text-[11px] leading-relaxed">
        {t('explicacion')}
      </p>
    </section>
  )
}
