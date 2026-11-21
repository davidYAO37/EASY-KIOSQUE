import { Types, type ClientSession } from "mongoose";
import { SessionCaisse, type ISessionCaisse } from "@/models/sessionCaisse";
import { Remise, type IRemise } from "@/models/remise";
import { MouvementCaisse } from "@/models/mouvementCaisse";
import { Kiosque } from "@/models/kiosque";
import { Notification } from "@/models/notification";
import { JournalActivite } from "@/models/journalActivite";
import { nextNumero } from "@/lib/numero";
import { exigerKiosque, kiosqueAccessible, kiosquesAutorises } from "@/lib/tenant";
import { avecTransaction } from "@/lib/transaction";
import type { CurrentUser } from "@/lib/auth";
import type {
  MouvementCaisseDTO,
  PointCaisseDTO,
  RemiseDTO,
  SessionCaisseDTO,
} from "@/types/caisses";

/**
 * Service métier caisses — sessions, points journaliers, clôtures, remises.
 *
 * RÈGLES (cahier des charges renforcé) :
 * - Une seule session non clôturée par kiosque.
 * - Le vendeur OUVRE sa caisse et DÉCLARE son point (montant compté) ; le
 *   solde théorique n'est jamais exposé au vendeur (il compte à l'aveugle,
 *   l'écart est calculé côté serveur et signalé au propriétaire).
 * - La clôture effective est réservée aux profils `cloturer_caisse`.
 * - Remise d'argent : déclarée par l'opérateur (`declarer_remise`),
 *   confirmée ou annulée par le propriétaire (`confirmer_remise`). La
 *   sortie de caisse n'est comptabilisée qu'à la CONFIRMATION.
 * - Aucune suppression physique : sessions et remises sont conservées,
 *   toute correction est tracée (motif, auteur, date).
 */

function oid(id: string | Types.ObjectId) {
  return new Types.ObjectId(String(id));
}

function nomComplet(u: { nom?: string; prenom?: string }) {
  return [u.prenom, u.nom].filter(Boolean).join(" ").trim() || "Utilisateur";
}

function errHttp(message: string, status = 400, code?: string): never {
  const e: any = new Error(message);
  e.status = status;
  if (code) e.code = code;
  throw e;
}

// --------------------------- Helpers internes ---------------------------

/** Session non clôturée d'un kiosque (ouverte ou en cours de clôture). */
export async function sessionActive(
  entrepriseId: Types.ObjectId | string,
  kiosqueId: Types.ObjectId | string,
  session?: ClientSession
) {
  return SessionCaisse.findOne({
    entrepriseId: oid(entrepriseId),
    kiosqueId: oid(kiosqueId),
    statut: { $in: ["ouverte", "en_cloture"] },
  })
    .session(session || null)
    .lean();
}

/** Solde théorique = somme des entrées − somme des sorties de la session. */
async function soldesSession(sessionId: Types.ObjectId | string) {
  const agg = await MouvementCaisse.aggregate([
    { $match: { sessionCaisseId: oid(sessionId) } },
    {
      $group: {
        _id: "$type",
        total: { $sum: "$montant" },
      },
    },
  ]);
  const entrees = agg.find((a) => a._id === "entree")?.total || 0;
  const sorties = agg.find((a) => a._id === "sortie")?.total || 0;
  return { totalEntrees: entrees, totalSorties: sorties, soldeTheorique: entrees - sorties };
}

/** Somme des remises encore `declaree` (argent remis, pas encore confirmé). */
async function remisesEnAttente(sessionId: Types.ObjectId | string, session?: ClientSession) {
  const agg = await Remise.aggregate([
    { $match: { sessionCaisseId: oid(sessionId), statut: "declaree" } },
    { $group: { _id: null, total: { $sum: "$montant" } } },
  ]).session(session || null);
  return agg[0]?.total || 0;
}

function pointVersDTO(p: ISessionCaisse["points"][number]): PointCaisseDTO {
  return {
    montantCompte: p.montantCompte,
    soldeTheorique: p.soldeTheorique,
    ecart: p.ecart,
    commentaire: p.commentaire,
    declareParNom: p.declareParNom,
    datePoint: p.datePoint?.toISOString?.() || String(p.datePoint),
    statut: p.statut,
    motifRejet: p.motifRejet,
    rejetePar: p.rejetePar,
  };
}

async function sessionVersDTO(
  s: ISessionCaisse & { _id: Types.ObjectId },
  kiosque?: { code?: string; designation?: string } | null,
  avecSoldes = true
): Promise<SessionCaisseDTO> {
  const pointEnAttente = s.points?.find((p) => p.statut === "en_attente") || null;
  const dto: SessionCaisseDTO = {
    _id: String(s._id),
    numero: s.numero,
    kiosqueId: String(s.kiosqueId),
    kiosqueCode: kiosque?.code,
    kiosqueNom: kiosque?.designation,
    statut: s.statut,
    fondDeCaisse: s.fondDeCaisse,
    ouverteParNom: s.ouverteParNom,
    dateOuverture: s.dateOuverture?.toISOString?.() || String(s.dateOuverture),
    nbPoints: s.points?.length || 0,
    pointEnAttente: avecSoldes && pointEnAttente ? pointVersDTO(pointEnAttente) : null,
    points: avecSoldes ? (s.points || []).map(pointVersDTO) : undefined,
    cloture: s.cloture?.dateCloture
      ? {
          clotureeParNom: s.cloture.clotureeParNom!,
          dateCloture: s.cloture.dateCloture.toISOString(),
          commentaire: s.cloture.commentaire,
          montantCompte: s.cloture.montantCompte ?? null,
          soldeTheorique: s.cloture.soldeTheorique!,
          ecart: s.cloture.ecart ?? null,
        }
      : null,
  };
  if (avecSoldes) {
    const soldes = await soldesSession(s._id);
    dto.totalEntrees = soldes.totalEntrees;
    dto.totalSorties = soldes.totalSorties;
    dto.soldeTheorique = soldes.soldeTheorique;
    if (s.statut !== "cloturee") {
      dto.remisesEnAttente = await remisesEnAttente(s._id);
    }
  }
  return dto;
}

// ------------------------------- Sessions -------------------------------

/**
 * Ouverture de caisse (`ouvrir_caisse`) : fond de caisse éventuel enregistré
 * comme mouvement d'entrée. Une seule session active par kiosque.
 */
export async function ouvrirCaisse(
  user: CurrentUser,
  data: { kiosqueId: string; fondDeCaisse: number }
): Promise<SessionCaisseDTO> {
  const eid = oid(user.entrepriseId!);
  const kiosque = await exigerKiosque(user, data.kiosqueId);
  if (kiosque.statut === "inactif") {
    errHttp("Ce kiosque est désactivé.", 400, "KIOSQUE_INACTIF");
  }
  const deja = await sessionActive(eid, kiosque._id);
  if (deja) {
    errHttp(
      `Une caisse est déjà ouverte sur ${kiosque.designation} (${deja.numero}).`,
      409,
      "CAISSE_DEJA_OUVERTE"
    );
  }

  const nom = nomComplet(user);
  let sessionId: Types.ObjectId | null = null;
  let numero = "";
  try {
    await avecTransaction(async (tx) => {
      numero = await nextNumero(eid, "caisse", `CAI-${kiosque.code}`, {
        kiosqueId: kiosque._id,
        session: tx,
      });
      const [sc] = await SessionCaisse.create(
        [
          {
            entrepriseId: eid,
            kiosqueId: kiosque._id,
            numero,
            statut: "ouverte",
            fondDeCaisse: data.fondDeCaisse,
            ouvertePar: oid(user._id),
            ouverteParNom: nom,
            dateOuverture: new Date(),
            points: [],
          },
        ],
        { session: tx }
      );
      sessionId = sc._id;
      if (data.fondDeCaisse > 0) {
        await MouvementCaisse.create(
          [
            {
              entrepriseId: eid,
              kiosqueId: kiosque._id,
              sessionCaisseId: sessionId,
              type: "entree",
              motif: "fond_caisse",
              montant: data.fondDeCaisse,
              modePaiement: "Espèces",
              userId: oid(user._id),
              userNom: nom,
              date: new Date(),
            },
          ],
          { session: tx }
        );
      }
    });
  } catch (e: any) {
    if (e?.code === 11000 || e?.errorResponse?.code === 11000) {
      errHttp(
        `Une caisse est déjà ouverte sur ${kiosque.designation}.`,
        409,
        "CAISSE_DEJA_OUVERTE"
      );
    }
    throw e;
  }

  await JournalActivite.create({
    entrepriseId: eid,
    kiosqueId: kiosque._id,
    userId: oid(user._id),
    action: "caisse_ouverte",
    module: "caisse",
    details: { numero, fondDeCaisse: data.fondDeCaisse },
  });
  await Notification.create({
    entrepriseId: eid,
    kiosqueId: kiosque._id,
    type: "caisse",
    titre: `Caisse ouverte — ${numero}`,
    message: `${kiosque.designation} · ${nom} — fond de caisse ${data.fondDeCaisse} FCFA`,
    montant: data.fondDeCaisse,
    vendeurId: oid(user._id),
    vendeurNom: nom,
  });

  const s = await SessionCaisse.findById(sessionId).lean();
  return sessionVersDTO(s as any, kiosque);
}

/** Caisse actuellement active d'un kiosque (+ soldes calculés). */
export async function caisseActuelle(
  user: CurrentUser,
  kiosqueId: string
): Promise<SessionCaisseDTO | null> {
  const eid = oid(user.entrepriseId!);
  const kiosque = await exigerKiosque(user, kiosqueId);
  const s = await sessionActive(eid, kiosque._id);
  if (!s) return null;
  return sessionVersDTO(s as any, kiosque);
}

/** Charge une session du tenant après contrôle d'accès au kiosque. */
async function chargerSession(user: CurrentUser, id: string) {
  if (!Types.ObjectId.isValid(id)) errHttp("Session introuvable.", 404);
  const s = await SessionCaisse.findOne({
    _id: oid(id),
    entrepriseId: oid(user.entrepriseId!),
  }).lean();
  if (!s || !kiosqueAccessible(user, String(s.kiosqueId))) {
    errHttp("Session introuvable.", 404);
  }
  return s!;
}

/**
 * Point journalier déclaré par l'opérateur (vendeur inclus) : il saisit le
 * montant RÉELLEMENT compté ; le serveur calcule le solde théorique et
 * l'écart. La session passe `en_cloture` en attente de validation.
 */
export async function declarerPoint(
  user: CurrentUser,
  sessionId: string,
  data: { montantCompte: number; commentaire?: string }
): Promise<SessionCaisseDTO> {
  const s = await chargerSession(user, sessionId);
  if (s.statut === "cloturee") {
    errHttp("Cette caisse est déjà clôturée.", 409, "DEJA_CLOTUREE");
  }
  if (s.statut === "en_cloture") {
    errHttp(
      "Un point est déjà déclaré et attend la validation du propriétaire.",
      409,
      "POINT_EN_ATTENTE"
    );
  }

  const { soldeTheorique } = await soldesSession(s._id);
  const ecart = data.montantCompte - soldeTheorique;
  const nom = nomComplet(user);
  const point = {
    montantCompte: data.montantCompte,
    soldeTheorique,
    ecart,
    commentaire: data.commentaire || undefined,
    declarePar: oid(user._id),
    declareParNom: nom,
    datePoint: new Date(),
    statut: "en_attente" as const,
  };
  await SessionCaisse.updateOne(
    { _id: s._id, statut: "ouverte" },
    { $set: { statut: "en_cloture" }, $push: { points: point } }
  );

  const kiosque = await Kiosque.findById(s.kiosqueId).lean();
  await Notification.create({
    entrepriseId: s.entrepriseId,
    kiosqueId: s.kiosqueId,
    type: "caisse",
    titre: `Point journalier déclaré — ${s.numero}`,
    message: `${kiosque?.designation || ""} · ${nom} — compté : ${data.montantCompte} FCFA, attendu : ${soldeTheorique} FCFA, écart : ${ecart >= 0 ? "+" : ""}${ecart} FCFA`,
    montant: ecart,
    vendeurId: oid(user._id),
    vendeurNom: nom,
  });
  await JournalActivite.create({
    entrepriseId: s.entrepriseId,
    kiosqueId: s.kiosqueId,
    userId: oid(user._id),
    action: "point_journalier",
    module: "caisse",
    details: {
      numero: s.numero,
      montantCompte: data.montantCompte,
      soldeTheorique,
      ecart,
    },
  });

  const maj = await SessionCaisse.findById(s._id).lean();
  return sessionVersDTO(maj as any, kiosque);
}

/**
 * Rejet du point déclaré (`cloturer_caisse`) : la session repasse `ouverte`,
 * la déclaration est conservée avec statut `rejete` (motif obligatoire).
 */
export async function rejeterPoint(
  user: CurrentUser,
  sessionId: string,
  commentaire?: string
): Promise<SessionCaisseDTO> {
  const s = await chargerSession(user, sessionId);
  if (s.statut !== "en_cloture") {
    errHttp("Aucun point en attente sur cette caisse.", 409, "PAS_DE_POINT");
  }
  const idx = s.points.findIndex((p) => p.statut === "en_attente");
  if (idx < 0) errHttp("Aucun point en attente sur cette caisse.", 409, "PAS_DE_POINT");

  const nom = nomComplet(user);
  await SessionCaisse.updateOne(
    { _id: s._id, statut: "en_cloture" },
    {
      $set: {
        statut: "ouverte",
        [`points.${idx}.statut`]: "rejete",
        [`points.${idx}.motifRejet`]: commentaire || "Rejeté par le propriétaire",
        [`points.${idx}.rejetePar`]: nom,
      },
    }
  );
  await JournalActivite.create({
    entrepriseId: s.entrepriseId,
    kiosqueId: s.kiosqueId,
    userId: oid(user._id),
    action: "point_rejete",
    module: "caisse",
    details: { numero: s.numero, motif: commentaire, point: pointVersDTO(s.points[idx]) },
  });

  const maj = await SessionCaisse.findById(s._id).lean();
  const kiosque = await Kiosque.findById(s.kiosqueId).lean();
  return sessionVersDTO(maj as any, kiosque);
}

/**
 * Clôture effective (`cloturer_caisse`) : fige le solde théorique final et
 * l'écart éventuel (point déclaré validé, ou clôture directe sans point).
 */
export async function cloturerCaisse(
  user: CurrentUser,
  sessionId: string,
  commentaire?: string
): Promise<SessionCaisseDTO> {
  const s = await chargerSession(user, sessionId);
  if (s.statut === "cloturee") {
    errHttp("Cette caisse est déjà clôturée.", 409, "DEJA_CLOTUREE");
  }

  const { soldeTheorique } = await soldesSession(s._id);
  const idxPoint = s.points.findIndex((p) => p.statut === "en_attente");
  const point = idxPoint >= 0 ? s.points[idxPoint] : null;
  const nom = nomComplet(user);

  const set: Record<string, any> = {
    statut: "cloturee",
    cloture: {
      clotureePar: oid(user._id),
      clotureeParNom: nom,
      dateCloture: new Date(),
      commentaire: commentaire || undefined,
      montantCompte: point ? point.montantCompte : null,
      soldeTheorique,
      ecart: point ? point.ecart : null,
    },
  };
  if (point) set[`points.${idxPoint}.statut`] = "valide";
  const r = await SessionCaisse.updateOne(
    { _id: s._id, statut: s.statut },
    { $set: set }
  );
  if (!r.modifiedCount) {
    errHttp("Cette caisse est déjà clôturée.", 409, "DEJA_CLOTUREE");
  }

  const kiosque = await Kiosque.findById(s.kiosqueId).lean();
  const ecart = point ? point.ecart : null;
  await Notification.create({
    entrepriseId: s.entrepriseId,
    kiosqueId: s.kiosqueId,
    type: "caisse",
    titre: `Caisse clôturée — ${s.numero}`,
    message: `${kiosque?.designation || ""} · clôturée par ${nom} — solde théorique : ${soldeTheorique} FCFA${ecart !== null ? `, écart : ${ecart >= 0 ? "+" : ""}${ecart} FCFA` : ""}`,
    montant: soldeTheorique,
    vendeurId: oid(user._id),
    vendeurNom: nom,
  });
  await JournalActivite.create({
    entrepriseId: s.entrepriseId,
    kiosqueId: s.kiosqueId,
    userId: oid(user._id),
    action: "caisse_cloturee",
    module: "caisse",
    details: {
      numero: s.numero,
      soldeTheorique,
      montantCompte: point?.montantCompte ?? null,
      ecart,
      clotureDirecte: !point,
    },
  });

  const maj = await SessionCaisse.findById(s._id).lean();
  return sessionVersDTO(maj as any, kiosque);
}

/** Détail d'une session (contrôle kiosque + soldes). */
export async function detailSession(
  user: CurrentUser,
  id: string
): Promise<SessionCaisseDTO> {
  const s = await chargerSession(user, id);
  const kiosque = await Kiosque.findById(s.kiosqueId).lean();
  return sessionVersDTO(s as any, kiosque);
}

/** Mouvements d'une session (entrées/sorties détaillées). */
export async function mouvementsSession(
  user: CurrentUser,
  sessionId: string
): Promise<MouvementCaisseDTO[]> {
  const s = await chargerSession(user, sessionId);
  const mouvements = await MouvementCaisse.find({ sessionCaisseId: s._id })
    .sort({ date: 1 })
    .lean();
  return mouvements.map((m) => ({
    _id: String(m._id),
    type: m.type,
    motif: m.motif,
    montant: m.montant,
    modePaiement: m.modePaiement,
    userNom: m.userNom,
    venteId: m.venteId ? String(m.venteId) : null,
    date: m.date?.toISOString?.() || String(m.date),
  }));
}

/** Historique des sessions (filtres kiosque/statut/période). */
export async function listerSessions(
  user: CurrentUser,
  f: { kiosqueId?: string; statut?: string; du?: string; au?: string; page?: number; limit?: number }
) {
  const eid = oid(user.entrepriseId!);
  const kiosques = await kiosquesAutorises(user);
  const filtre: any = { entrepriseId: eid, kiosqueId: { $in: kiosques } };
  if (f.kiosqueId && Types.ObjectId.isValid(f.kiosqueId)) {
    filtre.kiosqueId = oid(f.kiosqueId);
  }
  if (f.statut && ["ouverte", "en_cloture", "cloturee"].includes(f.statut)) {
    filtre.statut = f.statut;
  }
  if (f.du || f.au) {
    filtre.dateOuverture = {};
    if (f.du) filtre.dateOuverture.$gte = new Date(f.du);
    if (f.au) filtre.dateOuverture.$lte = new Date(`${f.au}T23:59:59.999Z`);
  }
  const page = Math.max(1, f.page || 1);
  const limit = Math.min(100, Math.max(1, f.limit || 20));
  const [total, sessions] = await Promise.all([
    SessionCaisse.countDocuments(filtre),
    SessionCaisse.find(filtre)
      .sort({ dateOuverture: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);
  const kiosquesMap = new Map(
    (await Kiosque.find({ entrepriseId: eid }).select("code designation").lean()).map(
      (k) => [String(k._id), k]
    )
  );
  const items = await Promise.all(
    sessions.map((s) => sessionVersDTO(s as any, kiosquesMap.get(String(s.kiosqueId)), false))
  );
  // Soldes des sessions affichées (clôturées : cloture.soldeTheorique déjà figé)
  for (let i = 0; i < items.length; i++) {
    const s = sessions[i];
    if (s.statut === "cloturee") {
      items[i].soldeTheorique = s.cloture?.soldeTheorique;
    } else {
      const soldes = await soldesSession(s._id);
      items[i].soldeTheorique = soldes.soldeTheorique;
      items[i].totalEntrees = soldes.totalEntrees;
      items[i].totalSorties = soldes.totalSorties;
    }
  }
  return { items, total, page, pages: Math.ceil(total / limit) };
}

// -------------------------------- Remises -------------------------------

function remiseVersDTO(r: IRemise & { _id: Types.ObjectId }, kiosqueNom?: string): RemiseDTO {
  return {
    _id: String(r._id),
    numero: r.numero,
    kiosqueId: String(r.kiosqueId),
    kiosqueNom,
    montant: r.montant,
    note: r.note,
    statut: r.statut,
    declareeParNom: r.declareeParNom,
    dateDeclaration: r.dateDeclaration?.toISOString?.() || String(r.dateDeclaration),
    confirmeeParNom: r.confirmeeParNom,
    dateConfirmation: r.dateConfirmation?.toISOString?.(),
    annuleeParNom: r.annuleeParNom,
    motifAnnulation: r.motifAnnulation,
  };
}

/**
 * Déclaration de remise (`declarer_remise`) — vendeur inclus.
 * Le montant ne peut excéder le disponible de caisse (solde théorique
 * moins les remises déjà déclarées en attente de confirmation).
 */
export async function declarerRemise(
  user: CurrentUser,
  data: { kiosqueId: string; montant: number; note?: string; idempotencyKey: string }
): Promise<{ remise: RemiseDTO; dupliquee: boolean }> {
  const eid = oid(user.entrepriseId!);
  const existante = await Remise.findOne({
    entrepriseId: eid,
    idempotencyKey: data.idempotencyKey,
  }).lean();
  if (existante) {
    const k = await Kiosque.findById(existante.kiosqueId).lean();
    return { remise: remiseVersDTO(existante as any, k?.designation), dupliquee: true };
  }

  const kiosque = await exigerKiosque(user, data.kiosqueId);
  const s = await sessionActive(eid, kiosque._id);
  if (!s) {
    errHttp(
      "Aucune caisse ouverte sur ce kiosque — ouvrez la caisse avant de déclarer une remise.",
      400,
      "CAISSE_FERMEE"
    );
  }
  const { soldeTheorique } = await soldesSession(s._id);
  const enAttente = await remisesEnAttente(s._id);
  const disponible = soldeTheorique - enAttente;
  if (data.montant > disponible) {
    errHttp(
      `Montant supérieur au disponible en caisse (${disponible} FCFA).`,
      400,
      "MONTANT_EXCESSIF"
    );
  }

  const nom = nomComplet(user);
  let remiseId: Types.ObjectId | null = null;
  let numero = "";
  try {
    await avecTransaction(async (tx) => {
      numero = await nextNumero(eid, "remise", `REM-${kiosque.code}`, {
        kiosqueId: kiosque._id,
        session: tx,
      });
      const [r] = await Remise.create(
        [
          {
            entrepriseId: eid,
            kiosqueId: kiosque._id,
            sessionCaisseId: s._id,
            numero,
            montant: data.montant,
            note: data.note || undefined,
            statut: "declaree",
            declareePar: oid(user._id),
            declareeParNom: nom,
            dateDeclaration: new Date(),
            idempotencyKey: data.idempotencyKey,
          },
        ],
        { session: tx }
      );
      remiseId = r._id;
    });
  } catch (e: any) {
    if (e?.code === 11000 || e?.errorResponse?.code === 11000) {
      const deja = await Remise.findOne({
        entrepriseId: eid,
        idempotencyKey: data.idempotencyKey,
      }).lean();
      if (deja) {
        return { remise: remiseVersDTO(deja as any, kiosque.designation), dupliquee: true };
      }
    }
    throw e;
  }

  await Notification.create({
    entrepriseId: eid,
    kiosqueId: kiosque._id,
    type: "caisse",
    titre: `Remise déclarée — ${numero}`,
    message: `${kiosque.designation} · ${nom} déclare une remise de ${data.montant} FCFA — en attente de confirmation`,
    montant: data.montant,
    vendeurId: oid(user._id),
    vendeurNom: nom,
  });
  await JournalActivite.create({
    entrepriseId: eid,
    kiosqueId: kiosque._id,
    userId: oid(user._id),
    action: "remise_declaree",
    module: "caisse",
    details: { numero, montant: data.montant },
  });

  const r = await Remise.findById(remiseId).lean();
  return { remise: remiseVersDTO(r as any, kiosque.designation), dupliquee: false };
}

/**
 * Confirmation de remise (`confirmer_remise`) : la sortie de caisse n'est
 * comptabilisée qu'ici — transaction remise + mouvement de sortie.
 */
export async function confirmerRemise(user: CurrentUser, id: string): Promise<RemiseDTO> {
  if (!Types.ObjectId.isValid(id)) errHttp("Remise introuvable.", 404);
  const eid = oid(user.entrepriseId!);
  const r = await Remise.findOne({ _id: oid(id), entrepriseId: eid }).lean();
  if (!r || !kiosqueAccessible(user, String(r.kiosqueId))) {
    errHttp("Remise introuvable.", 404);
  }
  if (r!.statut !== "declaree") {
    errHttp("Cette remise n'est plus en attente de confirmation.", 409, "DEJA_TRAITEE");
  }

  const nom = nomComplet(user);
  await avecTransaction(async (tx) => {
      const maj = await Remise.updateOne(
        { _id: r!._id, statut: "declaree" },
        {
          $set: {
            statut: "confirmee",
            confirmeePar: oid(user._id),
            confirmeeParNom: nom,
            dateConfirmation: new Date(),
          },
        },
        { session: tx }
      );
      if (!maj.modifiedCount) {
        errHttp("Cette remise n'est plus en attente de confirmation.", 409, "DEJA_TRAITEE");
      }
      await MouvementCaisse.create(
        [
          {
            entrepriseId: eid,
            kiosqueId: r!.kiosqueId,
            sessionCaisseId: r!.sessionCaisseId || null,
            type: "sortie",
            motif: "remise",
            montant: r!.montant,
            modePaiement: "Espèces",
            userId: oid(user._id),
            userNom: nom,
            date: new Date(),
          },
        ],
        { session: tx }
      );
  });

  const kiosque = await Kiosque.findById(r!.kiosqueId).lean();
  await Notification.create({
    entrepriseId: eid,
    kiosqueId: r!.kiosqueId,
    type: "caisse",
    titre: `Remise confirmée — ${r!.numero}`,
    message: `${kiosque?.designation || ""} · ${r!.montant} FCFA remis par ${r!.declareeParNom}, confirmé par ${nom}`,
    montant: r!.montant,
    vendeurId: r!.declareePar,
    vendeurNom: r!.declareeParNom,
  });
  await JournalActivite.create({
    entrepriseId: eid,
    kiosqueId: r!.kiosqueId,
    userId: oid(user._id),
    action: "remise_confirmee",
    module: "caisse",
    details: { numero: r!.numero, montant: r!.montant, declareePar: r!.declareeParNom },
  });

  const maj = await Remise.findById(r!._id).lean();
  return remiseVersDTO(maj as any, kiosque?.designation);
}

/**
 * Annulation d'une remise déclarée (`confirmer_remise`) : motif obligatoire,
 * remise conservée, aucune sortie comptabilisée.
 */
export async function annulerRemise(
  user: CurrentUser,
  id: string,
  motif: string
): Promise<RemiseDTO> {
  if (!Types.ObjectId.isValid(id)) errHttp("Remise introuvable.", 404);
  const eid = oid(user.entrepriseId!);
  const r = await Remise.findOne({ _id: oid(id), entrepriseId: eid }).lean();
  if (!r || !kiosqueAccessible(user, String(r.kiosqueId))) {
    errHttp("Remise introuvable.", 404);
  }
  if (r!.statut !== "declaree") {
    errHttp("Seule une remise en attente peut être annulée.", 409, "DEJA_TRAITEE");
  }
  const nom = nomComplet(user);
  const maj = await Remise.updateOne(
    { _id: r!._id, statut: "declaree" },
    {
      $set: {
        statut: "annulee",
        annuleePar: oid(user._id),
        annuleeParNom: nom,
        dateAnnulation: new Date(),
        motifAnnulation: motif,
      },
    }
  );
  if (!maj.modifiedCount) {
    errHttp("Seule une remise en attente peut être annulée.", 409, "DEJA_TRAITEE");
  }

  const kiosque = await Kiosque.findById(r!.kiosqueId).lean();
  await Notification.create({
    entrepriseId: eid,
    kiosqueId: r!.kiosqueId,
    type: "caisse",
    titre: `Remise annulée — ${r!.numero}`,
    message: `${kiosque?.designation || ""} · remise de ${r!.montant} FCFA (${r!.declareeParNom}) annulée par ${nom} — motif : ${motif}`,
    montant: r!.montant,
    vendeurId: r!.declareePar,
    vendeurNom: r!.declareeParNom,
  });
  await JournalActivite.create({
    entrepriseId: eid,
    kiosqueId: r!.kiosqueId,
    userId: oid(user._id),
    action: "remise_annulee",
    module: "caisse",
    details: { numero: r!.numero, montant: r!.montant, motif },
  });

  const majDoc = await Remise.findById(r!._id).lean();
  return remiseVersDTO(majDoc as any, kiosque?.designation);
}

/**
 * Liste des remises — gestionnaires : tout le périmètre kiosque autorisé ;
 * opérateurs (vendeur) : uniquement leurs propres déclarations.
 */
export async function listerRemises(
  user: CurrentUser,
  f: {
    kiosqueId?: string;
    statut?: string;
    du?: string;
    au?: string;
    propresSeulement?: boolean;
    page?: number;
    limit?: number;
  }
) {
  const eid = oid(user.entrepriseId!);
  const kiosques = await kiosquesAutorises(user);
  const filtre: any = { entrepriseId: eid, kiosqueId: { $in: kiosques } };
  if (f.propresSeulement) filtre.declareePar = oid(user._id);
  if (f.kiosqueId && Types.ObjectId.isValid(f.kiosqueId)) {
    filtre.kiosqueId = oid(f.kiosqueId);
  }
  if (f.statut && ["declaree", "confirmee", "annulee"].includes(f.statut)) {
    filtre.statut = f.statut;
  }
  if (f.du || f.au) {
    filtre.dateDeclaration = {};
    if (f.du) filtre.dateDeclaration.$gte = new Date(f.du);
    if (f.au) filtre.dateDeclaration.$lte = new Date(`${f.au}T23:59:59.999Z`);
  }
  const page = Math.max(1, f.page || 1);
  const limit = Math.min(100, Math.max(1, f.limit || 30));
  const [total, docs] = await Promise.all([
    Remise.countDocuments(filtre),
    Remise.find(filtre)
      .sort({ dateDeclaration: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);
  const kiosquesMap = new Map(
    (await Kiosque.find({ entrepriseId: eid }).select("designation").lean()).map((k) => [
      String(k._id),
      k.designation,
    ])
  );
  return {
    items: docs.map((d) => remiseVersDTO(d as any, kiosquesMap.get(String(d.kiosqueId)))),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}
