'use client';

/**
 * La ficha de un contacto, como pantalla propia.
 *
 * Antes esto era una ventana encima del listado. Un contacto es la unidad
 * de trabajo del CRM —se entra, se mira la actividad, se agenda algo, se
 * vuelve— y con la ficha en un modal no tenía dirección: no se podía
 * compartir el enlace, ni abrir dos en pestañas distintas para compararlas,
 * y el botón de volver del navegador cerraba el listado entero en vez de la
 * ventana.
 *
 * Esta página es solo el marco: quién es el contacto y desde dónde se vino.
 * Todo lo demás lo pone `ContactDetailView`, incluida su propia cabecera con
 * el botón de volver — que va ahí dentro y no acá arriba porque en una fila
 * aparte se comía un alto que le hace falta al chat.
 */

import { useRouter, useParams, useSearchParams } from 'next/navigation';

import { ContactDetailView } from '@/components/contacts/contact-detail-view';

export default function ContactoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  // `?tab=next` abre directamente en «Próxima gestión». Lo usa el aviso del
  // panel de la bandeja, que manda acá justamente para agendar.
  const pestanaPedida = useSearchParams().get('tab');

  return (
    /* La ficha ocupa EXACTAMENTE el alto disponible y ni un píxel más, igual
       que la bandeja: lo que se desplaza es cada columna por dentro, no la
       página entera.

       `h-full` y no `100vh` menos una cuenta de restas. El contenedor de la
       aplicación ya tiene alto definido y este es su hijo, así que `h-full`
       da el alto real —descontando la cabecera, el relleno y el hueco que se
       reserva para la burbuja del teléfono— sin que haya que adivinar
       ninguno de los tres. La versión con `calc(100vh - 16rem)` fallaba
       justamente ahí: los números no incluían la burbuja, y con la
       telefonía encendida la página sobraba por abajo. */
    <div className="h-full min-h-0">
      <ContactDetailView
        contactId={id}
        pestanaPedida={pestanaPedida}
        // `router.back()` y no un enlace fijo al listado: quien llegó desde
        // la búsqueda global o desde una conversación espera volver ahí, no
        // caer en una lista que no estaba mirando.
        onVolver={() => router.back()}
        // La lista de contactos no está montada, así que no hay nada que
        // refrescar: lo que se guarda acá ya se ve acá.
        onUpdated={() => {}}
      />
    </div>
  );
}
