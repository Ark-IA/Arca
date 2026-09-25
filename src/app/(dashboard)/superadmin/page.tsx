'use client';

/**
 * Superadmin: qué módulos tiene activos esta instalación.
 *
 * Solo para ARK-IA (correos de ARCA_SUPERADMINS). La página se puede abrir
 * escribiendo la dirección, pero la API contesta 403 a cualquier otro, así
 * que no hay nada que ver ni que cambiar.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ShieldCheck } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

interface FilaModulo {
  clave: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
  actualizado_en: string | null;
  actualizado_por: string | null;
}

export default function SuperadminPage() {
  const [modulos, setModulos] = useState<FilaModulo[] | null>(null);
  const [prohibido, setProhibido] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch('/api/superadmin/modulos', { cache: 'no-store' });
    if (r.status === 403 || r.status === 401) {
      setProhibido(true);
      return;
    }
    if (!r.ok) {
      toast.error('No se pudieron cargar los módulos.');
      return;
    }
    const d = (await r.json()) as { modulos: FilaModulo[] };
    setModulos(d.modulos);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cambiar = async (fila: FilaModulo, activo: boolean) => {
    setGuardando(fila.clave);
    const r = await fetch('/api/superadmin/modulos', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clave: fila.clave, activo }),
    });
    setGuardando(null);
    if (!r.ok) {
      toast.error('No se pudo guardar.');
      return;
    }
    setModulos(
      (prev) =>
        prev?.map((m) => (m.clave === fila.clave ? { ...m, activo } : m)) ??
        prev
    );
    toast.success(
      activo
        ? `${fila.nombre} activado.`
        : `${fila.nombre} desactivado. Deja de funcionar en menos de un minuto.`
    );
  };

  if (prohibido) {
    return (
      <div className="text-muted-foreground py-20 text-center text-sm">
        Esta sección no está disponible.
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-primary size-6" />
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          Superadmin
        </h1>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        Módulos de esta instalación. Un módulo apagado desaparece del menú, su
        API responde que no está disponible y lo que corre solo
        (automatizaciones, flujos, agente de IA) deja de ejecutarse. Los datos
        no se borran: al volver a activarlo todo está donde estaba.
      </p>

      {!modulos ? (
        <div className="flex justify-center py-10">
          <Loader2 className="text-primary size-5 animate-spin" />
        </div>
      ) : (
        <Card className="mt-6">
          <CardContent className="divide-border divide-y p-0">
            {modulos.map((m) => (
              <div
                key={m.clave}
                className="flex items-start justify-between gap-4 p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{m.nombre}</p>
                  <p className="text-muted-foreground text-xs">
                    {m.descripcion}
                  </p>
                  {m.actualizado_por && (
                    <p className="text-muted-foreground mt-1 text-[11px]">
                      Cambiado por {m.actualizado_por}
                      {m.actualizado_en &&
                        ` el ${new Date(m.actualizado_en).toLocaleString('es')}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {guardando === m.clave && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  <Switch
                    checked={m.activo}
                    disabled={guardando !== null}
                    onCheckedChange={(v) => void cambiar(m, v)}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
