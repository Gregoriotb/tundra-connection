/**
 * App — root layout y providers.
 *
 * En esta etapa (FASE 3) la app monta directamente la landing con las
 * secciones Catálogo + Servicios. Las páginas Login/Admin/Dashboard
 * llegarán en FASES 7-8.
 */

import { useEffect, useState } from 'react';

import { NotificationBell } from './components/NotificationBell';
import { ProfileCompletionBanner } from './components/ProfileCompletionBanner';
import { AdminPage } from './pages/AdminPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { CatalogSection } from './sections/CatalogSection';
import { ServicesSection } from './sections/ServicesSection';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { WebSocketProvider } from './contexts/WebSocketContext';

export default function App(): JSX.Element {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <CartProvider>
          <AppShell />
        </CartProvider>
      </WebSocketProvider>
    </AuthProvider>
  );
}

/**
 * AppShell — vive DENTRO de los providers. Lee `useAuth` y decide si
 * mostrar OnboardingPage (forzada) o la landing normal con banner de
 * perfil incompleto (sutil).
 */
function AppShell(): JSX.Element {
  const { user, status: authStatus } = useAuth();
  const [, setShowLogin] = useState(false);
  const [forceOnboarding, setForceOnboarding] = useState(false);

  // Hash-based routing minimal: #admin abre el panel; cualquier otro hash
  // o vacío deja la landing. Suficiente hasta que entre react-router.
  const [route, setRoute] = useState<string>(
    typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '',
  );
  useEffect(() => {
    const onHash = (): void => setRoute(window.location.hash.replace('#', ''));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Forzar onboarding si está autenticado y le falta lo básico
  // (account_type / nombre / phone). Banner sutil cubre el resto.
  const needsOnboarding =
    authStatus === 'authenticated' &&
    user !== null &&
    !user.has_completed_onboarding;

  // Ruta admin: AdminPage maneja su propia protección (404 si !is_admin).
  if (route === 'admin') {
    return (
      <AdminPage
        onExit={() => {
          window.location.hash = '';
        }}
      />
    );
  }

  if (needsOnboarding || forceOnboarding) {
    return (
      <OnboardingPage onComplete={() => setForceOnboarding(false)} />
    );
  }

  return (
    <div className="min-h-screen bg-tundra-bg text-white font-body">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-black/60 border-b border-tundra-border">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="font-display text-xl text-tundra-gold tracking-wider">
            TUNDRA<span className="text-white">.connection</span>
          </div>
          <nav className="hidden lg:flex items-center gap-8 text-sm uppercase tracking-wider text-white/50">
            <a href="#servicios" className="hover:text-white">Servicios</a>
            <a href="#catalogo" className="hover:text-white">Catálogo</a>
            <a href="#contacto" className="hover:text-white">Contacto</a>
          </nav>
          <div className="flex items-center gap-3">
            {user?.is_admin && (
              <a
                href="#admin"
                className="text-xs uppercase tracking-wider text-tundra-gold hover:text-yellow-300 border border-tundra-gold/40 rounded px-2.5 py-1"
              >
                Admin
              </a>
            )}
            <NotificationBell />
          </div>
        </div>
      </header>

      <ProfileCompletionBanner onComplete={() => setForceOnboarding(true)} />

      <main>
        <ServicesSection onLoginRequest={() => setShowLogin(true)} />
        <CatalogSection />
      </main>

      <footer className="border-t border-tundra-border py-12 px-6 text-center text-white/30 text-xs uppercase tracking-wider">
        © 2026 Tundra Connection · Telecomunicaciones
      </footer>
    </div>
  );
}
