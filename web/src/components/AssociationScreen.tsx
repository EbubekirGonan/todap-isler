import { useState, type FormEvent } from 'react';
import {
  createAssociationTile,
  listAssociationTiles,
  updateAssociationTile,
  type AssociationTile,
  type AssociationTileInput,
} from '../api';
import { useLoad } from '../useLoad';
import { Sheet } from './Sheet';
import { Spinner } from './Spinner';

type Props = {
  isAdmin: boolean;
};

// Dernek kutucukları yalnızca yönetici tarafından doldurulur; herkes görebilir.
export function AssociationScreen({ isAdmin }: Props) {
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AssociationTile | null>(null);
  const { data, error, loading } = useLoad(listAssociationTiles, `association:${version}`);

  function handleChanged() {
    setVersion((value) => value + 1);
  }

  if (loading) return <Spinner />;
  if (error) return <p role="alert" className="text-red-700">{error}</p>;

  return (
    <div className="space-y-4">
      {!data || data.length === 0 ? (
        <p className="text-slate-600">Henüz kutucuk eklenmedi.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((tile) => (
            <li key={tile.id}>
              <TileCard tile={tile} isAdmin={isAdmin} onEdit={() => setEditing(tile)} />
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <button
          type="button"
          aria-label="Kutucuk ekle"
          title="Kutucuk ekle"
          onClick={() => setCreating(true)}
          className="fixed bottom-6 right-[max(1.5rem,calc((100vw-48rem)/2+1.5rem))] z-20 flex h-14 w-14 items-center justify-center rounded-full bg-teal-700 text-3xl leading-none text-white shadow-lg hover:bg-teal-800"
        >
          +
        </button>
      )}

      {creating && (
        <TileForm
          onSaved={() => {
            setCreating(false);
            handleChanged();
          }}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <TileForm
          tile={editing}
          onSaved={() => {
            setEditing(null);
            handleChanged();
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function TileCard({ tile, isAdmin, onEdit }: { tile: AssociationTile; isAdmin: boolean; onEdit: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <article className="h-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{tile.title}</h2>
        {isAdmin && (
          <div className="relative">
            <button
              type="button"
              aria-label="Kutucuk işlemleri"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="rounded-md px-2 py-1 text-lg leading-none text-slate-600 hover:bg-slate-100"
            >
              ⋮
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 z-10 mt-1 w-40 rounded-md bg-white py-1 shadow-lg ring-1 ring-slate-200">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit();
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
                >
                  Düzenle
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {tile.description && <p className="mt-2 text-sm text-slate-700">{tile.description}</p>}
    </article>
  );
}

function TileForm({ tile, onSaved, onClose }: { tile?: AssociationTile; onSaved: () => void; onClose: () => void }) {
  const isEdit = Boolean(tile);
  const [title, setTitle] = useState(tile?.title ?? '');
  const [description, setDescription] = useState(tile?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Başlık zorunludur.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const input: AssociationTileInput = {
        title: trimmedTitle,
        description: description.trim() || null,
      };
      if (tile) {
        await updateAssociationTile(tile.id, input);
      } else {
        await createAssociationTile(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi. Tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={isEdit ? 'Kutucuğu düzenle' : 'Yeni kutucuk'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm font-medium text-slate-800">
          Başlık
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={100}
            required
            autoFocus
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
          />
        </label>

        <label className="block text-sm font-medium text-slate-800">
          Açıklama (isteğe bağlı)
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            rows={4}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
          />
        </label>

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-teal-700 px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </form>
    </Sheet>
  );
}
