import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { exporterRapport } from "@/services/rapports.service";

const TYPES = ["ventes", "depenses", "credits", "kiosques", "caisses"];

/** Export Excel d'un rapport — action `export_donnees`. */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["export_donnees"],
  });
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") || "";
  if (!TYPES.includes(type)) {
    return NextResponse.json({ message: "Type de rapport invalide" }, { status: 400 });
  }

  await db();
  try {
    const { buffer, nom } = await exporterRapport(user!, type, {
      du: sp.get("du") || undefined,
      au: sp.get("au") || undefined,
      kiosqueId: sp.get("kiosqueId") || undefined,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nom}"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
