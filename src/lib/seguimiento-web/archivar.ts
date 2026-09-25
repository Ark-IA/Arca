/**
 * De un formulario a un contacto. Es el único camino.
 *
 * Todo envío ya está guardado en `formularios_web` antes de llegar acá.
 * Archivarlo es aparte y puede negarse: el motivo queda en
 * `motivo_omitido` y la fila sigue ahí para que alguien la revise.
 *
 * Reglas, en orden:
 * 1. Sin teléfono ni correo no hay contacto.
 * 2. La lista de bloqueo manda igual que en el envío de mensajes: un número o
 *    dominio bloqueado no vuelve a entrar por la puerta de atrás.
 * 3. Si ya existe (por teléfono, y si no por correo) se le adjunta el envío.
 *    Un contacto existente no gasta cupo: adjuntarle algo no inunda nada.
 * 4. Si hay que crearlo, cuenta contra CONTACTOS_POR_HORA del sitio.
 * 5. Se reclama la fila ANTES de escribir nada (`archivado_en is null`): dos
 *    entregas del mismo envío no dejan dos notas en la ficha.
 *
 * Adaptado de trycompai/crm (MIT, ver licenses/trycompai-crm.txt).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { findOrCreateContact, resolveAuditUserId } from '@/lib/api/v1/contacts';
import { isUniqueViolation } from '@/lib/contacts/dedupe';
import { findExistingContact } from '@/lib/contacts/dedupe';
import { addContactTagAndDispatch } from '@/lib/contacts/tag-events';
import { runAutomationsForTrigger } from '@/lib/automations/engine';
import { anotarEnLinea } from '@/lib/registros/linea-de-tiempo';
import { checkRateLimit } from '@/lib/rate-limit';
import { describirOrigen, type Origen } from './atribucion';
import { esCorreoDeMaquina, type CamposFormulario } from './campos';
import { CONTACTOS_POR_HORA, MOTIVO_TOPE_CONTACTOS } from './constantes';
import type { Sitio } from './sitios';

export interface Envio {
  id: string;
  sitio: Sitio;
  visitante: string;
  host: string;
  ruta: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  empresa: string | null;
  campos: CamposFormulario;
  primerOrigen: Origen;
  ultimoOrigen: Origen;
}

export type Resultado =
  | { archivado: true; contactId: string; creado: boolean }
  | { archivado: false; motivo: string };

export async function archivarEnvio(
  db: SupabaseClient,
  envio: Envio
): Promise<Resultado> {
  const { sitio } = envio;
  const email =
    envio.email && !esCorreoDeMaquina(envio.email) ? envio.email : null;
  const telefono = envio.telefono;

  if (!telefono && !email) {
    return omitir(
      db,
      envio.id,
      envio.email ? 'El correo no lo lee una persona' : 'Sin teléfono ni correo'
    );
  }

  const bloqueo = await bloqueado(db, sitio.accountId, telefono, email);
  if (bloqueo) return omitir(db, envio.id, bloqueo);

  let contactId = await existente(db, sitio.accountId, telefono, email);
  let creado = false;

  if (!contactId) {
    const cupo = checkRateLimit(`seguimiento-web:contactos:${sitio.id}`, {
      limit: CONTACTOS_POR_HORA,
      windowMs: 3_600_000,
    });
    if (!cupo.success) return omitir(db, envio.id, MOTIVO_TOPE_CONTACTOS);

    const creadoAhora = await crear(
      db,
      sitio.accountId,
      envio,
      telefono,
      email
    );
    if (!creadoAhora)
      return omitir(db, envio.id, 'No se pudo crear el contacto');
    contactId = creadoAhora.id;
    creado = creadoAhora.creado;
  }

  const reclamado = await reclamar(db, envio.id, contactId);
  // Otra entrega del mismo envío ya lo archivó: no se repite nada.
  if (!reclamado) return { archivado: true, contactId, creado: false };

  await adjuntar(db, envio, contactId, creado);

  return { archivado: true, contactId, creado };
}

async function existente(
  db: SupabaseClient,
  accountId: string,
  telefono: string | null,
  email: string | null
): Promise<string | null> {
  if (telefono) {
    const porTelefono = await findExistingContact(db, accountId, telefono);
    if (porTelefono) return porTelefono.id;
  }
  if (email) {
    const { data } = await db
      .from('contacts')
      .select('id')
      .eq('account_id', accountId)
      .ilike('email', email)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) return data.id as string;
  }
  return null;
}

async function crear(
  db: SupabaseClient,
  accountId: string,
  envio: Envio,
  telefono: string | null,
  email: string | null
): Promise<{ id: string; creado: boolean } | null> {
  try {
    const auditUserId = await resolveAuditUserId(db, accountId);

    if (telefono) {
      // El mismo camino que la API pública y el webhook: un contacto que entra
      // por la web es indistinguible de uno que escribió por WhatsApp.
      const { id, created } = await findOrCreateContact(
        db,
        accountId,
        auditUserId,
        {
          phone: telefono,
          name: envio.nombre,
          email,
          company: envio.empresa,
        }
      );
      return { id, creado: created };
    }

    // Solo correo. La restricción `contacts_via_de_contacto` lo admite.
    const { data, error } = await db
      .from('contacts')
      .insert({
        account_id: accountId,
        user_id: auditUserId,
        phone: null,
        email,
        name: envio.nombre ?? email,
        company: envio.empresa,
      })
      .select('id')
      .single();

    if (error || !data) {
      if (isUniqueViolation(error)) {
        const gano = await existente(db, accountId, null, email);
        if (gano) return { id: gano, creado: false };
      }
      console.error(
        '[seguimiento-web] no se pudo crear el contacto:',
        error?.message
      );
      return null;
    }
    return { id: data.id as string, creado: true };
  } catch (e) {
    console.error('[seguimiento-web] error creando el contacto:', e);
    return null;
  }
}

async function reclamar(
  db: SupabaseClient,
  envioId: string,
  contactId: string
): Promise<boolean> {
  const { data, error } = await db
    .from('formularios_web')
    .update({
      contact_id: contactId,
      archivado_en: new Date().toISOString(),
      motivo_omitido: null,
    })
    .eq('id', envioId)
    .is('archivado_en', null)
    .select('id');

  if (error) {
    console.error(
      '[seguimiento-web] no se pudo reclamar el envío:',
      error.message
    );
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Lo que sigue a archivar. Nada de esto puede deshacer el contacto: si la
 * automatización falla, el contacto igual entró.
 */
async function adjuntar(
  db: SupabaseClient,
  envio: Envio,
  contactId: string,
  creado: boolean
): Promise<void> {
  const { sitio } = envio;

  await anotarEnLinea(db, {
    accountId: sitio.accountId,
    tipo: 'contact',
    registroId: contactId,
    eventType: 'web.form_submitted',
    title: `Llenó un formulario en ${envio.host}`,
    description: `${envio.host}${envio.ruta} · ${describirOrigen(envio.ultimoOrigen)}`,
    metadata: {
      formulario_id: envio.id,
      campos: envio.campos,
      primer_origen: envio.primerOrigen,
      ultimo_origen: envio.ultimoOrigen,
    },
  });

  const { error: errVisitante } = await db.from('visitantes_web').upsert(
    {
      account_id: sitio.accountId,
      sitio_id: sitio.id,
      visitante: envio.visitante,
      contact_id: contactId,
      ultimo_origen: envio.ultimoOrigen,
      ultima_visita: new Date().toISOString(),
    },
    { onConflict: 'sitio_id,visitante' }
  );
  if (errVisitante)
    console.error('[seguimiento-web] visitante:', errVisitante.message);

  try {
    if (creado) {
      await runAutomationsForTrigger({
        accountId: sitio.accountId,
        triggerType: 'new_contact_created',
        contactId,
      });
    }
    // La etiqueta va aunque el contacto ya existiera: volver a llenar el
    // formulario es una señal, y `tag_added` solo se dispara la primera vez.
    if (sitio.etiquetaId) {
      await addContactTagAndDispatch({
        db,
        accountId: sitio.accountId,
        contactId,
        tagId: sitio.etiquetaId,
      });
    }
  } catch (e) {
    console.error('[seguimiento-web] automatizaciones:', e);
  }
}

async function bloqueado(
  db: SupabaseClient,
  accountId: string,
  telefono: string | null,
  email: string | null
): Promise<string | null> {
  const valores: string[] = [];
  if (telefono) valores.push(telefono, `+${telefono}`);
  if (email) valores.push(email, email.split('@')[1] ?? '');

  const { data, error } = await db
    .from('blocklist')
    .select('kind, value')
    .eq('account_id', accountId)
    .in('value', valores.filter(Boolean));

  if (error) {
    // Ante la duda, no se crea: un contacto de menos se recupera desde el
    // envío guardado; un mensaje a alguien bloqueado no.
    console.error('[seguimiento-web] lista de bloqueo:', error.message);
    return 'No se pudo consultar la lista de bloqueo';
  }

  const fila = (data ?? [])[0] as { kind: string } | undefined;
  if (!fila) return null;
  if (fila.kind === 'domain') return 'El dominio está en la lista de bloqueo';
  if (fila.kind === 'email') return 'El correo está en la lista de bloqueo';
  return 'El teléfono está en la lista de bloqueo';
}

async function omitir(
  db: SupabaseClient,
  envioId: string,
  motivo: string
): Promise<Resultado> {
  await db
    .from('formularios_web')
    .update({ motivo_omitido: motivo })
    .eq('id', envioId);
  return { archivado: false, motivo };
}
