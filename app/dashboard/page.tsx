'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useKiosque } from '@/hooks/useKiosque';
import { ROLE_LABELS } from '@/lib/permissions';
import { fmtMontant, fmtDate } from '@/lib/format';

interface TB {
  controleur: boolean;
  jour: {
    ca: number; nbVentes: number; encaissements: number; remboursements: number;
    depenses: number; nbDepenses: number; creancesDu: number; nbCreances: number;
    remisesEnAttente: number; montantRemisesEnAttente: number; caissesOuvertes: number;
  };
  serie7j: { date: string; ca: number; nb: number }[];
  parKiosque: { kiosqueId: string; designation: string; ca: number; nbVentes: number; depenses: number }[];
  parMode: { mode: string; montant: number; nb: number }[];
  topProduits: { designation: string; quantite: number; montant: number }[];
}

const COULEURS_MODE = ['var(--ek-green)', '#14213d', '#f59e0b', '#64748b', '#0d9488', '#dc2626'];

function iconeMode(mode: string): string {
  const m = mode.toLowerCase();
  if (m.includes('esp')) return 'bi-cash';
  if (m.includes('créd') || m.includes('cred')) return 'bi-credit-card';
  if (m.includes('carte') || m.includes('chèque') || m.includes('cheque')) return 'bi-credit-card-2-front';
  return 'bi-phone'; // Wave, Orange Money, MTN MoMo…
}

/**
 * Tableau de bord — données réelles (ventes, encaissements, créances,
 * dépenses, caisses). Vue complète pour `consulter_rapports` ; vue
 * limitée (ses ventes) pour le vendeur/caissier.
 */
export default function DashboardPage() {
  const router = useRouter();
  const { user, entreprise, loading } = useAuthUser();
  const { kiosques, kiosqueId, changerKiosque } = useKiosque();
  const [tb, setTb] = useState<TB | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    if (user?.type === 'adminsuper') {
      router.replace('/dashboard/admin/entreprises');
    }
  }, [user, router]);

  useEffect(() => {
    setChargement(true);
    const params = kiosqueId ? `?kiosqueId=${kiosqueId}` : '';
    fetch(`/api/rapports/tableau-bord${params}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setTb(data))
      .catch(() => {})
      .finally(() => setChargement(false));
  }, [kiosqueId]);

  if (loading || (chargement && !tb)) {
    return <div className="text-center p-5"><div className="spinner-border text-primary"></div></div>;
  }

  const devise = entreprise?.devise || 'FCFA';
  const j = tb?.jour;
  const serie = (tb?.serie7j || []).map((s) => ({ ...s, jour: s.date.slice(8) + '/' + s.date.slice(5, 7) }));

  const carte = (icone: string, label: string, valeur: React.ReactNode, sous?: React.ReactNode, accent?: string) => (
    <div className="col-sm-6 col-xl-3">
      <div className="card carte-stat h-100">
        <div className="card-body d-flex align-items-center gap-3">
          <span className="stat-icone" style={accent ? { background: accent } : undefined}>
            <i className={`bi ${icone}`}></i>
          </span>
          <div>
            <div className="text-muted small">{label}</div>
            <div className="fs-4 fw-bold">{valeur}</div>
            {sous && <small className="text-muted" style={{ fontSize: '0.72rem' }}>{sous}</small>}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="titre-page mb-1">Tableau de bord</h3>
          <p className="text-muted mb-0">
            Bienvenue {user?.prenom} {user?.nom}
            {user?.type ? ` — ${ROLE_LABELS[user.type] || user.type}` : ''}
          </p>
        </div>
        {kiosques.length > 1 && (
          <select
            className="form-select form-select-sm w-auto"
            value={kiosqueId || ''}
            onChange={(e) => changerKiosque(e.target.value)}
          >
            <option value="">Tous les kiosques</option>
            {kiosques.map((k) => (
              <option key={k._id} value={k._id}>{k.designation}</option>
            ))}
          </select>
        )}
      </div>

      {/* KPIs du jour — données réelles */}
      <div className="row g-3 mb-4">
        {carte('bi-graph-up-arrow', "Chiffre d'affaires du jour",
          <>{fmtMontant(j?.ca || 0)} <small className="fs-6 fw-normal">{devise}</small></>,
          `${j?.nbVentes || 0} vente(s)`)}
        {carte('bi-cash-coin', 'Encaissements du jour',
          <>{fmtMontant(j?.encaissements || 0)} <small className="fs-6 fw-normal">{devise}</small></>,
          j?.remboursements ? `dont ${fmtMontant(j.remboursements)} F de remboursements` : undefined)}
        {tb?.controleur && carte('bi-hourglass-split', 'Créances restantes',
          <>{fmtMontant(j?.creancesDu || 0)} <small className="fs-6 fw-normal">{devise}</small></>,
          `${j?.nbCreances || 0} créance(s) en cours`)}
        {tb?.controleur && carte('bi-wallet2', 'Dépenses du jour',
          <>{fmtMontant(j?.depenses || 0)} <small className="fs-6 fw-normal">{devise}</small></>,
          `${j?.nbDepenses || 0} dépense(s)`)}
      </div>

      {/* Alertes exploitation */}
      {tb?.controleur && ((j?.remisesEnAttente || 0) > 0 || (j?.creancesDu || 0) > 0) && (
        <div className="row g-2 mb-4">
          {(j?.remisesEnAttente || 0) > 0 && (
            <div className="col-md-6">
              <div className="alert alert-warning d-flex align-items-center py-2 mb-0">
                <i className="bi bi-exclamation-triangle me-2"></i>
                <div>
                  <strong>{j?.remisesEnAttente} remise(s) en attente</strong> —{' '}
                  {fmtMontant(j?.montantRemisesEnAttente || 0)} F à confirmer{' '}
                  <Link href="/dashboard/caisse" className="alert-link">Gérer les caisses</Link>
                </div>
              </div>
            </div>
          )}
          {(j?.creancesDu || 0) > 0 && (
            <div className="col-md-6">
              <div className="alert alert-danger d-flex align-items-center py-2 mb-0">
                <i className="bi bi-credit-card me-2"></i>
                <div>
                  <strong>{fmtMontant(j?.creancesDu || 0)} F de créances</strong> en cours{' '}
                  <Link href="/dashboard/credits" className="alert-link">Suivre les crédits</Link>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Encaissements par mode de paiement — aujourd'hui */}
      {(tb?.parMode?.length || 0) > 0 && (() => {
        const totalModes = tb!.parMode.reduce((s, m) => s + m.montant, 0);
        return (
          <div className="card mb-4">
            <div className="card-header bg-white fw-semibold">
              <i className="bi bi-wallet2 me-2"></i>Encaissements par mode de paiement — aujourd&apos;hui
            </div>
            <div className="card-body">
              <div className="progress mb-3" style={{ height: 22 }}>
                {tb!.parMode.map((m, i) => (
                  <div key={m.mode} className="progress-bar" role="progressbar"
                    style={{ width: `${totalModes ? (m.montant / totalModes) * 100 : 0}%`, background: COULEURS_MODE[i % COULEURS_MODE.length] }}
                    title={`${m.mode} : ${fmtMontant(m.montant)} F`} />
                ))}
              </div>
              <div className="d-flex flex-wrap gap-3">
                {tb!.parMode.map((m, i) => (
                  <div key={m.mode} className="d-flex align-items-center gap-2 border rounded-3 px-3 py-2">
                    <span className="d-inline-flex align-items-center justify-content-center rounded-2 text-white"
                      style={{ width: 34, height: 34, background: COULEURS_MODE[i % COULEURS_MODE.length] }}>
                      <i className={`bi ${iconeMode(m.mode)}`}></i>
                    </span>
                    <div>
                      <div className="small text-muted">{m.mode} · {m.nb} encaissement{m.nb > 1 ? 's' : ''}</div>
                      <div className="fw-bold">{fmtMontant(m.montant)} F
                        <span className="fw-normal small text-muted"> ({totalModes ? Math.round((m.montant / totalModes) * 100) : 0}%)</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      <div className="row g-3 mb-4">
        {/* Courbe CA 7 jours */}
        <div className="col-lg-7">
          <div className="card h-100">
            <div className="card-header bg-white fw-semibold">
              <i className="bi bi-bar-chart me-2"></i>Chiffre d&apos;affaires — 7 derniers jours
            </div>
            <div className="card-body" style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="jour" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                  <Tooltip
                    formatter={(value: any, name: any) =>
                      name === 'ca' ? [`${fmtMontant(value)} ${devise}`, "Chiffre d'affaires"] : [value, 'Ventes']
                    }
                  />
                  <Bar dataKey="ca" fill="var(--ek-green)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Top produits du jour */}
        <div className="col-lg-5">
          <div className="card h-100">
            <div className="card-header bg-white fw-semibold">
              <i className="bi bi-trophy me-2"></i>Top produits — aujourd&apos;hui
            </div>
            <div className="card-body p-0">
              {(tb?.topProduits?.length || 0) === 0 && (
                <div className="text-center text-muted py-4 small">Aucune vente aujourd&apos;hui</div>
              )}
              <ul className="list-group list-group-flush">
                {tb?.topProduits.map((p, i) => (
                  <li key={i} className="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                      <span className="badge bg-light text-dark me-2">#{i + 1}</span>
                      {p.designation}
                    </div>
                    <div className="text-end">
                      <span className="badge bg-success-subtle text-success me-2">×{p.quantite}</span>
                      <span className="small fw-semibold">{fmtMontant(p.montant)} F</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Comparaison des kiosques — aujourd'hui (contrôleurs) */}
      {tb?.controleur && (tb.parKiosque?.length || 0) > 0 && (
        <div className="card mb-4">
          <div className="card-header bg-white d-flex justify-content-between align-items-center">
            <span className="fw-semibold"><i className="bi bi-shop me-2"></i>Performance des kiosques — aujourd&apos;hui</span>
            <Link href="/dashboard/rapports" className="btn btn-sm btn-outline-primary">
              <i className="bi bi-graph-up me-1"></i>Rapports détaillés
            </Link>
          </div>
          <div className="table-responsive">
            <table className="table table-hover table-sm mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th>Kiosque</th>
                  <th className="text-end">CA</th>
                  <th className="text-end">Ventes</th>
                  <th className="text-end">Dépenses</th>
                  <th className="text-end">Net encaissé</th>
                </tr>
              </thead>
              <tbody>
                {tb.parKiosque.map((k) => (
                  <tr key={k.kiosqueId}>
                    <td className="fw-semibold">{k.designation}</td>
                    <td className="text-end">{fmtMontant(k.ca)} F</td>
                    <td className="text-end">{k.nbVentes}</td>
                    <td className="text-end text-danger">{k.depenses ? `${fmtMontant(k.depenses)} F` : '—'}</td>
                    <td className="text-end fw-bold">{fmtMontant(k.ca - k.depenses)} F</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Accès rapides */}
      <div className="card">
        <div className="card-body">
          <h5 className="mb-3">Démarrage rapide</h5>
          <div className="d-flex flex-wrap gap-2">
            <Link href="/dashboard/ventes" className="btn btn-success">
              <i className="bi bi-cart3 me-2"></i>Enregistrer une vente
            </Link>
            <Link href="/dashboard/caisse" className="btn btn-outline-success">
              <i className="bi bi-cash-stack me-2"></i>Gestion des caisses
            </Link>
            {(user?.type === 'admin' || user?.type === 'gestionnaire') && (
              <>
                <Link href="/dashboard/kiosques" className="btn btn-outline-primary">
                  <i className="bi bi-shop me-2"></i>Mes kiosques
                </Link>
                <Link href="/dashboard/parametres/entreprise" className="btn btn-outline-secondary">
                  <i className="bi bi-gear me-2"></i>Paramètres
                </Link>
              </>
            )}
          </div>
          {kiosques.length === 0 && (
            <div className="alert alert-warning mt-3 mb-0">
              <i className="bi bi-exclamation-triangle me-2"></i>
              Aucun kiosque pour l&apos;instant — créez votre premier point de vente
              pour commencer à enregistrer des opérations.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
