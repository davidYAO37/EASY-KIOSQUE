"use client";

import { forwardRef } from "react";
import { fmtMontant } from "@/lib/format";
import type { RecuRemboursement } from "@/types/credits";

/**
 * Reçu de remboursement imprimable.
 * `format` : "thermique80" (ticket 80 mm) ou "a4" (page complète) —
 * selon la préférence d'impression de l'entreprise.
 */
const RecuRemboursement = forwardRef<HTMLDivElement, { recu: RecuRemboursement }>(
  function RecuRemboursement({ recu }, ref) {
    const { entreprise, kiosque, remboursement: r, soldeRestantClient } = recu;
    const a4 = recu.impression?.format === "a4";
    return (
      <div
        ref={ref}
        style={{
          width: a4 ? "100%" : "76mm",
          maxWidth: a4 ? "190mm" : undefined,
          margin: "0 auto",
          padding: a4 ? "24px" : "8px",
          fontFamily: a4 ? "inherit" : "monospace",
          fontSize: a4 ? 14 : 12,
          color: "#000",
        }}
      >
        <div className="text-center">
          <div style={{ fontSize: a4 ? 20 : 15, fontWeight: 700 }}>{entreprise.nom}</div>
          <div>{kiosque.designation}{kiosque.code ? ` (${kiosque.code})` : ""}</div>
          {kiosque.adresse && <div>{kiosque.adresse}</div>}
          {entreprise.telephone && <div>Tél : {entreprise.telephone}</div>}
          <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
          <div style={{ fontWeight: 700 }}>REÇU DE REMBOURSEMENT</div>
          <div>N° {r.numero}</div>
          <div>{r.datePaiement ? new Date(r.datePaiement).toLocaleString("fr-FR") : ""}</div>
          <div>Reçu par : {r.recuParNom || "—"}</div>
          <div>Client : {r.clientNom || "—"}</div>
          <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #000" }}>
              <th style={{ textAlign: "left", fontWeight: 700 }}>Vente</th>
              <th style={{ textAlign: "right", fontWeight: 700 }}>Versé</th>
            </tr>
          </thead>
          <tbody>
            {r.allocations.map((a, i) => (
              <tr key={i}>
                <td style={{ padding: "2px 0" }}>{a.numeroVente}</td>
                <td style={{ textAlign: "right" }}>{fmtMontant(a.montant)} F</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
        <table style={{ width: "100%" }}>
          <tbody>
            <tr>
              <td>Mode de paiement</td>
              <td style={{ textAlign: "right" }}>{r.mode}</td>
            </tr>
            {r.reference && (
              <tr>
                <td>Référence</td>
                <td style={{ textAlign: "right" }}>{r.reference}</td>
              </tr>
            )}
            <tr>
              <td style={{ fontWeight: 700 }}>TOTAL VERSÉ</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>
                {fmtMontant(r.montantTotal)} FCFA
              </td>
            </tr>
            <tr>
              <td>Solde restant du client</td>
              <td style={{ textAlign: "right" }}>{fmtMontant(soldeRestantClient)} F</td>
            </tr>
          </tbody>
        </table>

        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
        <div className="text-center">
          <div>Merci !</div>
          <div style={{ fontSize: a4 ? 11 : 10 }}>EASY-KIOSQUE</div>
        </div>
      </div>
    );
  }
);

export default RecuRemboursement;
