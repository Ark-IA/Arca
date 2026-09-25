/**
 * Qué se exporta de cada pantalla. Corre en el navegador con la sesión de
 * quien exporta, así que RLS decide qué filas salen: un asesor exporta lo
 * que puede ver, no toda la cuenta.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { aCsv, fechaCsv, traerTodo } from './csv';

export interface Exportado {
  csv: string;
  filas: number;
  recortado: boolean;
}

const ESTADO_NEGOCIO: Record<string, string> = {
  open: 'Abierto',
  won: 'Ganado',
  lost: 'Perdido',
};
const ESTADO_TAREA: Record<string, string> = {
  todo: 'Pendiente',
  in_progress: 'En curso',
  done: 'Hecha',
  canceled: 'Cancelada',
};
const PRIORIDAD: Record<string, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
};

function error(msg: string): never {
  throw new Error(msg);
}

// ------------------------------------------------------------------
// Negocios de un pipeline (o de todos)
// ------------------------------------------------------------------

interface FilaNegocio {
  id: string;
  title: string;
  value: number | null;
  currency: string | null;
  status: string | null;
  expected_close_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  pipeline: { name: string } | null;
  stage: { name: string; position: number } | null;
  contact: {
    name: string | null;
    phone: string | null;
    email: string | null;
    company: string | null;
  } | null;
  assignee: { full_name: string | null } | null;
}

export async function exportarNegocios(
  db: SupabaseClient,
  accountId: string,
  pipelineId?: string
): Promise<Exportado> {
  const {
    filas,
    error: e,
    recortado,
  } = await traerTodo<FilaNegocio>((desde, hasta) => {
    let q = db
      .from('deals')
      .select(
        'id, title, value, currency, status, expected_close_date, notes, created_at, updated_at, ' +
          'pipeline:pipelines(name), stage:pipeline_stages(name, position), ' +
          'contact:contacts(name, phone, email, company), ' +
          'assignee:profiles!deals_assigned_to_fkey(full_name)'
      )
      .eq('account_id', accountId);
    if (pipelineId) q = q.eq('pipeline_id', pipelineId);
    return q
      .order('created_at', { ascending: true })
      .order('id')
      .range(desde, hasta) as unknown as PromiseLike<{
      data: FilaNegocio[] | null;
      error: import('@supabase/supabase-js').PostgrestError | null;
    }>;
  });
  if (e) error(e);

  const csv = aCsv(
    [
      'Negocio',
      'Pipeline',
      'Etapa',
      'Estado',
      'Valor',
      'Moneda',
      'Contacto',
      'Teléfono',
      'Correo',
      'Empresa',
      'Asesor',
      'Cierre esperado',
      'Creado',
      'Actualizado',
      'Notas',
    ],
    filas.map((d) => [
      d.title,
      d.pipeline?.name,
      d.stage?.name,
      ESTADO_NEGOCIO[d.status ?? ''] ?? d.status,
      d.value ?? 0,
      d.currency,
      d.contact?.name,
      d.contact?.phone,
      d.contact?.email,
      d.contact?.company,
      d.assignee?.full_name,
      d.expected_close_date,
      fechaCsv(d.created_at),
      fechaCsv(d.updated_at),
      d.notes,
    ])
  );
  return { csv, filas: filas.length, recortado };
}

// ------------------------------------------------------------------
// Contactos, con etiquetas y campos personalizados
// ------------------------------------------------------------------

interface FilaContacto {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  job_title: string | null;
  created_at: string;
  company_ref: { name: string } | null;
  contact_tags: { tags: { name: string } | null }[] | null;
  contact_custom_values:
    { custom_field_id: string; value: string | null }[] | null;
}

export async function exportarContactos(
  db: SupabaseClient,
  accountId: string
): Promise<Exportado> {
  // Los campos personalizados de contacto son los que no pertenecen a un
  // objeto (`object_id` nulo, desde la migración 077).
  const { data: campos, error: ec } = await db
    .from('custom_fields')
    .select('id, field_name, label')
    .eq('account_id', accountId)
    .is('object_id', null)
    .order('position', { ascending: true });
  if (ec) error(ec.message);
  const listaCampos = (campos ?? []) as {
    id: string;
    field_name: string;
    label: string | null;
  }[];

  const {
    filas,
    error: e,
    recortado,
  } = await traerTodo<FilaContacto>(
    (desde, hasta) =>
      db
        .from('contacts')
        .select(
          'id, name, phone, email, company, job_title, created_at, ' +
            'company_ref:companies(name), contact_tags(tags(name)), ' +
            'contact_custom_values(custom_field_id, value)'
        )
        .eq('account_id', accountId)
        .order('created_at', { ascending: true })
        .order('id')
        .range(desde, hasta) as unknown as PromiseLike<{
        data: FilaContacto[] | null;
        error: import('@supabase/supabase-js').PostgrestError | null;
      }>
  );
  if (e) error(e);

  const csv = aCsv(
    [
      'Nombre',
      'Teléfono',
      'Correo',
      'Empresa',
      'Cargo',
      'Etiquetas',
      'Creado',
      ...listaCampos.map((c) => c.label || c.field_name),
    ],
    filas.map((c) => {
      const valores = new Map(
        (c.contact_custom_values ?? []).map((v) => [v.custom_field_id, v.value])
      );
      return [
        c.name,
        c.phone,
        c.email,
        c.company_ref?.name ?? c.company,
        c.job_title,
        (c.contact_tags ?? [])
          .map((t) => t.tags?.name)
          .filter(Boolean)
          .join(', '),
        fechaCsv(c.created_at),
        ...listaCampos.map((f) => valores.get(f.id) ?? ''),
      ];
    })
  );
  return { csv, filas: filas.length, recortado };
}

// ------------------------------------------------------------------
// Empresas
// ------------------------------------------------------------------

interface FilaEmpresa {
  id: string;
  name: string;
  domain: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  industry: string | null;
  employees: number | null;
  annual_revenue: number | null;
  linkedin_url: string | null;
  is_ideal_customer: boolean;
  created_at: string;
}

export async function exportarEmpresas(
  db: SupabaseClient,
  accountId: string
): Promise<Exportado> {
  const {
    filas,
    error: e,
    recortado,
  } = await traerTodo<FilaEmpresa>(
    (desde, hasta) =>
      db
        .from('companies')
        .select(
          'id, name, domain, phone, address, city, country, industry, employees, annual_revenue, linkedin_url, is_ideal_customer, created_at'
        )
        .eq('account_id', accountId)
        .order('created_at', { ascending: true })
        .order('id')
        .range(desde, hasta) as unknown as PromiseLike<{
        data: FilaEmpresa[] | null;
        error: import('@supabase/supabase-js').PostgrestError | null;
      }>
  );
  if (e) error(e);

  const csv = aCsv(
    [
      'Empresa',
      'Dominio',
      'Teléfono',
      'Dirección',
      'Ciudad',
      'País',
      'Sector',
      'Empleados',
      'Ingresos anuales',
      'LinkedIn',
      'Cliente ideal',
      'Creada',
    ],
    filas.map((c) => [
      c.name,
      c.domain,
      c.phone,
      c.address,
      c.city,
      c.country,
      c.industry,
      c.employees,
      c.annual_revenue,
      c.linkedin_url,
      c.is_ideal_customer ? 'Sí' : 'No',
      fechaCsv(c.created_at),
    ])
  );
  return { csv, filas: filas.length, recortado };
}

// ------------------------------------------------------------------
// Tareas
// ------------------------------------------------------------------

interface FilaTarea {
  id: string;
  title: string;
  body: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  completed_at: string | null;
  assignee_id: string | null;
  created_at: string;
}

export async function exportarTareas(
  db: SupabaseClient,
  accountId: string
): Promise<Exportado> {
  const [{ filas, error: e, recortado }, { data: perfiles }] =
    await Promise.all([
      traerTodo<FilaTarea>(
        (desde, hasta) =>
          db
            .from('tasks')
            .select(
              'id, title, body, status, priority, due_at, completed_at, assignee_id, created_at'
            )
            .eq('account_id', accountId)
            .order('created_at', { ascending: true })
            .order('id')
            .range(desde, hasta) as unknown as PromiseLike<{
            data: FilaTarea[] | null;
            error: import('@supabase/supabase-js').PostgrestError | null;
          }>
      ),
      db
        .from('profiles')
        .select('user_id, full_name')
        .eq('account_id', accountId),
    ]);
  if (e) error(e);
  const nombre = new Map(
    ((perfiles ?? []) as { user_id: string; full_name: string | null }[]).map(
      (p) => [p.user_id, p.full_name]
    )
  );

  const csv = aCsv(
    [
      'Tarea',
      'Estado',
      'Prioridad',
      'Responsable',
      'Vence',
      'Completada',
      'Creada',
      'Detalle',
    ],
    filas.map((t) => [
      t.title,
      ESTADO_TAREA[t.status] ?? t.status,
      PRIORIDAD[t.priority] ?? t.priority,
      t.assignee_id ? (nombre.get(t.assignee_id) ?? '') : '',
      fechaCsv(t.due_at),
      fechaCsv(t.completed_at),
      fechaCsv(t.created_at),
      t.body,
    ])
  );
  return { csv, filas: filas.length, recortado };
}
