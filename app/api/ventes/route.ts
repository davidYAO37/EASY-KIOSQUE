import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { hasActionPermission } from "@/lib/permissions";
import { venteCreateSchema } from "@/lib/validations";
import type { z } from "zod";
import { enregistrerVente, listerVentes } from "@/services/ventes.service";

/**
 * GET : liste des ventes. La portée est appliquée côté serveur :
 * propriétaire/gestionnaire/comptable → tout ; responsable → ses kiosques ;
 * vendeur/caissier → ses propres ventes uniquement.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  await db();
  const sp = req.nextUrl.searchParams;
  const liste = await listerVentes(user!, {
    q: sp.get("q") || undefined,
    kiosqueId: sp.get("kiosqueId") || undefined,
    vendeurId: sp.get("vendeurId") || undefined,
    clientId: sp.get("clientId") || undefined,
    statut: sp.get("statut") || undefined,
    typeVente: sp.get("typeVente") || undefined,
    du: sp.get("du") || undefined,
    au: sp.get("au") || undefined,
    page: Number(sp.get("page")) || 1,
    limit: Number(sp.get("limit")) || 20,
  });
  return NextResponse.json(liste);
}

/**
 * POST : validation d'une vente.
 * - Action `enregistrer_vente` requise (vendeur inclus, c'est son rôle).
 * - `vente_credit` requise en plus si la vente est à crédit.
 * - Le schéma strict refuse tout prix/remise envoyé par le navigateur :
 *   le serveur recalcule au tarif officiel.
 */
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["enregistrer_vente"],
  });
  if (error) return error;

  const parsed = venteCreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        message:
          "Données invalides — les prix et remises ne sont pas acceptés depuis le navigateur.",
        erreurs: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  if (
    parsed.data.typeVente === "credit" &&
    !hasActionPermission(user!, "vente_credit")
  ) {
    return NextResponse.json(
      { message: "Vous n'êtes pas autorisé à enregistrer une vente à crédit." },
      { status: 403 }
    );
  }

  await db();
  try {
    const { vente, dupliquee } = await enregistrerVente(user!, parsed.data);
    return NextResponse.json({ vente, dupliquee }, { status: 201 });
  } catch (e: any) {
    // Vente émise hors-ligne puis rejetée par le serveur : le vendeur a
    // encaissé "invisible". Elle est tracée au journal + notifiée au
    // propriétaire — la file locale ne peut pas la faire disparaître.
    if (parsed.data.horsLigne) {
      await tracerRejetHorsLigne(user!, parsed.data, e).catch(() => {});
    }
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}

/** Journal + notification propriétaire pour une vente hors-ligne refusée. */
async function tracerRejetHorsLigne(
  user: NonNullable<Awaited<ReturnType<typeof requireAuth>>["user"]>,
  data: z.infer<typeof venteCreateSchema>,
  e: any
) {
  const { Notification } = await import("@/models/notification");
  const { JournalActivite } = await import("@/models/journalActivite");
  const { Kiosque } = await import("@/models/kiosque");
  const vendeurNom = [user.prenom, user.nom].filter(Boolean).join(" ");
  const kiosque = await Kiosque.findOne({
    _id: data.kiosqueId,
    entrepriseId: user.entrepriseId,
  }).lean();
  const montantDeclare = (data.paiements || []).reduce(
    (s: number, p) => s + (p.montant || 0),
    0
  );
  const resume =
    `${vendeurNom} · ${kiosque?.designation || data.kiosqueId} · ` +
    `${data.lignes.length} article(s) · ${montantDeclare} F déclarés` +
    (data.miseEnFileLe ? ` · émise le ${data.miseEnFileLe}` : "");
  const details = {
    motif: e?.message || "Rejet",
    code: e?.code || "ERREUR",
    lignes: data.lignes,
    montantDeclare,
    typeVente: data.typeVente,
    miseEnFileLe: data.miseEnFileLe || null,
    idempotencyKey: data.idempotencyKey,
  };
  await JournalActivite.create({
    entrepriseId: user.entrepriseId,
    kiosqueId: kiosque?._id || null,
    userId: user._id,
    action: "vente_hors_ligne_rejetee",
    module: "ventes",
    details,
  });
  await Notification.create({
    entrepriseId: user.entrepriseId,
    kiosqueId: kiosque?._id || null,
    type: "vente",
    titre: "Vente hors-ligne REFUSÉE",
    message: `${e?.message || "Vente rejetée"} — ${resume}`,
    montant: montantDeclare,
    vendeurId: user._id,
    vendeurNom,
  });
}
