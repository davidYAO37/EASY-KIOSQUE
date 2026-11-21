import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { JournalActivite } from "@/models/journalActivite";
import { Types } from "mongoose";

/**
 * Journal d'activité de l'entreprise — traçabilité « qui a fait quoi,
 * quand » (annulations, modifications tarifaires, clôtures, remises...).
 * Réservé aux profils de contrôle : jamais au vendeur/caissier.
 * Toutes les entrées sont en lecture seule et scopées tenant.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req, ["admin", "gestionnaire", "comptable"]);
  if (error) return error;

  await db();
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 50));

  const filtre: Record<string, any> = { entrepriseId: user!.entrepriseId };
  const kiosqueId = sp.get("kiosqueId");
  if (kiosqueId && Types.ObjectId.isValid(kiosqueId)) {
    filtre.kiosqueId = new Types.ObjectId(kiosqueId);
  }
  const userId = sp.get("userId");
  if (userId && Types.ObjectId.isValid(userId)) {
    filtre.userId = new Types.ObjectId(userId);
  }
  if (sp.get("module")) filtre.module = sp.get("module");
  if (sp.get("action")) filtre.action = { $regex: `^${sp.get("action")}`, $options: "i" };
  if (sp.get("du") || sp.get("au")) {
    filtre.createdAt = {};
    if (sp.get("du")) filtre.createdAt.$gte = new Date(sp.get("du")!);
    if (sp.get("au")) {
      const au = new Date(sp.get("au")!);
      au.setHours(23, 59, 59, 999);
      filtre.createdAt.$lte = au;
    }
  }

  const [total, entrees] = await Promise.all([
    JournalActivite.countDocuments(filtre),
    JournalActivite.find(filtre)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("userId", "nom prenom type")
      .populate("kiosqueId", "nom code")
      .lean(),
  ]);

  // Liste des modules distincts pour alimenter le filtre de la page
  const modules = await JournalActivite.distinct("module", {
    entrepriseId: user!.entrepriseId,
    module: { $exists: true, $ne: null },
  });

  return NextResponse.json({
    entrees,
    modules: modules.filter(Boolean),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
