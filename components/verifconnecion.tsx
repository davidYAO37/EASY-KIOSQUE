'use client'
import { useRouter, usePathname } from 'next/navigation';
import React from 'react'
import { useAuthUser } from '@/hooks/useAuthUser';

function Verifconnecion({ children }: { children: React.ReactNode }) {

    const { user, loading, erreur, actualiser } = useAuthUser();
    const router = useRouter();
    const pathname = usePathname();

    // Pages publiques sans authentification
    const publicPages = ['/', '/connexion', '/inscription', '/mot-de-passe-oublie', '/reinitialiser', '/cgu', '/confidentialite'];

    const publique = publicPages.includes(pathname);
    React.useEffect(() => {
        // Vérifier le cookie JWT côté serveur via /api/me
        if (!publique && !loading && !erreur && !user) router.replace('/connexion');
    }, [publique, loading, erreur, user, router]);

    if (!publique && erreur) return <div role="alert">Connexion au serveur impossible. <button onClick={() => void actualiser()}>Réessayer</button></div>;
    if (!publique && (loading || !user)) {
        return <div>Chargement...</div>;
    } else {
        return <>{children}</>;
    }

}

export default Verifconnecion
