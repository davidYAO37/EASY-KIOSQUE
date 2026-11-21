import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { Kiosque } from "@/models/kiosque";
import { Sequence } from "@/models/sequence";
import { kiosqueSchema } from "@/lib/validations";

/** Liste les kiosques de l'entreprise (restreinte aux kiosques affectés). */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  await db();
  const filtre: any = { entrepriseId: new Types.ObjectId(user!.entrepriseId!) };
  if (user!.kiosqueIds?.length) {
    filtre._id = { $in: user!.kiosqueIds.map((id) => new Types.ObjectId(id)) };
  }
  if (req.nextUrl.searchParams.get("actifs") === "1") {
    filtre.statut = "actif";
  }

  const kiosques = await Kiosque.find(filtre).sort({ designation: 1 }).lean();
  return NextResponse.json({
    kiosques: kiosques.map((k) => ({ ...k, _id: k._id.toString() })),
  });
}

/** Crée un kiosque dans l'entreprise du compte connecté. */
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req, ["admin", "gestionnaire"], {
    actions: ["gerer_kiosques"],
  });
  if (error) return error;

  const parsed = kiosqueSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  const entrepriseId = new Types.ObjectId(user!.entrepriseId!);

  // Limite du plan d'abonnement (ex. ESSAI = 1 kiosque)
  const { verifierLimitePlan } = await import("@/lib/abonnement");
  const limite = await verifierLimitePlan(user!.entrepriseId!, "kiosque");
  if (limite) {
    return NextResponse.json({ message: limite, code: "LIMITE_PLAN" }, { status: 403 });
  }

  let code = (parsed.data.code || "").toUpperCase().trim();
  if (!code) {
    // Code auto : K001, K002... — boucle jusqu'à un code libre
    // (un code saisi manuellement peut devancer le compteur)
    for (let i = 0; i < 50 && !code; i++) {
      const seq = await Sequence.findOneAndUpdate(
        { entrepriseId, kiosqueId: null, cle: "code_kiosque" },
        { $inc: { valeur: 1 } },
        { upsert: true, new: true }
      ).lean();
      const candidat = `K${String(seq?.valeur || 1).padStart(3, "0")}`;
      const pris = await Kiosque.exists({ entrepriseId, code: candidat });
      if (!pris) code = candidat;
    }
    if (!code) {
      return NextResponse.json(
        { message: "Impossible de générer un code kiosque unique" },
        { status: 500 }
      );
    }
  }

  const doublon = await Kiosque.findOne({ entrepriseId, code }).select("_id").lean();
  if (doublon) {
    return NextResponse.json(
      { message: `Le code kiosque « ${code} » existe déjà.` },
      { status: 409 }
    );
  }

  const kiosque = await Kiosque.create({
    entrepriseId,
    code,
    designation: parsed.data.designation,
    adresse: parsed.data.adresse || undefined,
    telephone: parsed.data.telephone || undefined,
    responsable: parsed.data.responsable || undefined,
    statut: parsed.data.statut || "actif",
  });

  return NextResponse.json(
    { kiosque: { ...kiosque.toObject(), _id: kiosque._id.toString() } },
    { status: 201 }
  );
}
