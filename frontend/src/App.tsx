/**
 * App — root layout y providers.
 *
 * En esta etapa (FASE 3) la app monta directamente la landing con las
 * secciones Catálogo + Servicios. Las páginas Login/Admin/Dashboard
 * llegarán en FASES 7-8.
 */

import { useState } from 'react';

import { CatalogSection } from './sections/CatalogSection';
import { ServicesSection } from './sections/ServicesSection';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';

export default function App(): JSX.Element {
  // Placeholder mínimo — el Hero / Header completos llegan con UI_UX_SPEC.
  // El logo se reemplazará con el real cuando esté disponible.
  const [, setShowLogin] = useState(false);

  return (
    <AuthProvider>
      <CartProvider>
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
            </div>
          </header>

          <main>
            <ServicesSection onLoginRequest={() => setShowLogin(true)} />
            <CatalogSection />
          </main>

          <footer className="border-t border-tundra-border py-12 px-6 text-center text-white/30 text-xs uppercase tracking-wider">
            © 2026 Tundra Connection · Telecomunicaciones
          </footer>
        </div>
      </CartProvider>
    </AuthProvider>
  );
}
