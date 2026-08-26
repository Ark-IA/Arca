'use client';

/**
 * Adjuntos de un registro.
 *
 * El archivo se sube al almacenamiento de Supabase y en la base queda su
 * dirección, no el binario: guardarlo en Postgres haría que cada copia de
 * seguridad pesara lo que pesan todos los archivos juntos.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Download,
  FileText,
  Image as IconoImagen,
  Loader2,
  Paperclip,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { uploadAccountMedia } from '@/lib/storage/upload-media';
import { COLUMNA_POR_TIPO } from '@/lib/registros/vinculos';
import type { Attachment, TipoDeRegistro } from '@/types';

const CUBETA = 'record-attachments';

/** 25 MB. Por encima, el navegador se queda sin memoria al leer el archivo. */
const MAXIMO_BYTES = 25 * 1024 * 1024;

function tamano(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function PanelAdjuntos({
  tipo,
  registroId,
  puedeEditar,
}: {
  tipo: TipoDeRegistro;
  registroId: string;
  puedeEditar: boolean;
}) {
  const { accountId, user } = useAuth();
  const [archivos, setArchivos] = useState<Attachment[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    if (!accountId) return;
    setCargando(true);
    const { data, error } = await createClient()
      .from('attachments')
      .select('*')
      .eq('account_id', accountId)
      .eq(COLUMNA_POR_TIPO[tipo], registroId)
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('No se pudieron cargar los adjuntos.');
      setCargando(false);
      return;
    }
    setArchivos((data ?? []) as Attachment[]);
    setCargando(false);
  }, [accountId, tipo, registroId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const subir = async (file: File) => {
    if (!accountId || !user) return;
    if (file.size > MAXIMO_BYTES) {
      toast.error(`El archivo pesa ${tamano(file.size)}. El máximo son 25 MB.`);
      return;
    }
    setSubiendo(true);
    try {
      const { publicUrl } = await uploadAccountMedia(CUBETA, file);
      const { error } = await createClient().from('attachments').insert({
        account_id: accountId,
        user_id: user.id,
        name: file.name,
        url: publicUrl,
        mime_type: file.type || null,
        size_bytes: file.size,
        [COLUMNA_POR_TIPO[tipo]]: registroId,
      });
      if (error) throw new Error(error.message);
      await cargar();
      toast.success('Archivo adjuntado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo subir el archivo.');
    } finally {
      setSubiendo(false);
      // Se limpia para que subir el MISMO archivo dos veces seguidas vuelva a
      // disparar el evento: si no, el navegador lo considera "sin cambios".
      if (entrada.current) entrada.current.value = '';
    }
  };

  const eliminar = async (a: Attachment) => {
    // Solo se borra la fila; el archivo queda en el almacenamiento. Borrarlo
    // también exigiría reconstruir su ruta desde la URL pública, y una ruta
    // mal deducida borraría el archivo de otro. Un huérfano ocupa espacio;
    // un borrado equivocado pierde datos de alguien.
    const { error } = await createClient().from('attachments').delete().eq('id', a.id);
    if (error) {
      toast.error('No se pudo eliminar.');
      return;
    }
    setArchivos((p) => p.filter((x) => x.id !== a.id));
  };

  return (
    <div className="space-y-3">
      {puedeEditar && (
        <>
          <input
            ref={entrada}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void subir(f);
            }}
          />
          <Button
            variant="outline"
            onClick={() => entrada.current?.click()}
            disabled={subiendo}
            className="w-full border-dashed border-border text-muted-foreground hover:bg-muted"
          >
            {subiendo ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Subiendo…
              </>
            ) : (
              <>
                <Paperclip className="size-4" />
                Adjuntar archivo
              </>
            )}
          </Button>
        </>
      )}

      {cargando ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : archivos.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-8 text-center">
          <Paperclip className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Sin archivos adjuntos.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {archivos.map((a) => {
            const esImagen = a.mime_type?.startsWith('image/');
            return (
              <li
                key={a.id}
                className="group flex items-center gap-3 rounded-lg border border-border bg-card p-2.5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  {esImagen ? (
                    <IconoImagen className="size-4" />
                  ) : (
                    <FileText className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{a.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {tamano(a.size_bytes)}
                    {a.size_bytes != null && ' · '}
                    {new Date(a.created_at).toLocaleDateString('es', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                </div>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`Abrir ${a.name}`}
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Download className="size-3.5" />
                </a>
                {puedeEditar && (
                  <button
                    type="button"
                    onClick={() => void eliminar(a)}
                    aria-label={`Eliminar ${a.name}`}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
