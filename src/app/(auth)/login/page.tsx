"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MessageSquare, UsersRound } from "lucide-react";

// `useSearchParams` opts the component out of static prerendering
// unless it sits under a Suspense boundary. We split the form into
// a child component so the outer page can prerender the chrome
// (background, card frame) while the form hydrates with the query
// string on the client.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  // Forwarded from `/join/<token>` when the visitor already has an
  // account. After a successful sign-in we send them to the join
  // page to accept rather than to /dashboard.
  const inviteToken = searchParams.get("invite");
  const t = useTranslations("LoginPage");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Full-page navigation (not router.push) so the browser issues a
    // fresh top-level request that carries the just-written Supabase
    // auth cookies to the middleware gating /dashboard. A soft
    // client-side navigation can reach the protected route before the
    // server observes the new session, so the middleware bounces it
    // back to /login — which looks like the page "just refreshing"
    // instead of signing in (issue #365). Mirrors the deliberate full
    // reload the invite-accept flow already uses in join/[token].
    const destination = inviteToken
      ? `/join/${encodeURIComponent(inviteToken)}`
      : "/dashboard";
    window.location.href = destination;
  };

  return (
    // Identidad ARK-IA: los colores van en valores literales, no en los tokens
    // del tema, para que la pantalla se vea igual sin importar si el visitante
    // tiene el sistema en claro o en oscuro. Es la puerta de entrada: la marca
    // no puede depender de la preferencia del navegador.
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080B0F] px-4 py-12">
      {/* resplandor de marca */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[60vh]"
        style={{
          background:
            "radial-gradient(900px 420px at 50% -10%, rgba(0,255,162,.14), transparent 65%)",
        }}
      />
      {/* retícula */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,255,162,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,162,.05) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(760px 420px at 50% 0%, #000 28%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(760px 420px at 50% 0%, #000 28%, transparent 78%)",
        }}
      />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo.svg"
          alt="ARK-IA CRM"
          className="mb-6 h-14 w-auto max-w-[300px]"
        />

        <p className="mb-5 text-center text-sm text-[#8FA59D]">
          Inteligencia artificial y automatización para tu operación comercial
        </p>

        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {[
            ["IA", "que atiende 24/7"],
            ["Automatizaciones", "sin código"],
            ["Omnicanal", "WhatsApp"],
          ].map(([fuerte, resto]) => (
            <span
              key={fuerte}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#00FFA2]/25 bg-[#00FFA2]/[0.06] px-3.5 py-1.5 text-xs text-[#BFF5E0]"
            >
              <b className="font-semibold text-[#00FFA2]">{fuerte}</b>
              {resto}
            </span>
          ))}
        </div>

      <Card className="w-full border-[#00FFA2]/20 bg-[#131922]/95 shadow-[0_26px_64px_-22px_rgba(0,255,162,.28)]">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-[#00FFA2]/10">
            {inviteToken ? (
              <UsersRound className="h-6 w-6 text-[#00FFA2]" />
            ) : (
              <MessageSquare className="h-6 w-6 text-[#00FFA2]" />
            )}
          </div>
          <CardTitle className="text-xl text-[#EAFFF7]">
            {inviteToken ? t('titleAccept') : t('titleWelcome')}
          </CardTitle>
          <CardDescription className="text-[#8FA59D]">
            {inviteToken
              ? t('descAccept')
              : t('descWelcome')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-[#9FB3AB]">
                {t('emailLabel')}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-white/10 bg-[#0E141C] text-[#EAFFF7] placeholder:text-[#5F7169] focus-visible:border-[#00FFA2] focus-visible:ring-[#00FFA2]/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-[#9FB3AB]">
                  {t('passwordLabel')}
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-[#00FFA2] hover:text-[#00FFA2]/80"
                >
                  {t('forgotPassword')}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder={t('passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-white/10 bg-[#0E141C] text-[#EAFFF7] placeholder:text-[#5F7169] focus-visible:border-[#00FFA2] focus-visible:ring-[#00FFA2]/20"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="mt-2 h-10 w-full bg-gradient-to-b from-[#00FFA2] to-[#00C97F] font-semibold text-[#04120C] hover:opacity-90 disabled:opacity-50"
            >
              {loading ? t('signingIn') : t('signIn')}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-[#8FA59D]">
            {t('noAccount')}{" "}
            <Link
              href={
                inviteToken
                  ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                  : "/signup"
              }
              className="text-[#00FFA2] hover:text-[#00FFA2]/80"
            >
              {t('createAccount')}
            </Link>
          </p>
        </CardContent>
      </Card>

        <p className="mt-8 text-xs text-[#5F7169]">ARK-IA CRM</p>
      </div>
    </div>
  );
}
