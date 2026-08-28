'use client';

/**
 * Puerta de página para lo que configura el sistema.
 *
 * Envuelve Flujos, Automatizaciones y Agentes de IA. NO es la barrera de
 * seguridad —esa son las guardas de las rutas de API, que no dependen de lo
 * que el navegador decida dibujar— sino la explicación: sin esto, un asesor
 * que llega por un enlace guardado ve la pantalla armarse y después fallar
 * consulta por consulta, y concluye que el producto está roto.
 *
 * No redirige. Mandarlo al panel sin decir nada deja la misma duda: hizo
 * clic, apareció otra cosa, y no sabe si fue un error suyo. Es más corto
 * decírselo.
 */

import { ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { canConfigureSystem } from '@/lib/auth/roles';

export function SoloAdministradores({
  children,
  /** Qué intentó abrir, para nombrarlo en el mensaje. */
  modulo,
}: {
  children: React.ReactNode;
  modulo: string;
}) {
  const router = useRouter();
  const { accountRole, profileLoading } = useAuth();

  // Mientras no se sabe el rol no se dibuja ninguna de las dos cosas: pintar
  // el módulo y reemplazarlo por un cartel medio segundo después se lee como
  // un fallo, y pintar el cartel primero acusa a quien sí tiene permiso.
  if (profileLoading || !accountRole) return null;

  if (canConfigureSystem(accountRole)) return <>{children}</>;

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="border-border bg-card max-w-md rounded-lg border p-6 text-center">
        <div className="bg-muted mx-auto flex h-11 w-11 items-center justify-center rounded-full">
          <ShieldAlert className="text-muted-foreground h-5 w-5" />
        </div>
        <h1 className="text-foreground mt-3 text-base font-semibold">
          {modulo} lo configura un administrador
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Aquí se define cómo responde la plataforma a todos los clientes, así
          que solo pueden entrar los administradores de la cuenta. Tu trabajo
          del día a día está en Conversaciones.
        </p>
        <Button className="mt-4" onClick={() => router.push('/inbox')}>
          Ir a Conversaciones
        </Button>
      </div>
    </div>
  );
}
