type Props = {
  label?: string;
};

// Yükleme göstergesi. Ekran geçişlerinde ve veri beklerken kullanılır.
export function Spinner({ label = 'Yükleniyor' }: Props) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-6 text-slate-600">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-teal-700" aria-hidden="true" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}
