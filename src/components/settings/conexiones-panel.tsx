'use client'

/**
 * Conexiones.
 *
 * Una cuenta puede tener varias líneas de WhatsApp, varias páginas de
 * Facebook y varias cuentas de Instagram. Esta pantalla las muestra todas
 * juntas y deja ajustar lo que la operación decide sobre cada una:
 *
 *   · cómo se llama, para poder distinguirlas de un vistazo
 *   · con qué instrucciones responde el agente en ESA conexión
 *   · si el agente responde ahí
 *   · a qué cola entran sus conversaciones
 *
 * Lo que NO se toca acá son las credenciales: para eso están las pantallas
 * de cada canal, que es donde vive el token y las comprobaciones contra
 * Meta. El botón «+ Nueva conexión» lleva a esa pantalla en vez de duplicar
 * el formulario, para que haya un solo sitio donde algo puede salir mal al
 * conectar.
 *
 * El campo del prompt vacío significa «usa el de la cuenta». Se dice en
 * pantalla y no solo acá: es la duda que aparece la primera vez que alguien
 * abre esta pantalla y ve un cuadro de texto en blanco.
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Bot,
  Camera,
  CheckCircle2,
  Inbox,
  Loader2,
  MessagesSquare,
  Plus,
  Save,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { canEditSettings } from '@/lib/auth/roles'
import { useColas } from '@/hooks/use-colas'
import type { SettingsSection } from '@/components/settings/settings-sections'

type Canal = 'whatsapp' | 'facebook' | 'instagram'

interface Conexion {
  id: string
  channel: Canal
  external_id: string
  name: string | null
  status: string
  last_error: string | null
  system_prompt: string | null
  ai_enabled: boolean
  cola_id: string | null
  conversaciones: number
}

const CANALES: Record<Canal, { titulo: string; icono: LucideIcon; seccion: SettingsSection; comoSeLlama: string }> = {
  whatsapp: {
    titulo: 'WhatsApp',
    icono: MessagesSquare,
    seccion: 'whatsapp',
    comoSeLlama: 'línea',
  },
  facebook: {
    titulo: 'Facebook',
    icono: MessagesSquare,
    seccion: 'facebook',
    comoSeLlama: 'página',
  },
  instagram: {
    titulo: 'Instagram',
    icono: Camera,
    seccion: 'instagram',
    comoSeLlama: 'cuenta',
  },
}

const ORDEN: Canal[] = ['whatsapp', 'facebook', 'instagram']

export function ConexionesPanel({ onIr }: { onIr?: (seccion: SettingsSection) => void }) {
  const { accountRole } = useAuth()
  const puedeEditar = accountRole ? canEditSettings(accountRole) : false
  const { colas } = useColas()

  const [conexiones, setConexiones] = useState<Conexion[]>([])
  const [cargando, setCargando] = useState(true)
  const [abierta, setAbierta] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/conexiones', { cache: 'no-store' })
      if (!r.ok) throw new Error()
      const json = (await r.json()) as { conexiones?: Conexion[] }
      setConexiones(json.conexiones ?? [])
    } catch {
      toast.error('No se pudieron cargar las conexiones.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  if (cargando) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Conexiones</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada línea de WhatsApp, página de Facebook y cuenta de Instagram que
          atiende esta cuenta. Podés darle a cada una sus propias
          instrucciones para el agente, para que el de ventas no responda como
          el de soporte.
        </p>
      </div>

      {conexiones.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium text-foreground">
            Todavía no hay ninguna conexión
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Conectá una línea de WhatsApp, una página de Facebook o una cuenta
            de Instagram para empezar a recibir mensajes.
          </p>
        </div>
      )}

      {ORDEN.map((canal) => {
        const delCanal = conexiones.filter((c) => c.channel === canal)
        const meta = CANALES[canal]
        const Icono = meta.icono

        return (
          <section key={canal} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Icono className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">{meta.titulo}</h3>
                <span className="text-xs text-muted-foreground">
                  {delCanal.length === 0
                    ? 'sin conectar'
                    : `${delCanal.length} ${meta.comoSeLlama}${delCanal.length === 1 ? '' : 's'}`}
                </span>
              </div>
              {puedeEditar && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onIr?.(meta.seccion)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Nueva conexión
                </Button>
              )}
            </div>

            {delCanal.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
                Ninguna {meta.comoSeLlama} de {meta.titulo} conectada todavía.
              </p>
            ) : (
              <div className="space-y-2">
                {delCanal.map((c) => (
                  <TarjetaDeConexion
                    key={c.id}
                    conexion={c}
                    colas={colas}
                    puedeEditar={puedeEditar}
                    abierta={abierta === c.id}
                    onAbrir={() => setAbierta(abierta === c.id ? null : c.id)}
                    onGuardado={cargar}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function TarjetaDeConexion({
  conexion,
  colas,
  puedeEditar,
  abierta,
  onAbrir,
  onGuardado,
}: {
  conexion: Conexion
  colas: { id: string; name: string }[]
  puedeEditar: boolean
  abierta: boolean
  onAbrir: () => void
  onGuardado: () => void
}) {
  const [nombre, setNombre] = useState(conexion.name ?? '')
  const [prompt, setPrompt] = useState(conexion.system_prompt ?? '')
  const [agente, setAgente] = useState(conexion.ai_enabled)
  const [cola, setCola] = useState(conexion.cola_id ?? '')
  const [guardando, setGuardando] = useState(false)

  // Si la lista se recarga por fuera —otra pestaña, otro cambio— el
  // formulario se pone al día. Sin esto quedaría mostrando lo que había
  // cuando se montó y guardaría datos viejos encima de los nuevos.
  useEffect(() => {
    setNombre(conexion.name ?? '')
    setPrompt(conexion.system_prompt ?? '')
    setAgente(conexion.ai_enabled)
    setCola(conexion.cola_id ?? '')
  }, [conexion])

  const conectada = conexion.status === 'connected'
  const cambió =
    nombre !== (conexion.name ?? '') ||
    prompt !== (conexion.system_prompt ?? '') ||
    agente !== conexion.ai_enabled ||
    cola !== (conexion.cola_id ?? '')

  async function guardar() {
    if (!nombre.trim()) {
      toast.error('Ponele un nombre para poder distinguirla.')
      return
    }
    setGuardando(true)
    try {
      const r = await fetch('/api/conexiones', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: conexion.id,
          name: nombre.trim(),
          system_prompt: prompt,
          ai_enabled: agente,
          cola_id: cola || null,
        }),
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error ?? 'No se pudo guardar')
      toast.success('Cambios guardados.')
      onGuardado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={onAbrir}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        {conectada ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {conexion.name ?? 'Sin nombre'}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {conexion.external_id}
            {conexion.conversaciones > 0 &&
              ` · ${conexion.conversaciones} conversación${conexion.conversaciones === 1 ? '' : 'es'}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {conexion.system_prompt && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              prompt propio
            </span>
          )}
          <span
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
              conexion.ai_enabled
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground',
            )}
          >
            <Bot className="h-3 w-3" />
            {conexion.ai_enabled ? 'agente activo' : 'agente apagado'}
          </span>
        </div>
      </button>

      {conexion.last_error && (
        <p className="border-t border-border px-4 py-2 text-xs text-red-400">
          {conexion.last_error}
        </p>
      )}

      {abierta && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor={`nombre-${conexion.id}`}>Nombre</Label>
            <Input
              id={`nombre-${conexion.id}`}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={!puedeEditar}
              placeholder="Ventas Bogotá"
            />
            <p className="text-xs text-muted-foreground">
              Solo se ve acá y en los flujos. Poné algo que te diga de una cuál
              es: «Ventas», «Soporte», «Línea vieja».
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 px-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                El agente de IA responde en esta conexión
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Apagado, los mensajes que lleguen acá esperan a un asesor. Los
                flujos y las automatizaciones siguen corriendo igual: esto solo
                decide si el agente contesta.
              </p>
            </div>
            <Switch
              checked={agente}
              onCheckedChange={setAgente}
              disabled={!puedeEditar}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`prompt-${conexion.id}`}>
              Instrucciones del agente para esta conexión
            </Label>
            <Textarea
              id={`prompt-${conexion.id}`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={!puedeEditar}
              rows={6}
              placeholder="Sos el asesor comercial de ARK-IA. Atendés a quien escribe por la línea de ventas…"
            />
            <p className="text-xs text-muted-foreground">
              {prompt.trim()
                ? 'El agente responde con estas instrucciones en esta conexión, y con las de la cuenta en las demás.'
                : 'Vacío: el agente usa las instrucciones generales de la cuenta (Agentes IA). Escribí acá solo si esta conexión tiene que responder distinto.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`cola-${conexion.id}`}>
              <Inbox className="mr-1 inline h-3.5 w-3.5" />
              Cola por omisión
            </Label>
            <select
              id={`cola-${conexion.id}`}
              value={cola}
              onChange={(e) => setCola(e.target.value)}
              disabled={!puedeEditar}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm disabled:opacity-50"
            >
              <option value="">Sin cola — quedan sin asignar</option>
              {colas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              A dónde entran las conversaciones nuevas de esta conexión cuando
              ningún flujo dice otra cosa. Un flujo que entregue a otra cola
              manda sobre esto.
            </p>
          </div>

          {puedeEditar && (
            <div className="flex justify-end">
              <Button onClick={guardar} disabled={!cambió || guardando} size="sm">
                {guardando ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                )}
                Guardar
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
