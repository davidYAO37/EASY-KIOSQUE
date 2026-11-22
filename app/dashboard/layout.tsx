import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import BandeauAbonnement from '@/components/BandeauAbonnement';
import BandeauHorsLigne from '@/components/BandeauHorsLigne';
import 'bootstrap/dist/css/bootstrap.min.css';

export const metadata = {
    title: 'EASY-KIOSQUE — Tableau de bord',
    description: 'Gestion commerciale multi-kiosques EASY-KIOSQUE',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <div className="d-flex flex-column min-vh-100" style={{ minHeight: '100vh' }}>
                <div className="d-flex flex-column flex-lg-row flex-grow-1">
                    <Sidebar />
                    <div className="flex-grow-1 d-flex flex-column" style={{ minWidth: 0 }}>
                        <div className="px-2 px-md-3 px-xl-4 pt-2 pt-md-3">
                            <Header />
                            <BandeauAbonnement />
                            <BandeauHorsLigne />
                        </div>
                        <main className="flex-grow-1 p-2 p-md-3 p-xl-4 pt-0">
                            {children}
                        </main>
                    </div>
                </div>
            </div>
        </>
    );
}
