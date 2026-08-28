'use client';

/**
 * Notas de un registro.
 *
 * Sirve igual para un contacto, una empresa o un negocio: el destino llega por
 * propiedades. Reemplaza a las notas viejas de `contact_notes`, que solo
 * podían colgarse de un contacto y no tenían título.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, NotebookPen, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { COLUMNA_POR_TIPO } from '@/lib/registros/vinculos';
import type { Note, TipoDeRegistro } from '@/types';

function cuando(iso: string): string {
  return new Date(iso).toLocaleString('es', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PanelNotas({
  tipo,
  registroId,
  puedeEditar,
}: {
  tipo: TipoDeRegistro;
  registroId: string;
  puedeEditar: boolean;
}) {
  const { accountId, user } = useAuth();
  const [notas, setNotas] = useState<Note[]>([]);
  const [cargando, setCargando] = useState(true);
  const [titulo, setTitulo] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!accountId) return;
    setCargando(true);
    // `!inner` es obligatorio para que el filtro sobre la tabla embebida
    // recorte las notas y no solo los vínculos: sin él vendrían todas las de
    // la cuenta con la lista de vínculos vacía.
    const { data, error } = await createClient()
      .from('notes')
      .select('*, note_targets!inner(id)')
      .eq('account_id', accountId)
      .eq(`note_targets.${COLUMNA_POR_TIPO[tipo]}`, registroId)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('No se pudieron cargar las notas.');
      setCargando(false);
      return;
    }
    setNotas((data ?? []) as Note[]);
    setCargando(false);
  }, [accountId, tipo, registroId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const agregar = async () => {
    const c = cuerpo.trim();
    if (c === '' || !accountId || !user) return;
    setGuardando(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('notes')
      .insert({
        account_id: accountId,
        user_id: user.id,
        title: titulo.trim() || null,
        body: c,
      })
      .select('*')
      .single();

    if (error || !data) {
      setGuardando(false);
      toast.error('No se pudo guardar la nota.');
      return;
    }

    const { error: errVinculo } = await supabase.from('note_targets').insert({
      note_id: (data as Note).id,
      [COLUMNA_POR_TIPO[tipo]]: registroId,
    });

    setGuardando(false);

    if (errVinculo) {
      // La nota existe pero no está colgada de nada. Se borra en vez de
      // dejarla suelta: una nota que nadie va a encontrar nunca es peor que
      // no haberla guardado, porque quien la escribió cree que está.
      await supabase.from('notes').delete().eq('id', (data as Note).id);
      toast.error('No se pudo vincular la nota. Vuelve a intentarlo.');
      return;
    }

    setTitulo('');
    setCuerpo('');
    await cargar();
  };

  const eliminar = async (id: string) => {
    // Los vínculos se van solos por la cascada de la clave foránea.
    const { error } = await createClient().from('notes').delete().eq('id', id);
    if (error) {
      toast.error('No se pudo eliminar.');
      return;
    }
    setNotas((p) => p.filter((n) => n.id !== id));
  };

  return (
    <div className="space-y-3">
      {puedeEditar && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título (opcional)"
            className="h-8 text-sm"
          />
          <Textarea
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            placeholder="Escribe una nota…"
            rows={3}
            className="text-sm"
          />
          <Button
            size="sm"
            onClick={agregar}
            disabled={guardando || cuerpo.trim() === ''}
            className="w-full"
          >
            {guardando ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            Agregar nota
          </Button>
        </div>
      )}

      {cargando ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : notas.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-8 text-center">
          <NotebookPen className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Todavía no hay notas.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notas.map((n) => (
            <li
              key={n.id}
              className="group rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {n.title && (
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                  )}
                  <p className="whitespace-pre-wrap text-sm text-foreground">{n.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {cuando(n.created_at)}
                  </p>
                </div>
                {puedeEditar && (
                  <button
                    type="button"
                    onClick={() => void eliminar(n.id)}
                    aria-label="Eliminar nota"
                    className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
