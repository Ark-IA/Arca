'use client';

import { useEffect, useState } from 'react';
import { Bot, Sparkles, Settings2, BarChart3 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AiPlayground } from '@/components/agents/ai-playground';
import { AiUsageCard } from '@/components/agents/ai-usage';
import { AiConfig } from '@/components/settings/ai-config';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { SoloAdministradores } from '@/components/auth/solo-administradores';

type Tab = 'playground' | 'setup' | 'usage';

function AgentsPage() {
  const { accountRole } = useAuth();
  const canViewUsage = accountRole ? canEditSettings(accountRole) : false;
  const [tab, setTab] = useState<Tab>('playground');
  const [decided, setDecided] = useState(false);

  // Land first-time users on Setup, returning users on the Playground.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/ai/config');
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setTab(data?.configured ? 'playground' : 'setup');
      } catch {
        if (!cancelled) setTab('setup');
      } finally {
        if (!cancelled) setDecided(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Bot className="text-primary h-6 w-6" />
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          Agentes de IA
        </h1>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        Tu agente de IA con tu propia clave de API: configúralo y pruébalo en el
        área de pruebas antes de que responda a los clientes en la bandeja de
        entrada.
      </p>

      {decided && (
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          className="mt-6"
        >
          <TabsList>
            <TabsTrigger value="playground">
              <Sparkles className="mr-1.5 h-4 w-4" /> Área de pruebas
            </TabsTrigger>
            <TabsTrigger value="setup">
              <Settings2 className="mr-1.5 h-4 w-4" /> Configuración
            </TabsTrigger>
            {canViewUsage && (
              <TabsTrigger value="usage">
                <BarChart3 className="mr-1.5 h-4 w-4" /> Consumo
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="playground" className="mt-4">
            <AiPlayground onGoToSetup={() => setTab('setup')} />
          </TabsContent>

          <TabsContent value="setup" className="mt-4">
            <AiConfig />
          </TabsContent>

          {canViewUsage && (
            <TabsContent value="usage" className="mt-4">
              <AiUsageCard />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

/**
 * Flujos, automatizaciones y agentes definen cómo responde la plataforma a
 * TODOS los clientes, no a una conversación. Por eso son de administración.
 *
 * La puerta de verdad está en las rutas de API; esto solo evita que quien
 * no tiene permiso vea la pantalla armarse y fallar consulta por consulta.
 */
export default function Pagina() {
  return (
    <SoloAdministradores modulo="Los agentes de IA">
      <AgentsPage />
    </SoloAdministradores>
  );
}
