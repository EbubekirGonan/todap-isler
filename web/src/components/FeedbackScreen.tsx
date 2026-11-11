import { useState, type FormEvent } from 'react';
import { sendFeedback } from '../api';

export function FeedbackScreen() {
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!message.trim()) {
      setError('Mesaj zorunludur.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await sendFeedback(message);
      setMessage('');
      setSuccess(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mesaj gönderilemedi. Lütfen tekrar deneyin.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Yorum yap, katkı ver, hata bildir, geliştirme talep et, mesaj at.</h1>
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium text-slate-700">
          Mesajınız
          <textarea
            className="mt-1 min-h-40 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={4000}
            required
            disabled={saving}
          />
        </label>
        <p className="text-sm text-slate-600">Adınız ve e-posta adresiniz mesajınızla birlikte iletilir.</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {success && <p role="status" className="text-sm text-teal-700">{success}</p>}
        <button type="submit" disabled={saving} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50">
          {saving ? 'Gönderiliyor…' : 'Gönder'}
        </button>
      </form>
    </section>
  );
}
