// Auto-generated. Per-entity form-enhancements config for "Terminvorschläge".
// Written by the backend form polish (app/services/form_polish.py) from the
// generator's manifest; scripts/parse-formulas.mjs expands the formula strings.
// Schema: see ./types.ts.

import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ["terminabstimmung", {"row": ["start", "ende"]}, {"row": ["reihenfolge", "final_gewaehlt"], "cols": "1fr 1fr"}, "eignung", {"row": ["anzahl_ja", "anzahl_wenn_noetig"], "cols": "1fr 1fr"}, {"row": ["anzahl_nein", "anzahl_ohne_antwort"], "cols": "1fr 1fr"}, "anzahl_pflicht_ja", "ort_abweichend", "meeting_link_abweichend"],
  defaults: {
    'start': { kind: 'today', withTime: true },
    'reihenfolge': { kind: 'literal', value: 1 },
    'final_gewaehlt': { kind: 'literal', value: false },
  },
  computed: {
    '_termin_dauer_stunden': { kind: 'dateDiff', from: 'start', to: 'ende', unit: 'hours' },
  },
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
