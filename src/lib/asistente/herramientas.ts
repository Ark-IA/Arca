/**
 * Herramientas del CRM para agentes de IA: las usan el asistente de voz de
 * ARCA (/api/asistente) y el servidor MCP por HTTP (/api/mcp). Un solo
 * catálogo para que lo que se puede pedir por voz y lo que puede hacer
 * Claude o ChatGPT conectados por MCP sea exactamente lo mismo.
 *
 * Seguridad, en este orden:
 * 1. TODA consulta filtra por `ctx.accountId`. Por MCP el cliente es de
 *    servicio (sin RLS): el filtro explícito es la única barrera entre
 *    cuentas. Por el asistente el cliente es el de la sesión, así que RLS
 *    agrega "cada asesor ve lo suyo" encima.
 * 2. Por MCP cada herramienta exige el permiso (`alcance`) de la clave.
 * 3. Las que cambian algo que no se deshace fácil (`confirmar`) el asistente
 *    no las ejecuta: las propone y espera el "sí" de la persona.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { ApiScope } from '@/lib/api-keys/scopes';

export interface ContextoHerramienta {
  db: SupabaseClient;
  accountId: string;
  /** Quién actúa: la persona (asistente) o quien creó la clave (MCP). */
  userId: string;
}

type Esquema = {
  type: 'object';
  properties: Record<
    string,
    { type: string; description: string; enum?: string[] }
  >;
  required?: string[];
};

export interface Herramienta {
  nombre: string;
  descripcion: string;
  parametros: Esquema;
  alcance: ApiScope;
  escribe: boolean;
  /** El asistente la propone y no la ejecuta hasta que la persona confirma. */
  confirmar: boolean;
  /** Cómo contarle a la persona qué se va a hacer, antes de confirmar. */
  describir?: (args: Record<string, unknown>) => string;
  ejecutar: (
    ctx: ContextoHerramienta,
    args: Record<string, unknown>
  ) => Promise<unknown>;
}

export class ErrorDeHerramienta extends Error {}

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------

function texto(
  args: Record<string, unknown>,
  clave: string,
  obligatorio = false
): string | null {
  const v = args[clave];
  const t =
    typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  if (!t && obligatorio) throw new ErrorDeHerramienta(`Falta "${clave}".`);
  return t || null;
}

function numero(args: Record<string, unknown>, clave: string): number | null {
  const v = args[clave];
  if (v === undefined || v === null || v === '') return null;
  const n =
    typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n))
    throw new ErrorDeHerramienta(`"${clave}" no es un número.`);
  return n;
}

/** Quita caracteres que rompen la sintaxis de filtros de PostgREST. */
function busqueda(q: string): string {
  return q
    .replace(/[^\p{L}\p{N} +@.\-_]/gu, '')
    .trim()
    .slice(0, 80);
}

function fecha(args: Record<string, unknown>, clave: string): string | null {
  const t = texto(args, clave);
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime()))
    throw new ErrorDeHerramienta(
      `"${clave}" no es una fecha válida (usa ISO 8601).`
    );
  return d.toISOString();
}

async function contactoDeLaCuenta(ctx: ContextoHerramienta, id: string) {
  const { data } = await ctx.db
    .from('contacts')
    .select('id, name, phone, email')
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .maybeSingle();
  if (!data) throw new ErrorDeHerramienta('No encontré ese contacto.');
  return data as {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
  };
}

async function negocioDeLaCuenta(ctx: ContextoHerramienta, id: string) {
  const { data } = await ctx.db
    .from('deals')
    .select('id, title, pipeline_id, stage_id, status, value, contact_id')
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .maybeSingle();
  if (!data) throw new ErrorDeHerramienta('No encontré ese negocio.');
  return data as {
    id: string;
    title: string;
    pipeline_id: string;
    stage_id: string;
    status: string;
    value: number;
    contact_id: string | null;
  };
}

async function miembroPorNombre(
  ctx: ContextoHerramienta,
  nombre: string
): Promise<string> {
  const { data } = await ctx.db
    .from('profiles')
    .select('user_id, full_name')
    .eq('account_id', ctx.accountId)
    .ilike('full_name', `%${busqueda(nombre)}%`)
    .limit(2);
  const filas = (data ?? []) as { user_id: string; full_name: string }[];
  if (filas.length === 0)
    throw new ErrorDeHerramienta(
      `No hay nadie del equipo que se llame "${nombre}".`
    );
  if (filas.length > 1)
    throw new ErrorDeHerramienta(
      `Hay varias personas que coinciden con "${nombre}": ${filas.map((f) => f.full_name).join(', ')}.`
    );
  return filas[0].user_id;
}

// ------------------------------------------------------------------
// Catálogo
// ------------------------------------------------------------------

export const HERRAMIENTAS: Herramienta[] = [
  {
    nombre: 'buscar_contactos',
    descripcion:
      'Busca contactos por nombre, teléfono o correo. Devuelve hasta 10.',
    parametros: {
      type: 'object',
      properties: {
        consulta: {
          type: 'string',
          description: 'Nombre, teléfono o correo (o parte).',
        },
      },
      required: ['consulta'],
    },
    alcance: 'contacts:read',
    escribe: false,
    confirmar: false,
    async ejecutar(ctx, args) {
      const q = busqueda(texto(args, 'consulta', true)!);
      const { data, error } = await ctx.db
        .from('contacts')
        .select('id, name, phone, email, company')
        .eq('account_id', ctx.accountId)
        .or(`name.ilike.*${q}*,phone.ilike.*${q}*,email.ilike.*${q}*`)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw new ErrorDeHerramienta('No se pudo buscar.');
      return { contactos: data ?? [] };
    },
  },
  {
    nombre: 'ver_contacto',
    descripcion:
      'Ficha de un contacto: datos, etiquetas, negocios abiertos, tareas pendientes y últimos mensajes.',
    parametros: {
      type: 'object',
      properties: {
        contacto_id: {
          type: 'string',
          description: 'Id del contacto (de buscar_contactos).',
        },
      },
      required: ['contacto_id'],
    },
    alcance: 'contacts:read',
    escribe: false,
    confirmar: false,
    async ejecutar(ctx, args) {
      const c = await contactoDeLaCuenta(
        ctx,
        texto(args, 'contacto_id', true)!
      );
      const [etiquetas, negocios, tareas, conv] = await Promise.all([
        ctx.db.from('contact_tags').select('tags(name)').eq('contact_id', c.id),
        ctx.db
          .from('deals')
          .select('id, title, value, status, stage:pipeline_stages(name)')
          .eq('account_id', ctx.accountId)
          .eq('contact_id', c.id)
          .eq('status', 'open'),
        ctx.db
          .from('task_targets')
          .select('tasks(id, title, due_at, status)')
          .eq('contact_id', c.id),
        ctx.db
          .from('conversations')
          .select('id')
          .eq('account_id', ctx.accountId)
          .eq('contact_id', c.id)
          .order('last_message_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      let mensajes: unknown[] = [];
      if (conv.data) {
        const { data } = await ctx.db
          .from('messages')
          .select('sender_type, content_text, created_at')
          .eq('conversation_id', (conv.data as { id: string }).id)
          .order('created_at', { ascending: false })
          .limit(6);
        mensajes = (data ?? []).reverse();
      }
      return {
        contacto: c,
        etiquetas: (
          (etiquetas.data ?? []) as unknown as {
            tags: { name: string } | null;
          }[]
        )
          .map((t) => t.tags?.name)
          .filter(Boolean),
        negocios_abiertos: negocios.data ?? [],
        tareas_pendientes: (
          (tareas.data ?? []) as unknown as {
            tasks: { status: string } | null;
          }[]
        )
          .map((t) => t.tasks)
          .filter((t) => t && t.status !== 'done' && t.status !== 'canceled'),
        ultimos_mensajes: mensajes,
      };
    },
  },
  {
    nombre: 'crear_contacto',
    descripcion:
      'Crea un contacto. Si ya existe uno con ese teléfono, devuelve el existente.',
    parametros: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre completo.' },
        telefono: {
          type: 'string',
          description: 'Teléfono con indicativo, ej. +573001234567.',
        },
        correo: {
          type: 'string',
          description: 'Correo electrónico (opcional).',
        },
        empresa: { type: 'string', description: 'Empresa (opcional).' },
      },
      required: ['nombre', 'telefono'],
    },
    alcance: 'contacts:write',
    escribe: true,
    confirmar: false,
    async ejecutar(ctx, args) {
      const { findOrCreateContact } = await import('@/lib/api/v1/contacts');
      const r = await findOrCreateContact(ctx.db, ctx.accountId, ctx.userId, {
        phone: texto(args, 'telefono', true)!,
        name: texto(args, 'nombre', true),
        email: texto(args, 'correo'),
        company: texto(args, 'empresa'),
      });
      return { contacto_id: r.id, creado: r.created };
    },
  },
  {
    nombre: 'buscar_negocios',
    descripcion:
      'Lista negocios (oportunidades de venta) por texto del título o nombre del contacto, con su etapa y valor.',
    parametros: {
      type: 'object',
      properties: {
        consulta: {
          type: 'string',
          description: 'Texto a buscar en el título (opcional).',
        },
        estado: {
          type: 'string',
          description: 'open, won o lost. Por defecto open.',
          enum: ['open', 'won', 'lost'],
        },
      },
    },
    alcance: 'deals:read',
    escribe: false,
    confirmar: false,
    async ejecutar(ctx, args) {
      let q = ctx.db
        .from('deals')
        .select(
          'id, title, value, currency, status, expected_close_date, stage:pipeline_stages(name), pipeline:pipelines(name), contact:contacts(id, name)'
        )
        .eq('account_id', ctx.accountId)
        .eq('status', texto(args, 'estado') ?? 'open');
      const t = texto(args, 'consulta');
      if (t) q = q.ilike('title', `%${busqueda(t)}%`);
      const { data, error } = await q
        .order('updated_at', { ascending: false })
        .limit(15);
      if (error) throw new ErrorDeHerramienta('No se pudo buscar.');
      return { negocios: data ?? [] };
    },
  },
  {
    nombre: 'crear_negocio',
    descripcion:
      'Crea un negocio en un pipeline. Sin pipeline ni etapa, usa el primero y su primera etapa.',
    parametros: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Nombre del negocio.' },
        valor: {
          type: 'number',
          description: 'Valor en la moneda de la cuenta (opcional).',
        },
        contacto_id: {
          type: 'string',
          description: 'Contacto asociado (opcional).',
        },
        etapa: {
          type: 'string',
          description: 'Nombre de la etapa (opcional).',
        },
      },
      required: ['titulo'],
    },
    alcance: 'deals:write',
    escribe: true,
    confirmar: false,
    async ejecutar(ctx, args) {
      const contactoId = texto(args, 'contacto_id');
      if (contactoId) await contactoDeLaCuenta(ctx, contactoId);
      const { data: pipes } = await ctx.db
        .from('pipelines')
        .select('id, name, pipeline_stages(id, name, position)')
        .eq('account_id', ctx.accountId)
        .order('created_at', { ascending: true })
        .limit(1);
      const pipe = (pipes ?? [])[0] as
        | {
            id: string;
            pipeline_stages: { id: string; name: string; position: number }[];
          }
        | undefined;
      if (!pipe || pipe.pipeline_stages.length === 0)
        throw new ErrorDeHerramienta(
          'La cuenta no tiene pipelines con etapas.'
        );
      const etapas = [...pipe.pipeline_stages].sort(
        (a, b) => a.position - b.position
      );
      const pedida = texto(args, 'etapa');
      const etapa = pedida
        ? etapas.find((e) =>
            e.name.toLowerCase().includes(pedida.toLowerCase())
          )
        : etapas[0];
      if (!etapa)
        throw new ErrorDeHerramienta(
          `No hay una etapa "${pedida}". Hay: ${etapas.map((e) => e.name).join(', ')}.`
        );
      const { data, error } = await ctx.db
        .from('deals')
        .insert({
          account_id: ctx.accountId,
          user_id: ctx.userId,
          pipeline_id: pipe.id,
          stage_id: etapa.id,
          contact_id: contactoId,
          title: texto(args, 'titulo', true),
          value: numero(args, 'valor') ?? 0,
          status: 'open',
        })
        .select('id')
        .single();
      if (error || !data)
        throw new ErrorDeHerramienta('No se pudo crear el negocio.');
      return { negocio_id: data.id, etapa: etapa.name };
    },
  },
  {
    nombre: 'mover_negocio',
    descripcion: 'Cambia la etapa de un negocio dentro de su pipeline.',
    parametros: {
      type: 'object',
      properties: {
        negocio_id: { type: 'string', description: 'Id del negocio.' },
        etapa: {
          type: 'string',
          description: 'Nombre (o parte) de la etapa destino.',
        },
      },
      required: ['negocio_id', 'etapa'],
    },
    alcance: 'deals:write',
    escribe: true,
    confirmar: true,
    describir: (a) => `Mover el negocio a la etapa «${a.etapa}»`,
    async ejecutar(ctx, args) {
      const n = await negocioDeLaCuenta(ctx, texto(args, 'negocio_id', true)!);
      const pedida = texto(args, 'etapa', true)!.toLowerCase();
      const { data: etapas } = await ctx.db
        .from('pipeline_stages')
        .select('id, name')
        .eq('pipeline_id', n.pipeline_id);
      const lista = (etapas ?? []) as { id: string; name: string }[];
      const etapa =
        lista.find((e) => e.name.toLowerCase() === pedida) ??
        lista.find((e) => e.name.toLowerCase().includes(pedida));
      if (!etapa)
        throw new ErrorDeHerramienta(
          `No hay una etapa "${pedida}". Hay: ${lista.map((e) => e.name).join(', ')}.`
        );
      const { error } = await ctx.db
        .from('deals')
        .update({ stage_id: etapa.id, updated_at: new Date().toISOString() })
        .eq('id', n.id)
        .eq('account_id', ctx.accountId);
      if (error) throw new ErrorDeHerramienta('No se pudo mover el negocio.');
      return { negocio: n.title, etapa: etapa.name };
    },
  },
  {
    nombre: 'cerrar_negocio',
    descripcion: 'Marca un negocio como ganado o perdido.',
    parametros: {
      type: 'object',
      properties: {
        negocio_id: { type: 'string', description: 'Id del negocio.' },
        resultado: {
          type: 'string',
          description: 'won (ganado) o lost (perdido).',
          enum: ['won', 'lost'],
        },
      },
      required: ['negocio_id', 'resultado'],
    },
    alcance: 'deals:write',
    escribe: true,
    confirmar: true,
    describir: (a) =>
      `Marcar el negocio como ${a.resultado === 'won' ? 'GANADO' : 'PERDIDO'}`,
    async ejecutar(ctx, args) {
      const n = await negocioDeLaCuenta(ctx, texto(args, 'negocio_id', true)!);
      const r = texto(args, 'resultado', true);
      if (r !== 'won' && r !== 'lost')
        throw new ErrorDeHerramienta('El resultado es won o lost.');
      const { error } = await ctx.db
        .from('deals')
        .update({ status: r, updated_at: new Date().toISOString() })
        .eq('id', n.id)
        .eq('account_id', ctx.accountId);
      if (error) throw new ErrorDeHerramienta('No se pudo cerrar el negocio.');
      return { negocio: n.title, estado: r };
    },
  },
  {
    nombre: 'crear_tarea',
    descripcion:
      'Crea una tarea o recordatorio, opcionalmente asociada a un contacto o negocio y asignada a alguien del equipo.',
    parametros: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Qué hay que hacer.' },
        vence: {
          type: 'string',
          description:
            'Fecha y hora límite en ISO 8601 con zona, ej. 2026-09-25T10:00:00-05:00.',
        },
        contacto_id: {
          type: 'string',
          description: 'Contacto asociado (opcional).',
        },
        negocio_id: {
          type: 'string',
          description: 'Negocio asociado (opcional).',
        },
        asignar_a: {
          type: 'string',
          description:
            'Nombre de la persona del equipo. Sin esto, a quien la pide.',
        },
        prioridad: {
          type: 'string',
          description: 'low, normal o high.',
          enum: ['low', 'normal', 'high'],
        },
      },
      required: ['titulo'],
    },
    alcance: 'tasks:write',
    escribe: true,
    confirmar: false,
    async ejecutar(ctx, args) {
      const contactoId = texto(args, 'contacto_id');
      const negocioId = texto(args, 'negocio_id');
      if (contactoId) await contactoDeLaCuenta(ctx, contactoId);
      if (negocioId) await negocioDeLaCuenta(ctx, negocioId);
      const asignarA = texto(args, 'asignar_a');
      const responsable = asignarA
        ? await miembroPorNombre(ctx, asignarA)
        : ctx.userId;
      const prioridad = texto(args, 'prioridad') ?? 'normal';
      const { data, error } = await ctx.db
        .from('tasks')
        .insert({
          account_id: ctx.accountId,
          user_id: ctx.userId,
          assignee_id: responsable,
          title: texto(args, 'titulo', true),
          due_at: fecha(args, 'vence'),
          priority: ['low', 'normal', 'high'].includes(prioridad)
            ? prioridad
            : 'normal',
          status: 'todo',
        })
        .select('id')
        .single();
      if (error || !data)
        throw new ErrorDeHerramienta('No se pudo crear la tarea.');
      if (contactoId || negocioId) {
        const vinculos = [
          ...(contactoId ? [{ task_id: data.id, contact_id: contactoId }] : []),
          ...(negocioId ? [{ task_id: data.id, deal_id: negocioId }] : []),
        ];
        await ctx.db.from('task_targets').insert(vinculos);
      }
      return { tarea_id: data.id };
    },
  },
  {
    nombre: 'mis_tareas',
    descripcion:
      'Tareas pendientes de quien pregunta: vencidas, de hoy o todas las abiertas.',
    parametros: {
      type: 'object',
      properties: {
        filtro: {
          type: 'string',
          description: 'vencidas, hoy o abiertas.',
          enum: ['vencidas', 'hoy', 'abiertas'],
        },
      },
    },
    alcance: 'tasks:read',
    escribe: false,
    confirmar: false,
    async ejecutar(ctx, args) {
      const filtro = texto(args, 'filtro') ?? 'abiertas';
      let q = ctx.db
        .from('tasks')
        .select('id, title, due_at, priority, status')
        .eq('account_id', ctx.accountId)
        .eq('assignee_id', ctx.userId)
        .in('status', ['todo', 'in_progress']);
      const ahora = new Date();
      if (filtro === 'vencidas') q = q.lt('due_at', ahora.toISOString());
      if (filtro === 'hoy') {
        const fin = new Date(ahora);
        fin.setHours(23, 59, 59, 999);
        q = q.lte('due_at', fin.toISOString());
      }
      const { data, error } = await q
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(20);
      if (error)
        throw new ErrorDeHerramienta('No se pudieron leer las tareas.');
      return { tareas: data ?? [] };
    },
  },
  {
    nombre: 'completar_tarea',
    descripcion: 'Marca una tarea como hecha.',
    parametros: {
      type: 'object',
      properties: {
        tarea_id: { type: 'string', description: 'Id de la tarea.' },
      },
      required: ['tarea_id'],
    },
    alcance: 'tasks:write',
    escribe: true,
    confirmar: false,
    async ejecutar(ctx, args) {
      const { data, error } = await ctx.db
        .from('tasks')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('id', texto(args, 'tarea_id', true)!)
        .eq('account_id', ctx.accountId)
        .select('title');
      if (error || !data?.length)
        throw new ErrorDeHerramienta('No encontré esa tarea.');
      return { tarea: (data[0] as { title: string }).title, estado: 'hecha' };
    },
  },
  {
    nombre: 'crear_nota',
    descripcion: 'Deja una nota en la ficha de un contacto o de un negocio.',
    parametros: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Contenido de la nota.' },
        contacto_id: {
          type: 'string',
          description: 'Contacto (uno de los dos).',
        },
        negocio_id: {
          type: 'string',
          description: 'Negocio (uno de los dos).',
        },
      },
      required: ['texto'],
    },
    alcance: 'notes:write',
    escribe: true,
    confirmar: false,
    async ejecutar(ctx, args) {
      const contactoId = texto(args, 'contacto_id');
      const negocioId = texto(args, 'negocio_id');
      if (!contactoId && !negocioId)
        throw new ErrorDeHerramienta(
          'La nota necesita un contacto o un negocio.'
        );
      if (contactoId) await contactoDeLaCuenta(ctx, contactoId);
      if (negocioId) await negocioDeLaCuenta(ctx, negocioId);
      const { data, error } = await ctx.db
        .from('notes')
        .insert({
          account_id: ctx.accountId,
          user_id: ctx.userId,
          title: '',
          body: texto(args, 'texto', true),
        })
        .select('id')
        .single();
      if (error || !data)
        throw new ErrorDeHerramienta('No se pudo crear la nota.');
      await ctx.db.from('note_targets').insert({
        note_id: data.id,
        ...(contactoId ? { contact_id: contactoId } : { deal_id: negocioId }),
      });
      return { nota_id: data.id };
    },
  },
  {
    nombre: 'resumen',
    descripcion:
      'Resumen de la cuenta en un período: conversaciones nuevas, contactos nuevos, negocios creados y ganados, tareas vencidas.',
    parametros: {
      type: 'object',
      properties: {
        periodo: {
          type: 'string',
          description: 'hoy, semana o mes.',
          enum: ['hoy', 'semana', 'mes'],
        },
      },
    },
    alcance: 'deals:read',
    escribe: false,
    confirmar: false,
    async ejecutar(ctx, args) {
      const periodo = texto(args, 'periodo') ?? 'hoy';
      const desde = new Date();
      desde.setHours(0, 0, 0, 0);
      if (periodo === 'semana') desde.setDate(desde.getDate() - 6);
      if (periodo === 'mes') desde.setDate(1);
      const d = desde.toISOString();
      const cuenta = (tabla: string) =>
        ctx.db
          .from(tabla)
          .select('id', { count: 'exact', head: true })
          .eq('account_id', ctx.accountId);
      const [conv, cont, neg, gan, venc, valor] = await Promise.all([
        cuenta('conversations').gte('created_at', d),
        cuenta('contacts').gte('created_at', d),
        cuenta('deals').gte('created_at', d),
        cuenta('deals').eq('status', 'won').gte('updated_at', d),
        cuenta('tasks')
          .in('status', ['todo', 'in_progress'])
          .lt('due_at', new Date().toISOString()),
        ctx.db
          .from('deals')
          .select('value')
          .eq('account_id', ctx.accountId)
          .eq('status', 'won')
          .gte('updated_at', d),
      ]);
      return {
        periodo,
        conversaciones_nuevas: conv.count ?? 0,
        contactos_nuevos: cont.count ?? 0,
        negocios_creados: neg.count ?? 0,
        negocios_ganados: gan.count ?? 0,
        valor_ganado: ((valor.data ?? []) as { value: number }[]).reduce(
          (s, x) => s + Number(x.value ?? 0),
          0
        ),
        tareas_vencidas_de_la_cuenta: venc.count ?? 0,
      };
    },
  },
];

export function herramienta(nombre: string): Herramienta | undefined {
  return HERRAMIENTAS.find((h) => h.nombre === nombre);
}

/** Ejecuta una herramienta y devuelve siempre un objeto serializable, nunca lanza. */
export async function ejecutarHerramienta(
  ctx: ContextoHerramienta,
  nombre: string,
  args: Record<string, unknown>
): Promise<{ ok: true; resultado: unknown } | { ok: false; error: string }> {
  const h = herramienta(nombre);
  if (!h) return { ok: false, error: `No existe la herramienta ${nombre}.` };
  try {
    return { ok: true, resultado: await h.ejecutar(ctx, args ?? {}) };
  } catch (e) {
    if (e instanceof ErrorDeHerramienta) return { ok: false, error: e.message };
    console.error(`[herramientas] ${nombre}:`, e);
    return { ok: false, error: 'Error interno al ejecutar la acción.' };
  }
}
