import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { depenseAnnulationSchema } from "@/lib/validations";
import { annulerDepense } from "@/services/depenses.service";

/** Annulation tracée d'une dépense validée — action `annuler_depense`. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["annuler_depense"],
  });
  if (error) return error;

  const parsed = depenseAnnulationSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Motif obligatoire", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  const { id } = await params;
  try {
    const depense = await annulerDepense(user!, id, parsed.data.motif);
    return NextResponse.json({ depense });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
