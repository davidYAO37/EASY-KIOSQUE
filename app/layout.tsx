import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import 'react-toastify/dist/ReactToastify.css';
import './globals.css';
import Verifconnecion from '@/components/verifconnecion';
import AppToast from '@/components/AppToast';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

export const metadata = {
  title: 'EASY-KIOSQUE',
  description: 'Gestion commerciale multi-kiosques — EASY-KIOSQUE',
  manifest: '/manifest.json',
  icons: { icon: '/logo.svg' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ea580c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-scroll-behavior="smooth">
      <body>
        <Verifconnecion>
          <div className="d-flex flex-column flex-md-row min-vh-100" style={{ minHeight: '100vh' }}>
            <main className="flex-grow-1 p-3" style={{ minWidth: 0 }}>
              {children}
            </main>
          </div>
        </Verifconnecion>
        <AppToast />
        <ServiceWorkerRegister />
        <script src="/js/bootstrap.bundle.js"></script>
      </body>
    </html>
  );
}
