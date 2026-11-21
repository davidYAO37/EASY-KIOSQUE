import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { exporterProduits } from "@/services/catalogue.service";

/** Export Excel (.xlsx) du catalogue — mêmes filtres que la liste. */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  await db();
  const sp = req.nextUrl.searchParams;
  const buffer = await exporterProduits(user!.entrepriseId!, {
    q: sp.get("q") || undefined,
    categorieId: sp.get("categorieId") || undefined,
    typeProduit: sp.get("typeProduit") || undefined,
    statut: sp.get("statut") || undefined,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="produits-${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx"`,
    },
  });
}
