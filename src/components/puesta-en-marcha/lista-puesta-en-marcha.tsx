'use client'

/**
 * Lista de puesta en marcha.
 *
 * Cinco pasos que se tildan solos leyendo el estado real de la cuenta. No es
 * un tutorial: un tutorial hay que leerlo, y además envejece mal — en cuanto
 * el producto cambia, empieza a mentir. Esto no explica cómo se hace, dice
 * qué falta y abre la pantalla donde se hace.
 *
 * Dos decisiones que valen la pena:
 *
 *   - NUNCA bloquea. Un paso puede depender de otro y decirlo, pero el botón
 *     sigue funcionando. Quien ya sabe lo que hace no tiene por qué pedir
 *     permiso para saltar.
 *   - Desaparece al completarse. En una cuenta vacía las métricas del panel
 *     son cuatro ceros que no dicen nada y esta lista es todo; en una cuenta
 *     andando pasa exactamente lo contrario. Se turnan.
 */

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  ArrowRight,
  Bot,
  Check,
  MessageCircle,
  PlugZap,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { usePuestaEnMarcha, type EstadoPuestaEnMarcha } from '@/hooks/use-puesta-en-marcha'

interface Paso {
  clave: string
  icono: typeof MessageCircle
  hecho: boolean
  destino: string
  /** Aviso ámbar: está a medias, y de una forma que no se nota sola. */
  aviso?: string
}

function construirPasos(
  estado: EstadoPuestaEnMarcha,
  t: ReturnType<typeof useTranslations>,
): Paso[] {
  return [
    {
      clave: 'canal',
      icono: PlugZap,
      hecho: estado.canales.conectados > 0,
      destino: '/settings?tab=whatsapp',
    },
    {
      clave: 'flujo',
      icono: Workflow,
      hecho: estado.flujos.total > 0,
      destino: '/flows',
    },
    {
      clave: 'bienvenida',
      icono: MessageCircle,
      hecho: estado.flujos.bienvenida,
      destino: '/flows',
      // El fallo silencioso número uno: todo configurado y en borrador, así
      // que no saluda a nadie y nada en pantalla lo dice.
      aviso:
        estado.flujos.soloBorradores && !estado.flujos.bienvenida
          ? t('pasos.bienvenida.avisoBorrador')
          : undefined,
    },
    {
      clave: 'automatizacion',
      icono: Zap,
      hecho: estado.automatizaciones.activas > 0,
      destino: '/automations',
      aviso:
        estado.automatizaciones.total > 0 && estado.automatizaciones.activas === 0
          ? t('pasos.automatizacion.avisoApagadas')
          : undefined,
    },
    {
      clave: 'ia',
      icono: Bot,
      hecho: estado.agenteIa.activo,
      destino: '/agents',
      aviso:
        estado.agenteIa.configurado && !estado.agenteIa.activo
          ? t('pasos.ia.avisoApagado')
          : undefined,
    },
  ]
}

export function ListaPuestaEnMarcha({
  /** En Configuración se muestra siempre, aunque esté completa. */
  siempreVisible = false,
}: {
  siempreVisible?: boolean
}) {
  const router = useRouter()
  const t = useTranslations('PuestaEnMarcha')
  const { estado, cargando } = usePuestaEnMarcha()

  if (cargando || !estado) return null

  const pasos = construirPasos(estado, t)
  const hechos = pasos.filter((p) => p.hecho).length
  const completa = hechos === pasos.length

  if (completa && !siempreVisible) return null

  // El primer paso pendiente es el único que se destaca. Cinco tarjetas
  // gritando a la vez no orientan a nadie.
  const siguiente = pasos.find((p) => !p.hecho)?.clave ?? null

  return (
    <Card className="border-border bg-card overflow-hidden p-0">
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Sparkles className="text-primary h-5 w-5 shrink-0" />
          <div>
            <h2 className="text-foreground text-sm font-semibold">
              {completa ? t('tituloCompleta') : t('titulo')}
            </h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {completa ? t('subtituloCompleta') : t('subtitulo')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs tabular-nums">
            {t('progreso', { hechos, total: pasos.length })}
          </span>
          <div
            className="bg-muted h-1.5 w-24 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={hechos}
            aria-valuemin={0}
            aria-valuemax={pasos.length}
          >
            <div
              className="bg-primary h-full rounded-full transition-all duration-500"
              style={{ width: `${(hechos / pasos.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <ol className="divide-border divide-y">
        {pasos.map((paso, indice) => {
          const Icono = paso.icono
          const esSiguiente = paso.clave === siguiente
          return (
            <li
              key={paso.clave}
              className={cn(
                'flex flex-wrap items-center gap-4 px-5 py-4 transition-colors',
                esSiguiente && 'bg-primary/5',
              )}
            >
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  paso.hecho
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                    : esSiguiente
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border bg-muted text-muted-foreground',
                )}
              >
                {paso.hecho ? <Check className="h-4 w-4" /> : indice + 1}
              </div>

              <div className="min-w-[14rem] flex-1">
                <div className="flex items-center gap-2">
                  <Icono
                    className={cn(
                      'h-4 w-4 shrink-0',
                      paso.hecho ? 'text-emerald-400' : 'text-muted-foreground',
                    )}
                  />
                  <span
                    className={cn(
                      'text-sm font-medium',
                      paso.hecho ? 'text-muted-foreground' : 'text-foreground',
                    )}
                  >
                    {t(`pasos.${paso.clave}.titulo`)}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  {t(`pasos.${paso.clave}.porQue`)}
                </p>
                {paso.aviso && (
                  <p className="mt-1.5 text-xs font-medium text-amber-400">
                    {paso.aviso}
                  </p>
                )}
              </div>

              <Button
                variant={esSiguiente ? 'default' : 'ghost'}
                size="sm"
                onClick={() => router.push(paso.destino)}
                className="shrink-0"
              >
                {paso.hecho ? t('revisar') : t('ir')}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
