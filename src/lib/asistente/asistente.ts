/**
 * El asistente de ARCA: una orden en lenguaje natural (hablada o escrita)
 * se convierte en acciones sobre el CRM.
 *
 * Bucle, con tope de vueltas:
 *   1. El modelo lee la conversación y decide qué herramientas usar.
 *   2. Las de lectura y las de escritura "seguras" se ejecutan en el acto.
 *   3. Las marcadas `confirmar` NO se ejecutan: quedan pendientes y el
 *      modelo recibe como resultado que la persona tiene que confirmarlas.
 *   4. Se repite hasta que el modelo contesta sin pedir más herramientas.
 *
 * Todo corre con los permisos de quien habla (el cliente de su sesión, con
 * RLS): un asesor no puede pedirle al asistente lo que no podría hacer a mano.
 */

import type { AiConfig } from '@/lib/ai/types';
import {
  HERRAMIENTAS,
  ejecutarHerramienta,
  type ContextoHerramienta,
  type Herramienta,
} from './herramientas';
import { pasoDelModelo, type Llamada, type Mensaje } from './modelo';

const MAX_VUELTAS = 6;
const MAX_HISTORIAL = 30;
const MAX_RESULTADO = 6000;

export interface Pendiente {
  id: string;
  nombre: string;
  args: Record<string, unknown>;
  descripcion: string;
}

export interface Respuesta {
  texto: string;
  historial: Mensaje[];
  pendientes: Pendiente[];
  acciones: { nombre: string; ok: boolean; error?: string }[];
}

export function instrucciones(args: {
  nombre: string;
  rol: string;
  zona: string;
  ahora?: Date;
}): string {
  const ahora = args.ahora ?? new Date();
  const fecha = ahora.toLocaleString('es-CO', {
    timeZone: args.zona,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return [
    `Eres el asistente del CRM ARCA. Hablas con ${args.nombre} (rol: ${args.rol}).`,
    `Ahora es ${fecha} (zona horaria ${args.zona}). Resuelve "mañana", "el jueves", "en una hora" a fechas ISO 8601 con esa zona.`,
    'Responde en español, breve y natural: tu respuesta se va a escuchar en voz alta. Nada de listas largas, tablas ni markdown; como mucho tres o cuatro frases.',
    'Usa las herramientas para consultar y actuar. Nunca inventes ids: búscalos primero (buscar_contactos, buscar_negocios, mis_tareas).',
    'Si hay varias coincidencias posibles, pregunta cuál antes de actuar.',
    'Algunas acciones quedan pendientes de confirmación: dilo en una frase ("Te dejo para confirmar mover el negocio a Propuesta") y no digas que ya está hecho.',
    'Si una herramienta devuelve error, explícalo en palabras simples.',
  ].join('\n');
}

function recortar(v: unknown): string {
  const t = JSON.stringify(v);
  return t.length > MAX_RESULTADO
    ? `${t.slice(0, MAX_RESULTADO)}…(recortado)`
    : t;
}

export async function conversar(args: {
  ctx: ContextoHerramienta;
  config: Pick<AiConfig, 'provider' | 'model' | 'apiKey'>;
  sistema: string;
  historial: Mensaje[];
  orden: string;
  /** Sin permisos de escritura (observador): solo se ofrecen las de lectura. */
  soloLectura?: boolean;
  /** Inyectable en pruebas. */
  paso?: typeof pasoDelModelo;
}): Promise<Respuesta> {
  const paso = args.paso ?? pasoDelModelo;
  const catalogo: Herramienta[] = args.soloLectura
    ? HERRAMIENTAS.filter((h) => !h.escribe)
    : HERRAMIENTAS;
  const porNombre = new Map(catalogo.map((h) => [h.nombre, h]));

  const historial: Mensaje[] = [
    ...args.historial.slice(-MAX_HISTORIAL),
    { rol: 'usuario', texto: args.orden },
  ];
  const pendientes: Pendiente[] = [];
  const acciones: Respuesta['acciones'] = [];

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta += 1) {
    const r = await paso({
      config: args.config,
      sistema: args.sistema,
      mensajes: historial,
      herramientas: catalogo,
    });
    historial.push({
      rol: 'asistente',
      texto: r.texto,
      llamadas: r.llamadas.length ? r.llamadas : undefined,
    });

    if (r.llamadas.length === 0) {
      return { texto: r.texto ?? 'Listo.', historial, pendientes, acciones };
    }

    for (const llamada of r.llamadas) {
      historial.push(
        await resolver(args.ctx, porNombre, llamada, pendientes, acciones)
      );
    }
  }

  return {
    texto: 'Me enredé con esa petición. ¿Me la dices de otra forma?',
    historial,
    pendientes,
    acciones,
  };
}

async function resolver(
  ctx: ContextoHerramienta,
  porNombre: Map<string, Herramienta>,
  llamada: Llamada,
  pendientes: Pendiente[],
  acciones: Respuesta['acciones']
): Promise<Mensaje> {
  const h = porNombre.get(llamada.nombre);
  if (!h) {
    return {
      rol: 'herramienta',
      id: llamada.id,
      nombre: llamada.nombre,
      resultado: recortar({ error: 'Esa acción no está disponible para ti.' }),
    };
  }

  if (h.confirmar) {
    pendientes.push({
      id: llamada.id,
      nombre: h.nombre,
      args: llamada.args,
      descripcion: h.describir?.(llamada.args) ?? h.descripcion,
    });
    return {
      rol: 'herramienta',
      id: llamada.id,
      nombre: h.nombre,
      resultado: recortar({
        estado: 'pendiente_de_confirmacion',
        nota: 'La persona debe confirmar en pantalla.',
      }),
    };
  }

  const r = await ejecutarHerramienta(ctx, h.nombre, llamada.args);
  acciones.push(
    r.ok
      ? { nombre: h.nombre, ok: true }
      : { nombre: h.nombre, ok: false, error: r.error }
  );
  return {
    rol: 'herramienta',
    id: llamada.id,
    nombre: h.nombre,
    resultado: recortar(r.ok ? r.resultado : { error: r.error }),
  };
}

/** Qué se le dice a la persona cuando confirma una acción pendiente. */
export function fraseDeConfirmacion(
  nombre: string,
  resultado: unknown
): string {
  const r = (resultado ?? {}) as Record<string, unknown>;
  switch (nombre) {
    case 'mover_negocio':
      return `Listo, moví «${r.negocio}» a ${r.etapa}.`;
    case 'cerrar_negocio':
      return `Listo, «${r.negocio}» quedó como ${r.estado === 'won' ? 'ganado' : 'perdido'}.`;
    default:
      return 'Listo, hecho.';
  }
}
