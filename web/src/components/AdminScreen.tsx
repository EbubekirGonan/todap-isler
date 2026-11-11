import { useState, type FormEvent } from 'react';
import { createUser } from '../api';

export function AdminScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await createUser({ name, email, phone, isAdmin });
      setName('');
      setEmail('');
      setPhone('');
      setIsAdmin(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kişi eklenemedi. Tekrar deneyin.');
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900';

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Yönetim</h1>
        <p className="mt-1 text-sm text-slate-600">Uygulamaya erişebilecek kişileri buradan ekleyebilirsiniz.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-800">Kişi ekle</h2>
        <label className="block text-sm font-medium text-slate-700">
          Ad soyad
          <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={100} required />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          E-posta
          <input className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" maxLength={254} required />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Telefon (isteğe bağlı)
          <input className={inputClass} value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" autoComplete="tel" maxLength={50} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isAdmin} onChange={(event) => setIsAdmin(event.target.checked)} className="h-4 w-4 accent-teal-700" />
          Yönetici yetkisi ver
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {saved && <p role="status" className="text-sm text-teal-700">Kişi eklendi.</p>}
        <button type="submit" disabled={saving} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50">
          {saving ? 'Ekleniyor…' : 'Kişi ekle'}
        </button>
      </form>
    </section>
  );
}
