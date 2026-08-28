'use client';

/**
 * Lista de bloqueo.
 *
 * A quién no se le escribe nunca. El filtro de verdad NO está acá: está en
 * `src/lib/whatsapp/bloqueo.ts`, en el camino del envío, porque esta pantalla
 * se puede esquivar (la API pública, una automatización, un flujo) y el envío
 * no.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, ShieldBan, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { canSendMessages, canEditSettings } from '@/lib/auth/roles';
import { SettingsPanelHead } from './settings-panel-head';
import type { BlocklistEntry, TipoBloqueo } from '@/types';

const ETIQUETA: Record<TipoBloqueo, string> = {
  phone: 'Teléfono',
  whatsapp_user: 'Usuario de WhatsApp',
  email: 'Correo',
  domain: 'Dominio',
};

const EJEMPLO: Record<TipoBloqueo, string> = {
  phone: '+573001234567',
  whatsapp_user: 'CO.4509733672618188',
  email: 'alguien@ejemplo.com',
  domain: 'ejemplo.com',
};

/**
 * Normaliza antes de guardar.
 *
 * El filtro del envío compara valores; si acá entra " +57 300 123 4567 " y el
 * mensaje sale a "+573001234567", no coinciden y el bloqueo no sirve de nada.
 */
function normalizar(kind: TipoBloqueo, valor: string): string {
  const v = valor.trim();
  if (kind === 'phone') return v.replace(/[^\d+]/g, '');
  if (kind === 'email' || kind === 'domain') return v.toLowerCase();
  return v;
}

export function ListaDeBloqueo() {
  const { accountId, user, accountRole } = useAuth();
  const puedeAgregar = accountRole ? canSendMessages(accountRole) : false;
  const puedeQuitar = accountRole ? canEditSettings(accountRole) : false;

  const [filas, setFilas] = useState<BlocklistEntry[]>([]);
  const [cargando, setCargando] = useState(true);
  const [kind, setKind] = useState<TipoBloqueo>('phone');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!accountId) return;
    setCargando(true);
    const { data, error } = await createClient()
      .from('blocklist')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('No se pudo cargar la lista.');
      setCargando(false);
      return;
    }
    setFilas((data ?? []) as BlocklistEntry[]);
    setCargando(false);
  }, [accountId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const agregar = async () => {
    const v = normalizar(kind, valor);
    if (v === '' || !accountId || !user) return;
    setGuardando(true);
    const { error } = await createClient().from('blocklist').insert({
      account_id: accountId,
      user_id: user.id,
      kind,
      value: v,
      reason: motivo.trim() || null,
    });
    setGuardando(false);

    if (error) {
      // 23505 es el índice único: ya estaba bloqueado. No es un error que
      // haya que investigar, es el resultado deseado.
      toast[error.code === '23505' ? 'info' : 'error'](
        error.code === '23505' ? 'Ya estaba en la lista.' : 'No se pudo agregar.',
      );
      return;
    }
    setValor('');
    setMotivo('');
    await cargar();
    toast.success('Agregado a la lista de bloqueo.');
  };

  const quitar = async (fila: BlocklistEntry) => {
    const { error } = await createClient().from('blocklist').delete().eq('id', fila.id);
    if (error) {
      toast.error('No se pudo quitar.');
      return;
    }
    setFilas((p) => p.filter((f) => f.id !== fila.id));
    toast.success('Quitado de la lista.');
  };

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        title="Lista de bloqueo"
        description="Quien esté aquí no recibe mensajes: ni respuestas de la bandeja, ni masivos, ni automatizaciones. El bloqueo se aplica en el envío, así que no hay forma de esquivarlo."
      />

      {puedeAgregar && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-[170px_1fr]">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={kind} onValueChange={(v) => v && setKind(v as TipoBloqueo)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{ETIQUETA[kind]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ETIQUETA) as TipoBloqueo[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {ETIQUETA[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bl-valor">Valor</Label>
                <Input
                  id="bl-valor"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void agregar();
                  }}
                  placeholder={EJEMPLO[kind]}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bl-motivo">
                Motivo <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="bl-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Pidió no recibir más mensajes"
              />
              <p className="text-xs text-muted-foreground">
                Conviene anotarlo: ante un reclamo hay que poder decir por qué y
                desde cuándo.
              </p>
            </div>

            <Button onClick={agregar} disabled={guardando || valor.trim() === ''}>
              {guardando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Bloquear
            </Button>
          </CardContent>
        </Card>
      )}

      {cargando ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : filas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ShieldBan className="size-7 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">La lista está vacía</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Cuando alguien pida no recibir más mensajes, agregalo aquí y el CRM
              deja de escribirle por todos los canales.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {filas.map((f) => (
                <li key={f.id} className="group flex items-center gap-3 px-4 py-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-red-400">
                    <ShieldBan className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm text-foreground">{f.value}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {ETIQUETA[f.kind]}
                      {f.reason ? ` · ${f.reason}` : ''}
                      {' · '}
                      {new Date(f.created_at).toLocaleDateString('es', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  {puedeQuitar && (
                    <button
                      type="button"
                      onClick={() => void quitar(f)}
                      aria-label={`Quitar ${f.value} de la lista`}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
