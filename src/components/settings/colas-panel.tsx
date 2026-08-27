'use client'

/**
 * Colas de asesores.
 *
 * Una cola es un destino con nombre — Ventas, Soporte — y la gente que lo
 * atiende. Existe para que quien arma un flujo no tenga que saber quién va a
 * estar disponible: dice «a Ventas» y el reparto se decide acá, sin volver a
 * abrir ningún flujo.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { canEditSettings } from '@/lib/auth/roles'
import { COLOR_DE_COLA, useColas, type ColaConMiembros } from '@/hooks/use-colas'
import type { AccountMember } from '@/types'

const COLORES = ['emerald', 'blue', 'amber', 'violet', 'rose', 'cyan', 'slate']

export function ColasPanel() {
  const { accountRole } = useAuth()
  const puedeEditar = accountRole ? canEditSettings(accountRole) : false
  const { colas, cargando, recargar } = useColas()

  const [miembros, setMiembros] = useState<AccountMember[]>([])
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch('/api/account/members', { cache: 'no-store' })
        if (!r.ok) return
        const json = (await r.json()) as { members?: AccountMember[] }
        setMiembros(json.members ?? [])
      } catch {
        // Sin la lista no se pueden repartir asesores, pero las colas se
        // siguen viendo y renombrando. Se degrada, no se rompe.
      }
    })()
  }, [])

  async function crear() {
    const nombre = nombreNuevo.trim()
    if (!nombre) return
    setCreando(true)
    try {
      const r = await fetch('/api/colas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nombre,
          // Se rota el color según cuántas haya, para que dos colas seguidas
          // no salgan iguales y haya que cambiarlas a mano.
          color: COLORES[colas.length % COLORES.length],
        }),
      })
      const json = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(json.error ?? 'No se pudo crear la cola')
      setNombreNuevo('')
      await recargar()
      toast.success(`Cola «${nombre}» creada`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear la cola')
    } finally {
      setCreando(false)
    }
  }

  if (cargando) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-foreground text-base font-semibold">
          Colas de asesores
        </h2>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          Agrupá a tu equipo por lo que atiende. Después, en un flujo o en una
          automatización, podés mandar la conversación a la cola en vez de a
          una persona: la toma quien esté disponible ese día.
        </p>
      </div>

      {puedeEditar && (
        <div className="border-border flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <div className="min-w-[12rem] flex-1">
            <label className="text-muted-foreground mb-1 block text-xs">
              Nombre de la cola nueva
            </label>
            <Input
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void crear()
              }}
              placeholder="Ventas, Soporte, Facturación…"
              className="bg-muted"
            />
          </div>
          <Button onClick={() => void crear()} disabled={!nombreNuevo.trim() || creando}>
            {creando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Crear
          </Button>
        </div>
      )}

      {colas.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
          Todavía no hay colas. Creá la primera arriba — por ejemplo «Ventas».
        </div>
      ) : (
        <ul className="space-y-3">
          {colas.map((cola) => (
            <FilaDeCola
              key={cola.id}
              cola={cola}
              miembros={miembros}
              puedeEditar={puedeEditar}
              onCambio={recargar}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function FilaDeCola({
  cola,
  miembros,
  puedeEditar,
  onCambio,
}: {
  cola: ColaConMiembros
  miembros: AccountMember[]
  puedeEditar: boolean
  onCambio: () => Promise<void>
}) {
  const [nombre, setNombre] = useState(cola.name)
  const [guardando, setGuardando] = useState(false)
  const enLaCola = new Set(cola.miembros.map((m) => m.user_id))

  async function parchear(cambios: Record<string, unknown>) {
    setGuardando(true)
    try {
      const r = await fetch(`/api/colas/${cola.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cambios),
      })
      const json = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(json.error ?? 'No se pudo guardar')
      await onCambio()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
      setNombre(cola.name) // deshacer lo que se ve, ya que no se guardó
    } finally {
      setGuardando(false)
    }
  }

  async function borrar() {
    // `confirm` y no un diálogo propio: borrar una cola es raro y no vale una
    // pantalla nueva. Lo que sí importa es decir qué pasa con lo que espera.
    const seguro = window.confirm(
      `¿Borrar la cola «${cola.name}»?\n\nLas conversaciones que estén esperando en ella quedan sin cola, pero no se borran.`,
    )
    if (!seguro) return
    try {
      const r = await fetch(`/api/colas/${cola.id}`, { method: 'DELETE' })
      const json = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(json.error ?? 'No se pudo borrar')
      await onCambio()
      const liberadas = json.conversacionesLiberadas ?? 0
      toast.success(
        liberadas > 0
          ? `Cola borrada. ${liberadas} ${liberadas === 1 ? 'conversación quedó' : 'conversaciones quedaron'} sin cola.`
          : 'Cola borrada',
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo borrar')
    }
  }

  function alternarMiembro(userId: string) {
    const siguientes = enLaCola.has(userId)
      ? [...enLaCola].filter((u) => u !== userId)
      : [...enLaCola, userId]
    void parchear({ miembros: siguientes })
  }

  return (
    <li
      className={cn(
        'border-border bg-card rounded-lg border p-4',
        !cola.is_active && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            'h-3 w-3 shrink-0 rounded-full',
            COLOR_DE_COLA[cola.color] ?? COLOR_DE_COLA.slate,
          )}
        />

        <div className="min-w-[10rem] flex-1">
          {puedeEditar ? (
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onBlur={() => {
                if (nombre.trim() && nombre.trim() !== cola.name) {
                  void parchear({ name: nombre.trim() })
                }
              }}
              className="bg-muted h-8"
            />
          ) : (
            <span className="text-foreground text-sm font-medium">{cola.name}</span>
          )}
        </div>

        {guardando && (
          <Loader2 className="text-muted-foreground h-4 w-4 shrink-0 animate-spin" />
        )}

        {puedeEditar && (
          <>
            <label className="flex shrink-0 items-center gap-2">
              <Switch
                checked={cola.is_active}
                onCheckedChange={(v) => void parchear({ is_active: v })}
                aria-label="Activa"
              />
              <span className="text-muted-foreground text-xs">Activa</span>
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void borrar()}
              className="shrink-0 text-muted-foreground hover:text-red-400"
              aria-label={`Borrar ${cola.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      <div className="mt-3">
        <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs">
          <Users className="h-3.5 w-3.5" />
          {cola.miembros.length === 0
            ? // Lo más útil que se puede decir de una cola vacía: que no sirve.
              'Sin asesores. Nadie va a ver las conversaciones que caigan acá.'
            : `${cola.miembros.length} ${cola.miembros.length === 1 ? 'asesor' : 'asesores'}`}
        </p>

        {/* flex-wrap sobre etiquetas de ancho natural: con nombres largos, una
            rejilla de columnas fijas desborda en pantallas angostas. */}
        <div className="flex flex-wrap gap-1.5">
          {miembros.map((m) => {
            const dentro = enLaCola.has(m.user_id)
            return (
              <button
                key={m.user_id}
                type="button"
                disabled={!puedeEditar}
                aria-pressed={dentro}
                onClick={() => alternarMiembro(m.user_id)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors',
                  dentro
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground',
                  puedeEditar
                    ? 'hover:border-primary/40 cursor-pointer'
                    : 'cursor-default',
                )}
              >
                {m.full_name || m.email || m.user_id.slice(0, 8)}
              </button>
            )
          })}
        </div>
      </div>
    </li>
  )
}
