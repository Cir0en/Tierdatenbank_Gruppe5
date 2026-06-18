'use client';

import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/Navbar';

const API = 'http://localhost:5099';

interface AnimalDetail {
  id: number;
  collectionId: number | null;
  name: string | null;
  findDate: string | null;
  description: string | null;
  storageInfo: string | null;
  createdAt: string | null;
  status: string | null;
  sex: string | null;
  ageClass: string | null;
  bodyMassGram: number | null;
  bodyLengthMm: number | null;
  taxonomy: { name: string; rank: string | null } | null;
  collection: { id: number; name: string } | null;
  findingLocation: { name: string; latitude: number; longitude: number } | null;
}

interface AnimalImage {
  id: number;
  imageUrl: string;
  createdAt: string | null;
}

function statusBadge(status: string | null) {
  switch ((status ?? '').toLowerCase()) {
    case 'häufig':
    case 'ungefährdet':      return { bg: '#d1fae5', color: '#065f46' };
    case 'selten':           return { bg: '#fef3c7', color: '#92400e' };
    case 'sehr selten':      return { bg: '#ffedd5', color: '#9a3412' };
    case 'wichtig':          return { bg: '#e0e7ff', color: '#3730a3' };
    case 'geschützt':        return { bg: '#fee2e2', color: '#991b1b' };
    case 'stark gefährdet':  return { bg: '#fce7f3', color: '#9d174d' };
    default:                 return { bg: '#f3f4f6', color: '#374151' };
  }
}

function formatDate(d: string | null): string | null {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return d;
  }
}

export default function TierDetailPage() {
  const router = useRouter();
  const rawId = router.query.id;
  const animalId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [animal, setAnimal]         = useState<AnimalDetail | null>(null);
  const [image, setImage]           = useState<AnimalImage | null>(null);
  const [loading, setLoading]       = useState(true);
  const [imgLoading, setImgLoading] = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [imgError, setImgError]     = useState<string | null>(null);
  const [uploading, setUploading]   = useState(false);

  useEffect(() => {
    if (!animalId) return;
    setLoading(true);
    setError(null);
    fetch(`${API}/api/animals/${animalId}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: AnimalDetail) => { setAnimal(data); setLoading(false); })
      .catch((err: Error) => { setError(err.message); setLoading(false); });
  }, [animalId]);

  const loadImage = useCallback(async () => {
    if (!animalId) return;
    setImgLoading(true);
    setImgError(null);
    try {
      const res = await fetch(`${API}/api/images/${animalId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list: AnimalImage[] = await res.json();
      setImage(list[0] ?? null);
    } catch (e: any) {
      setImgError(e.message);
    } finally {
      setImgLoading(false);
    }
  }, [animalId]);

  useEffect(() => { loadImage(); }, [loadImage]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !animalId) return;
    setUploading(true);
    setImgError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API}/api/images/upload/${animalId}`, { method: 'POST', body: fd });
      if (!res.ok) { const t = await res.text(); throw new Error(t || `HTTP ${res.status}`); }
      await loadImage();
    } catch (e: any) {
      setImgError(e.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteImg = async () => {
    if (!image || !confirm('Foto wirklich löschen?')) return;
    try {
      await fetch(`${API}/api/images/${image.id}`, { method: 'DELETE' });
      setImage(null);
    } catch (e: any) {
      setImgError(e.message);
    }
  };

  const badge = animal?.status ? statusBadge(animal.status) : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f8f9fa; min-height: 100vh; font-family: 'Inter', system-ui, sans-serif; color: #202124; }

        .app-layout   { display: flex; height: 100vh; overflow: hidden; }
        .main-content { flex: 1; background: #fff; padding: 40px; overflow-y: auto; }

        .back-btn {
          display: inline-flex; align-items: center; gap: 6px;
          background: #f0fdf4; border: 1.5px solid #a7f3d0; border-radius: 8px;
          padding: 8px 14px; font-size: 13px; font-weight: 500; color: #065f46;
          cursor: pointer; font-family: inherit; transition: background .15s; margin-bottom: 28px;
          border: none;
        }
        .back-btn:hover { background: #dcfce7; }

        .detail-grid {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 36px;
          align-items: start;
          max-width: 900px;
        }
        @media (max-width: 640px) {
          .detail-grid { grid-template-columns: 1fr; }
          .main-content { padding: 20px; }
        }

        /* ── Left: Bild ── */
        .img-col { display: flex; flex-direction: column; gap: 12px; }

        .img-box {
          width: 100%; aspect-ratio: 1 / 1; border-radius: 16px; overflow: hidden;
          border: 1.5px solid #e5e7eb; background: #f3f4f6;
          display: flex; align-items: center; justify-content: center;
        }
        .img-main  { width: 100%; height: 100%; object-fit: cover; display: block; }
        .img-empty-box {
          display: flex; flex-direction: column; align-items: center;
          gap: 8px; color: #c4c9d1; font-size: 44px;
        }
        .img-empty-box span:last-child { font-size: 12px; font-weight: 500; }

        .img-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .img-upload-btn {
          display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
          padding: 8px 14px; background: #2d6a4f; color: #fff;
          border-radius: 8px; font-size: 12px; font-weight: 600;
          transition: background .15s; user-select: none;
        }
        .img-upload-btn:hover { background: #1b4332; }
        .img-delete-btn {
          padding: 8px 14px; border-radius: 8px; border: 1.5px solid #fecaca;
          background: #fff; color: #b91c1c; font-size: 12px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: background .15s;
        }
        .img-delete-btn:hover { background: #fee2e2; }
        .img-err { font-size: 12px; color: #b91c1c; margin-top: 4px; }

        /* ── Right: Info ── */
        .info-col { display: flex; flex-direction: column; gap: 22px; }

        .animal-name {
          font-size: 28px; font-weight: 700; color: #111827; line-height: 1.2; margin-bottom: 4px;
        }
        .animal-scientific { font-size: 15px; color: #6b7280; font-style: italic; margin-bottom: 10px; }

        .badge-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
        .badge {
          font-size: 11px; font-weight: 600; padding: 3px 10px;
          border-radius: 99px; display: inline-block;
        }
        .badge-sex    { background: #e0f2fe; color: #0369a1; }
        .badge-age    { background: #f3f4f6; color: #374151; }

        .desc-box {
          font-size: 14px; color: #374151; line-height: 1.65;
          padding: 12px 16px; background: #f9fafb;
          border: 1px solid #e5e7eb; border-radius: 10px;
        }

        .section-title {
          font-size: 11px; font-weight: 700; color: #9ca3af;
          text-transform: uppercase; letter-spacing: .07em;
          padding-bottom: 8px; border-bottom: 1px solid #f3f4f6; margin-bottom: 10px;
        }

        .info-table { width: 100%; border-collapse: collapse; }
        .info-table tr { border-bottom: 1px solid #f9fafb; }
        .info-table tr:last-child { border-bottom: none; }
        .info-table td { padding: 7px 0; font-size: 13px; vertical-align: top; }
        .info-table td:first-child { color: #9ca3af; font-weight: 500; width: 44%; }
        .info-table td:last-child  { color: #111827; font-weight: 500; }

        .collection-link {
          display: inline-flex; align-items: center; gap: 7px;
          background: #f0fdf4; border: 1px solid #a7f3d0; border-radius: 20px;
          padding: 6px 14px; font-size: 12px; color: #065f46; font-weight: 600;
          cursor: pointer; text-decoration: none; transition: background .15s;
        }
        .collection-link:hover { background: #dcfce7; }

        .status-msg { text-align: center; padding: 80px; color: #6b7280; font-size: 15px; }
        .error-box {
          padding: 32px; border: 1px dashed #fca5a5; border-radius: 12px;
          background: #fff5f5; color: #b91c1c; font-size: 14px; text-align: center;
        }
      `}</style>

      <div className="app-layout">
        <Navbar activeNav="tierliste" />

        <main className="main-content">
          <button className="back-btn" onClick={() => router.back()}>← Zurück</button>

          {loading && <div className="status-msg">Wird geladen…</div>}
          {error   && <div className="error-box">⚠️ {error}</div>}

          {!loading && !error && animal && (
            <div className="detail-grid">

              {/* ── Bild-Spalte ── */}
              <div className="img-col">
                <div className="img-box">
                  {imgLoading ? (
                    <div className="img-empty-box"><span>⏳</span></div>
                  ) : image ? (
                    <img src={`${API}${image.imageUrl}`} alt={animal.name ?? ''} className="img-main" />
                  ) : (
                    <div className="img-empty-box">
                      <span>📷</span>
                      <span>Kein Foto</span>
                    </div>
                  )}
                </div>

                {imgError && <div className="img-err">⚠️ {imgError}</div>}

                <div className="img-actions">
                  <label className="img-upload-btn">
                    {uploading ? '⏳ …' : image ? '🔄 Ersetzen' : '📷 Foto hochladen'}
                    <input type="file" accept="image/jpeg,image/png,image/gif,image/webp"
                      style={{ display: 'none' }} disabled={uploading} onChange={handleUpload} />
                  </label>
                  {image && !imgLoading && (
                    <button className="img-delete-btn" onClick={handleDeleteImg}>🗑 Löschen</button>
                  )}
                </div>
              </div>

              {/* ── Info-Spalte ── */}
              <div className="info-col">
                <div>
                  <div className="animal-name">{animal.name ?? `Eintrag #${animal.id}`}</div>
                  {animal.taxonomy?.name && (
                    <div className="animal-scientific">{animal.taxonomy.name}</div>
                  )}
                  <div className="badge-row">
                    {badge && animal.status && (
                      <span className="badge" style={{ background: badge.bg, color: badge.color }}>
                        {animal.status}
                      </span>
                    )}
                    {animal.sex && (
                      <span className="badge badge-sex">
                        {animal.sex === 'Männlich' ? '♂ Männlich'
                          : animal.sex === 'Weiblich' ? '♀ Weiblich'
                          : `◉ ${animal.sex}`}
                      </span>
                    )}
                    {animal.ageClass && (
                      <span className="badge badge-age">{animal.ageClass}</span>
                    )}
                  </div>
                </div>

                {animal.description && (
                  <div className="desc-box">{animal.description}</div>
                )}

                <div>
                  <div className="section-title">Details</div>
                  <table className="info-table">
                    <tbody>
                      {animal.taxonomy?.rank && (
                        <tr><td>Taxonomie-Rang</td><td>{animal.taxonomy.rank}</td></tr>
                      )}
                      {animal.findDate && (
                        <tr><td>Funddatum</td><td>{formatDate(animal.findDate)}</td></tr>
                      )}
                      {animal.findingLocation && (
                        <tr><td>Fundort</td><td>{animal.findingLocation.name}</td></tr>
                      )}
                      {animal.bodyMassGram != null && (
                        <tr><td>Körpermasse</td><td>{animal.bodyMassGram} g</td></tr>
                      )}
                      {animal.bodyLengthMm != null && (
                        <tr><td>Körperlänge</td><td>{animal.bodyLengthMm} mm</td></tr>
                      )}
                      {animal.storageInfo && (
                        <tr><td>Lagerung</td><td>{animal.storageInfo}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {animal.collection && (
                  <div>
                    <div className="section-title">Sammlung</div>
                    <a className="collection-link" href="/Sammlung">
                      📂 {animal.collection.name}
                    </a>
                  </div>
                )}
              </div>

            </div>
          )}
        </main>
      </div>
    </>
  );
}
