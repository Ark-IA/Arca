/**
 * Forma de lo que devuelve `informe_general` (migración 081), y utilidades
 * puras de la pantalla de Informes.
 */

export interface InformeGeneral {
  atencion: {
    conversaciones_nuevas: number;
    mensajes_recibidos: number;
    mensajes_enviados: number;
    mensajes_bot: number;
    primera_respuesta_mediana_min: number | null;
    sin_respuesta: number;
    abiertas_ahora: number;
  };
  por_canal: { canal: string; conversaciones: number }[];
  por_asesor: {
    user_id: string;
    nombre: string;
    conversaciones: number;
    mensajes: number;
    primera_respuesta_mediana_min: number | null;
    cerradas: number;
  }[];
  serie_diaria: {
    dia: string;
    recibidos: number;
    enviados: number;
    contactos_nuevos: number;
  }[];
  origen: {
    total: number;
    por_via: { via: string; contactos: number }[];
    web: {
      fuente: string;
      medio: string;
      campana: string | null;
      contactos: number;
    }[];
    formularios: {
      recibidos: number;
      con_contacto: number;
      omitidos: { motivo: string; n: number }[];
    };
  };
  ventas: {
    creados: number;
    ganados: number;
    perdidos: number;
    valor_ganado: number;
    valor_abierto: number;
    abiertos: number;
  };
  embudo: {
    pipeline: string;
    etapa: string;
    color: string;
    negocios: number;
    valor: number;
  }[];
  ventas_por_asesor: {
    nombre: string;
    ganados: number;
    valor_ganado: number;
    abiertos: number;
  }[];
  llamadas: {
    total: number;
    entrantes: number;
    salientes: number;
    contestadas: number;
    perdidas: number;
    duracion_media_s: number | null;
  };
  masivos: {
    nombre: string;
    fecha: string;
    destinatarios: number;
    enviados: number;
    entregados: number;
    leidos: number;
    respondidos: number;
    fallidos: number;
  }[];
}

export type Rango = '7d' | '30d' | '90d' | 'mes' | 'mes_anterior';

export const NOMBRE_RANGO: Record<Rango, string> = {
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  '90d': 'Últimos 90 días',
  mes: 'Este mes',
  mes_anterior: 'Mes anterior',
};

/** [desde, hasta) en hora local del navegador; hasta es exclusivo. */
export function limitesDe(
  rango: Rango,
  ahora: Date = new Date()
): { desde: Date; hasta: Date } {
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const manana = new Date(hoy);
  manana.setDate(manana.getDate() + 1);

  switch (rango) {
    case '7d':
    case '30d':
    case '90d': {
      const dias = Number(rango.replace('d', ''));
      const desde = new Date(hoy);
      desde.setDate(desde.getDate() - (dias - 1));
      return { desde, hasta: manana };
    }
    case 'mes':
      return {
        desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1),
        hasta: manana,
      };
    case 'mes_anterior':
      return {
        desde: new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1),
        hasta: new Date(hoy.getFullYear(), hoy.getMonth(), 1),
      };
  }
}

/** "1 h 25 min", "12 min", "45 s". */
export function duracion(minutos: number | null | undefined): string {
  if (minutos === null || minutos === undefined) return '—';
  if (minutos < 1) return `${Math.round(minutos * 60)} s`;
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24} h`;
}

export function porcentaje(parte: number, total: number): string {
  if (!total) return '—';
  return `${Math.round((parte / total) * 100)} %`;
}

export { aCsv } from '@/lib/exportar/csv';
