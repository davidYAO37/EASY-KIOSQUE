import mongoose, { type ClientSession } from "mongoose";

/** Erreur MongoDB « transactions non supportées » (standalone local). */
function sansTransactions(e: any): boolean {
  return (
    e?.code === 20 ||
    e?.codeName === "IllegalOperation" ||
    /Transaction numbers are only allowed/.test(e?.message || "") ||
    /replica set/i.test(e?.message || "")
  );
}

/**
 * Exécute `fn` dans une transaction multi-documents quand le serveur la
 * supporte (Atlas, replica set, mongos) ; sinon — MongoDB standalone local —
 * rejoue `fn` SANS session : les écritures deviennent séquentielles.
 *
 * ATTENTION repli : pas d'atomicité — à n'utiliser qu'en développement
 * local ; la production cible toujours Atlas/replica set.
 * `session` peut donc être `undefined` dans `fn` : tous les appels Mongoose
 * reçoivent `{ session }` tel quel (undefined = pas de session).
 */
export async function avecTransaction<T>(
  fn: (session?: ClientSession) => Promise<T>
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (e: any) {
    if (sansTransactions(e)) {
      return fn(undefined);
    }
    throw e;
  } finally {
    await session.endSession();
  }
}
