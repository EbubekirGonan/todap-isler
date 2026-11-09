import { useEffect, useRef, useState } from 'react';

type Result<T> = { key: string; data: T | null; error: string | null };

// Liste yüklemesi için küçük kanca. key değiştiğinde yeniden yükler.
// Sonuç, key'i ile birlikte tutulur; key güncel değilse eski veri gösterilmez.
export function useLoad<T>(load: () => Promise<T>, key: string) {
  const [result, setResult] = useState<Result<T> | null>(null);
  // Yükleyici her render'da yeni bir fonksiyon olabilir; yalnızca key değişince yüklemek için ref'te tutulur.
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((data) => {
        if (!cancelled) setResult({ key, data, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResult({ key, data: null, error: err instanceof Error ? err.message : 'Yüklenemedi. Tekrar deneyin.' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const current = result?.key === key ? result : null;
  return { data: current?.data ?? null, error: current?.error ?? null, loading: current === null };
}
