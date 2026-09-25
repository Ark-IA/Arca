/**
 * Módulos de la instalación: qué partes de ARCA tiene activas este cliente.
 *
 * ARCA se instala un servidor por cliente, y no todos compran lo mismo. El
 * superadministrador (ARK-IA, ver `superadmin.ts`) prende y apaga módulos;
 * el dueño de la cuenta del cliente NO puede, porque es él quien paga por
 * ellos.
 *
 * Apagar un módulo no es esconder un menú. Se cierra en tres lugares, porque
 * cualquiera de ellos solo se puede esquivar:
 *   1. El menú y la configuración no lo muestran (comodidad).
 *   2. El middleware rechaza sus páginas y su API (seguridad).
 *   3. Los motores que corren solos (automatizaciones, flujos, agente de IA,
 *      formularios web) no se ejecutan: un módulo apagado que igual le
 *      contesta a los clientes no está apagado.
 *
 * Puro: sin base ni red. Lo usan el middleware, el servidor y el navegador.
 */

export const MODULOS = [
  'empresas',
  'objetos',
  'pipelines',
  'tareas',
  'calendario',
  'masivos',
  'automatizaciones',
  'flujos',
  'agentes_ia',
  'voz',
  'asistente',
  'telefonia',
  'colas',
  'facebook',
  'instagram',
  'formularios_web',
  'informes',
  'api',
] as const;

export type Modulo = (typeof MODULOS)[number];

export interface InfoModulo {
  nombre: string;
  descripcion: string;
  /** Páginas del panel (prefijos). */
  paginas: string[];
  /** Rutas de API (prefijos). Los webhooks de Meta nunca van acá: rechazarlos haría que Meta desactive el webhook entero. */
  api: string[];
  /** Secciones de Configuración que dependen de él. */
  ajustes: string[];
}

export const INFO_MODULOS: Record<Modulo, InfoModulo> = {
  empresas: {
    nombre: 'Empresas',
    descripcion: 'Fichas de empresas vinculadas a los contactos.',
    paginas: ['/companies'],
    api: ['/api/v1/companies'],
    ajustes: [],
  },
  objetos: {
    nombre: 'Objetos personalizados',
    descripcion:
      'Entidades propias (proyectos, pólizas…) con sus campos y permisos.',
    paginas: ['/objects'],
    api: ['/api/v1/objects'],
    ajustes: [],
  },
  pipelines: {
    nombre: 'Negocios y pipelines',
    descripcion: 'Embudos de venta en tablero, con valor y etapas.',
    paginas: ['/pipelines'],
    api: ['/api/v1/pipelines', '/api/v1/deals'],
    ajustes: ['deals'],
  },
  tareas: {
    nombre: 'Tareas',
    descripcion: 'Tareas asignadas a asesores, con vencimiento.',
    paginas: ['/tasks'],
    api: ['/api/v1/tasks'],
    ajustes: [],
  },
  calendario: {
    nombre: 'Calendario',
    descripcion: 'Citas y reuniones con los contactos.',
    paginas: ['/calendar'],
    api: ['/api/v1/calendar-events'],
    ajustes: [],
  },
  masivos: {
    nombre: 'Mensajes masivos',
    descripcion: 'Envíos de plantillas de WhatsApp a listas de contactos.',
    paginas: ['/broadcasts'],
    api: ['/api/whatsapp/broadcast', '/api/v1/broadcasts'],
    ajustes: [],
  },
  automatizaciones: {
    nombre: 'Automatizaciones',
    descripcion:
      'Reglas que actúan solas: al llegar un mensaje, al etiquetar, por horario.',
    paginas: ['/automations'],
    api: ['/api/automations'],
    ajustes: [],
  },
  flujos: {
    nombre: 'Flujos de chatbot',
    descripcion: 'Conversaciones guiadas con botones y menús.',
    paginas: ['/flows'],
    api: ['/api/flows'],
    ajustes: [],
  },
  agentes_ia: {
    nombre: 'Agente de IA',
    descripcion:
      'Respuestas automáticas con IA, base de conocimiento y borradores.',
    paginas: ['/agents'],
    api: ['/api/ai'],
    ajustes: ['agente-ia'],
  },
  voz: {
    nombre: 'Respuesta por voz',
    descripcion:
      'El agente de IA contesta con notas de voz clonadas. Necesita el servicio de voz.',
    paginas: [],
    api: ['/api/ai/voz'],
    ajustes: ['voz'],
  },
  asistente: {
    nombre: 'Asistente por voz',
    descripcion: 'Botón de micrófono para pedirle cosas al CRM hablando: buscar, crear tareas, mover negocios. Usa la IA de la cuenta.',
    paginas: [],
    api: ['/api/asistente'],
    ajustes: [],
  },
  telefonia: {
    nombre: 'Telefonía',
    descripcion: 'Teléfono en el navegador, llamadas y grabaciones.',
    paginas: [],
    api: ['/api/telefonia'],
    ajustes: [],
  },
  colas: {
    nombre: 'Colas y horarios',
    descripcion:
      'Reparto de conversaciones entre asesores y horarios por línea.',
    paginas: [],
    api: ['/api/colas'],
    ajustes: ['colas'],
  },
  facebook: {
    nombre: 'Facebook Messenger',
    descripcion: 'Atender los mensajes de la página de Facebook.',
    paginas: [],
    api: [],
    ajustes: ['facebook'],
  },
  instagram: {
    nombre: 'Instagram',
    descripcion: 'Atender los mensajes directos de Instagram.',
    paginas: [],
    api: [],
    ajustes: ['instagram'],
  },
  formularios_web: {
    nombre: 'Formularios web',
    descripcion:
      'Los formularios de la página del cliente entran como contactos.',
    paginas: [],
    api: [],
    ajustes: ['seguimiento-web'],
  },
  informes: {
    nombre: 'Informes',
    descripcion: 'Informes de atención, ventas y origen de clientes.',
    paginas: ['/informes'],
    api: [],
    ajustes: [],
  },
  api: {
    nombre: 'API y webhooks',
    descripcion: 'API pública, claves de acceso y webhooks salientes.',
    paginas: [],
    api: ['/api/v1', '/api/mcp'],
    ajustes: ['api'],
  },
};

export function esModulo(valor: unknown): valor is Modulo {
  return (
    typeof valor === 'string' && (MODULOS as readonly string[]).includes(valor)
  );
}

function coincide(ruta: string, prefijo: string): boolean {
  return ruta === prefijo || ruta.startsWith(`${prefijo}/`);
}

/**
 * Los módulos de los que depende una ruta (vacío si es del núcleo).
 *
 * Pueden ser varios: `/api/v1/deals` depende de pipelines Y de la API. Se
 * corta si cualquiera de los dos está apagado.
 */
export function modulosDeRuta(ruta: string): Modulo[] {
  const encontrados: Modulo[] = [];
  for (const m of MODULOS) {
    const info = INFO_MODULOS[m];
    if ([...info.paginas, ...info.api].some((p) => coincide(ruta, p))) {
      encontrados.push(m);
    }
  }
  return encontrados;
}

/** Módulo del que depende una sección de Configuración, o null si es del núcleo. */
export function moduloDeAjuste(seccion: string): Modulo | null {
  for (const m of MODULOS) {
    if (INFO_MODULOS[m].ajustes.includes(seccion)) return m;
  }
  return null;
}

/** Una ruta está disponible si NINGUNO de los módulos de los que depende está apagado. */
export function rutaDisponible(
  ruta: string,
  apagados: ReadonlySet<string>
): boolean {
  return modulosDeRuta(ruta).every((m) => !apagados.has(m));
}
