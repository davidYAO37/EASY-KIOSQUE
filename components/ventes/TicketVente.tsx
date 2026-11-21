"use client";

import { forwardRef } from "react";
import { fmtMontant } from "@/lib/format";
import type { TicketVente } from "@/types/ventes";

/**
 * Ticket de caisse imprimable (format ~80 mm).
 * Rendu dans une modale ; l'impression passe par useReactToPrint.
 */
const TicketVente = forwardRef<HTMLDivElement, { ticket: TicketVente }>(
  function TicketVente({ ticket }, ref) {
    const { entreprise, kiosque, vente } = ticket;
    const a4 = ticket.impression?.format === "a4";
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
          <div style={{ fontWeight: 700 }}>TICKET DE VENTE</div>
          <div>N° {vente.numeroVente}</div>
          <div>
            {vente.dateVente ? new Date(vente.dateVente).toLocaleString("fr-FR") : ""}
          </div>
          <div>Vendeur : {vente.vendeurNom || "—"}</div>
          {vente.clientNom && <div>Client : {vente.clientNom}</div>}
          <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {(vente.lignes || []).map((l, i) => (
              <tr key={i}>
                <td style={{ padding: "2px 0" }}>
                  {l.designation}
                  <br />
                  <small>
                    {l.quantite} × {fmtMontant(l.prixUnitaire)}
                  </small>
                </td>
                <td style={{ textAlign: "right", verticalAlign: "top", padding: "2px 0" }}>
                  {fmtMontant(l.montant)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
        <table style={{ width: "100%" }}>
          <tbody>
            <tr>
              <td style={{ fontWeight: 700 }}>TOTAL</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>
                {fmtMontant(vente.montantTotal)} FCFA
              </td>
            </tr>
            {(vente.paiements || []).map((p, i) => (
              <tr key={i}>
                <td>{p.mode}</td>
                <td style={{ textAlign: "right" }}>{fmtMontant(p.montant)} F</td>
              </tr>
            ))}
            {(vente.monnaieRendue || 0) > 0 && (
              <tr>
                <td>Monnaie rendue</td>
                <td style={{ textAlign: "right" }}>{fmtMontant(vente.monnaieRendue)} F</td>
              </tr>
            )}
            {vente.resteAPayer > 0 && (
              <tr>
                <td style={{ fontWeight: 700 }}>Reste à payer</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>
                  {fmtMontant(vente.resteAPayer)} F
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
        <div className="text-center">
          {vente.statutVente === "annulee" && (
            <div style={{ fontWeight: 700 }}>*** VENTE ANNULÉE ***</div>
          )}
          <div>Merci de votre visite !</div>
          <div style={{ fontSize: 10 }}>EASY-KIOSQUE</div>
        </div>
      </div>
    );
  }
);

export default TicketVente;
