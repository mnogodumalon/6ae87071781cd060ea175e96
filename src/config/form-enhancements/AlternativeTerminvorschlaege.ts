// Auto-generated. Per-entity form-enhancements config for "Alternative Terminvorschläge".
// Written by the backend form polish (app/services/form_polish.py) from the
// generator's manifest; scripts/parse-formulas.mjs expands the formula strings.
// Schema: see ./types.ts.

import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ["terminabstimmung", "vorgeschlagen_von", {"row": ["start", "ende"]}, "status", "kommentar"],
  defaults: {
    'start': { kind: 'today', withTime: true },
    'status': { kind: 'lookup', key: 'neu', label: 'Neu' },
  },
  computed: {
    '_vorschlag_dauer_minuten': { op: 'mul', left: { kind: 'dateDiff', from: 'start', to: 'ende', unit: 'hours' }, right: { kind: 'literal', value: 60 } },
  },
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
