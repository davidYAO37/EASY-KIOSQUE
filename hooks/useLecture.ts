'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

export function useLecture(scope = '') {
  const requetes = useRef(new Map<string, AbortController>());
  useEffect(() => () => {
    requetes.current.forEach((c) => c.abort());
    requetes.current.clear();
  }, [scope]);
  return useCallback(async <T = any>(url: string, succes: (data: T) => void, erreur: (e: any) => void = () => {}, termine: () => void = () => {}, cle = url.split('?')[0]) => {
    requetes.current.get(cle)?.abort();
    const controller = new AbortController();
    requetes.current.set(cle, controller);
    try {
      const res = await axios.get<T>(url, { withCredentials: true, signal: controller.signal });
      if (!controller.signal.aborted) succes(res.data);
    } catch (e) {
      if (!controller.signal.aborted) erreur(e);
    } finally {
      if (!controller.signal.aborted) {
        requetes.current.delete(cle);
        termine();
      }
    }
  }, []);
}

export function useActualisation(charger: () => void) {
  useEffect(() => {
    window.addEventListener('ek-donnees-change', charger);
    return () => window.removeEventListener('ek-donnees-change', charger);
  }, [charger]);
}

export function useRecherche<T>(valeur: T, delai = 350) {
  const [recherche, setRecherche] = useState(valeur);
  useEffect(() => {
    const timer = setTimeout(() => setRecherche(valeur), delai);
    return () => clearTimeout(timer);
  }, [valeur, delai]);
  return recherche;
}
