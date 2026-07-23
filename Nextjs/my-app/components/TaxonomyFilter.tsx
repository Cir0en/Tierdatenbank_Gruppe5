'use client';

// Wiederverwendbares Taxonomie-Filter-Modul für die Karten-Ansichten (pages/karte.tsx
// und pages/heatmap.tsx). Beide Karten laden dieselben Fundobjekte über
// /api/geolocations/map-items (inkl. taxonomyId) und sollen sich nach Taxonomie
// filtern lassen. Damit die Logik nicht doppelt existiert, kapselt dieses Modul:
//   • useTaxonomyFilter(items): lädt den Taxonomie-Baum, löst pro Item die komplette
//     Abstammungskette (Art → … → Reich) auf und liefert ein Auswahl-Prädikat.
//   • TaxonomyFilterControl: das dazugehörige Dropdown (hell/dunkel).
// Der Filter ist hierarchisch: Wählt man z. B. "Mammalia" (Klasse), passen auch alle
// Arten darunter, weil deren Kette diesen Taxon enthält.

import { useCallback, useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

// Ein Taxonomie-Knoten aus GET /api/taxonomy (flache Liste, über parentId verkettet).
export interface TaxonomyNode {
  id: number;
  name: string;
  rank: string | null;
  parentId: number | null;
}

// Rang-Reihenfolge von grob (Reich) nach fein (Art) — steuert Gruppierung/Sortierung im Dropdown.
const RANK_ORDER = ['Reich', 'Stamm', 'Klasse', 'Ordnung', 'Familie', 'Gattung', 'Art'];

// Minimaler Item-Typ, den der Filter benötigt: nur die verknüpfte Taxonomie-Id.
export interface TaxonomyFilterItem {
  taxonomyId?: number | null;
}

/**
 * Lädt den Taxonomie-Baum einmalig und stellt Filter-Zustand + -Prädikat bereit.
 * @param items Die aktuell auf der Karte vorhandenen Fundobjekte (für relevante Auswahl-Optionen).
 * @param initialSelectedId Optionale Vorauswahl (z.B. aus dem URL-Query beim Wechsel Karte↔Heatmap),
 *   damit der gewählte Filter über den Kartenwechsel hinweg erhalten bleibt.
 */
export function useTaxonomyFilter(items: TaxonomyFilterItem[], initialSelectedId?: number | null) {
  const [nodes, setNodes] = useState<Map<number, TaxonomyNode>>(new Map());
  const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId ?? null);

  // Übernimmt eine (später) hereinkommende Vorauswahl aus dem URL-Query. Nötig, weil der
  // Query-Parameter bei der ersten Render-Phase (router noch nicht bereit) oft noch fehlt.
  useEffect(() => {
    if (initialSelectedId != null) setSelectedId(initialSelectedId);
  }, [initialSelectedId]);

  // Taxonomie-Baum einmalig laden (öffentlich abrufbar, kein Auth-Header nötig).
  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/api/taxonomy`)
      .then(r => (r.ok ? r.json() : []))
      .then((data: any[]) => {
        if (cancelled) return;
        const map = new Map<number, TaxonomyNode>();
        for (const t of data) {
          map.set(t.id, { id: t.id, name: t.name, rank: t.rank ?? null, parentId: t.parentId ?? null });
        }
        setNodes(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Abstammungskette (inkl. des Taxons selbst) als Id-Liste; Guard gegen Zyklen.
  const lineageOf = useCallback((taxId: number | null | undefined): number[] => {
    const chain: number[] = [];
    let cur = taxId ?? null;
    let guard = 0;
    while (cur != null && guard++ < 64) {
      chain.push(cur);
      cur = nodes.get(cur)?.parentId ?? null;
    }
    return chain;
  }, [nodes]);

  // Nur Taxa anbieten, die auf der Karte tatsächlich vorkommen (oder Vorfahre eines solchen sind).
  const options = useMemo(() => {
    const relevant = new Set<number>();
    for (const it of items) {
      for (const id of lineageOf(it.taxonomyId)) relevant.add(id);
    }
    return [...relevant]
      .map(id => nodes.get(id))
      .filter((n): n is TaxonomyNode => !!n)
      .sort((a, b) => {
        const ra = RANK_ORDER.indexOf(a.rank ?? '');
        const rb = RANK_ORDER.indexOf(b.rank ?? '');
        return (ra - rb) || a.name.localeCompare(b.name);
      });
  }, [items, nodes, lineageOf]);

  // Prädikat: Passt das Item (über seine Taxonomie-Id) zur aktuellen Auswahl?
  const matches = useCallback((taxId: number | null | undefined): boolean => {
    if (selectedId == null) return true;            // kein Filter aktiv → alles sichtbar
    return lineageOf(taxId).includes(selectedId);   // ausgewählter Taxon liegt in der Kette
  }, [selectedId, lineageOf]);

  const ready = nodes.size > 0;

  // Wird die aktuelle Auswahl nach einem Datenwechsel nicht mehr angeboten, Filter zurücksetzen.
  // Nur zurücksetzen, wenn die Daten bereits geladen sind (Baum + Items vorhanden) — sonst würde
  // eine per URL vorausgewählte Taxonomie fälschlich verworfen, bevor die Daten da sind.
  useEffect(() => {
    if (!ready || items.length === 0) return;
    if (selectedId != null && !options.some(o => o.id === selectedId)) setSelectedId(null);
  }, [options, selectedId, ready, items.length]);

  return { selectedId, setSelectedId, options, matches, ready };
}

/**
 * Dropdown-Steuerelement für den Taxonomie-Filter. Zeigt die relevanten Taxa nach Rang gruppiert.
 * `dark` schaltet auf ein dunkles Design (für die Heatmap-Ansicht auf dunkler Karte).
 */
export function TaxonomyFilterControl({ options, selectedId, onChange, dark = false, count }: {
  options: TaxonomyNode[];
  selectedId: number | null;
  onChange: (id: number | null) => void;
  dark?: boolean;
  count?: number;
}) {
  // Nach Rang gruppieren (Rang-Reihenfolge beibehalten).
  const groups = useMemo(() => {
    const byRank = new Map<string, TaxonomyNode[]>();
    for (const o of options) {
      const key = o.rank ?? 'Sonstige';
      if (!byRank.has(key)) byRank.set(key, []);
      byRank.get(key)!.push(o);
    }
    return [...byRank.entries()].sort(
      (a, b) => RANK_ORDER.indexOf(a[0]) - RANK_ORDER.indexOf(b[0])
    );
  }, [options]);

  // Der Filter nutzt bewusst einen hellen Hintergrund mit SCHWARZER Schrift — auch auf der
  // dunklen Heatmap. So sind sowohl die aktuelle Auswahl als auch die aufgeklappte
  // Optionsliste (die vom Browser auf hellem Grund gezeichnet wird) sicher lesbar.
  const wrapStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: dark ? 'rgba(255,255,255,.95)' : '#fff',
    border: `1px solid ${dark ? 'rgba(0,0,0,.15)' : '#dadce0'}`,
    borderRadius: 8, padding: '6px 10px',
    boxShadow: '0 2px 8px rgba(0,0,0,.25)',
    fontFamily: "'Inter', system-ui, sans-serif",
  };
  const selectStyle: React.CSSProperties = {
    border: 'none', outline: 'none', background: 'transparent',
    fontSize: 12, fontWeight: 500, cursor: 'pointer', maxWidth: 220,
    color: '#202124',
  };
  const clearStyle: React.CSSProperties = {
    border: 'none', background: 'none', cursor: 'pointer',
    color: '#5f6368', fontSize: 12, lineHeight: 1, padding: 2,
  };

  return (
    <div style={wrapStyle}>
      <span style={{ fontSize: 13 }} aria-hidden>🧬</span>
      <select
        style={selectStyle}
        value={selectedId ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        title="Nach Taxonomie filtern"
      >
        {/* Der leere Wert bedeutet: kein Filter (alle Taxonomien). */}
        <option value="">Alle Taxonomien{count != null ? ` (${count})` : ''}</option>
        {groups.map(([rank, ranked]) => (
          <optgroup key={rank} label={rank}>
            {ranked.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {selectedId != null && (
        <button type="button" style={clearStyle} title="Filter zurücksetzen" onClick={() => onChange(null)}>
          ✕
        </button>
      )}
    </div>
  );
}
