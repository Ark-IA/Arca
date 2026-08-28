'use client';

/**
 * Empresas: leer, crear, editar y borrar.
 *
 * Habla con Supabase directamente, como el resto de los módulos del CRM
 * (etiquetas, campos personalizados, plantillas). No hace falta una ruta de
 * API intermedia: las políticas RLS de la migración 047 ya deciden quién ve y
 * quién escribe, y una ruta que solo reenvía la consulta sería una segunda
 * copia de esas reglas esperando a desincronizarse de la primera.
 */

import { useCallback, useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { Company } from '@/types';

/** Lo que se puede escribir. El resto lo pone la base. */
export type BorradorEmpresa = Partial<
  Pick<
    Company,
    | 'name'
    | 'domain'
    | 'phone'
    | 'address'
    | 'city'
    | 'country'
    | 'industry'
    | 'employees'
    | 'annual_revenue'
    | 'linkedin_url'
    | 'notes'
    | 'is_ideal_customer'
  >
>;

export interface UseCompanies {
  empresas: Company[];
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
  crear: (datos: BorradorEmpresa) => Promise<Company | null>;
  actualizar: (id: string, datos: BorradorEmpresa) => Promise<boolean>;
  borrar: (id: string) => Promise<boolean>;
}

/** Traduce los errores de Postgres a algo que se le pueda mostrar a alguien. */
function explicar(mensaje: string, codigo?: string): string {
  // 23505 = índice único. El único que hay sobre companies es el del dominio.
  if (codigo === '23505') {
    return 'Ya existe una empresa con ese dominio en tu cuenta.';
  }
  if (codigo === '23514') {
    return 'Algún dato no es válido: revisa el nombre, los empleados y la facturación.';
  }
  if (codigo === '42501') {
    return 'No tienes permiso para hacer eso.';
  }
  return mensaje;
}

export function useCompanies(): UseCompanies {
  const { accountId, user } = useAuth();
  const [empresas, setEmpresas] = useState<Company[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!accountId) return;
    setCargando(true);
    setError(null);
    const supabase = createClient();

    // Se pide el conteo de contactos junto con la empresa. Sin esto la lista
    // haría una consulta por fila para mostrar "3 contactos", que con
    // doscientas empresas son doscientas consultas.
    const { data, error: err } = await supabase
      .from('companies')
      .select('*, contacts(count)')
      .eq('account_id', accountId)
      .order('name', { ascending: true });

    if (err) {
      setError(explicar(err.message, err.code));
      setCargando(false);
      return;
    }

    type FilaConConteo = Company & { contacts?: { count: number }[] };
    setEmpresas(
      ((data ?? []) as FilaConConteo[]).map((fila) => ({
        ...fila,
        contact_count: fila.contacts?.[0]?.count ?? 0,
      })),
    );
    setCargando(false);
  }, [accountId]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const crear = useCallback(
    async (datos: BorradorEmpresa): Promise<Company | null> => {
      if (!accountId || !user) return null;
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from('companies')
        .insert({ ...limpiar(datos), account_id: accountId, user_id: user.id })
        .select('*')
        .single();

      if (err) {
        setError(explicar(err.message, err.code));
        return null;
      }
      const nueva = { ...(data as Company), contact_count: 0 };
      // Se inserta en su sitio alfabético en vez de recargar toda la lista:
      // la empresa nueva aparece donde el usuario va a buscarla.
      setEmpresas((prev) =>
        [...prev, nueva].sort((a, b) => a.name.localeCompare(b.name)),
      );
      return nueva;
    },
    [accountId, user],
  );

  const actualizar = useCallback(
    async (id: string, datos: BorradorEmpresa): Promise<boolean> => {
      const supabase = createClient();
      const { error: err } = await supabase
        .from('companies')
        .update(limpiar(datos))
        .eq('id', id);

      if (err) {
        setError(explicar(err.message, err.code));
        return false;
      }
      setEmpresas((prev) =>
        prev
          .map((e) => (e.id === id ? { ...e, ...datos } : e))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      return true;
    },
    [],
  );

  const borrar = useCallback(async (id: string): Promise<boolean> => {
    const supabase = createClient();
    const { error: err } = await supabase.from('companies').delete().eq('id', id);
    if (err) {
      setError(explicar(err.message, err.code));
      return false;
    }
    setEmpresas((prev) => prev.filter((e) => e.id !== id));
    return true;
  }, []);

  return { empresas, cargando, error, recargar, crear, actualizar, borrar };
}

/**
 * Convierte los campos vacíos en `null`.
 *
 * Un `<input>` vacío entrega `''`, no `undefined`. Guardado tal cual, el
 * índice único del dominio trataría cada cadena vacía como un valor real y la
 * segunda empresa sin dominio chocaría con la primera. Los números vacíos
 * darían `NaN`, que Postgres rechaza.
 */
function limpiar(datos: BorradorEmpresa): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(datos)) {
    if (typeof valor === 'string') {
      const t = valor.trim();
      salida[clave] = t === '' ? null : t;
    } else if (typeof valor === 'number') {
      salida[clave] = Number.isFinite(valor) ? valor : null;
    } else {
      salida[clave] = valor ?? null;
    }
  }
  return salida;
}
