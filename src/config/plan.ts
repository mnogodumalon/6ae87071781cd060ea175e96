// The orchestrator's plan, as far as the running app needs it
// (docs/orchestrator/SPEC.md). Generated — do not edit; regenerated on every
// build and update from the stored plan. Without a plan every map is empty.
//
//   SYSTEM_ASSIGNED entity → fields a tool fills when a record is CREATED — the
//                   value does not exist before; dialogs hide these on create and
//                   the form-polish sets no default on them. A scheduled or
//                   update-triggered tool owns its field but is NOT in here.
//   PLAN_SENTENCES  slug → the plan in the owner's words (flows' field page)
//
// The runtime write guard (FLOW_WRITES/OWNERSHIP, planGuard.ts) left on
// 23.09.2026: a flow page composes against its generated hook, whose submit
// plan IS the Schreibliste — there is no way to spell a write outside it.

import { INTENTS } from '@/config/intents';

export const SYSTEM_ASSIGNED: Record<string, string[]> = {
  "terminabstimmungen": [
    "abstimmungsnummer"
  ]
};

export const PLAN_SENTENCES: Record<string, string[]> = {
  "abstimmung-versenden": [
    "Ändert: teilnehmer, terminabstimmungen",
    "Automatisch: status (fester Wert „versendet“), einladungsstatus (fester Wert „versendet“), einladung_versendet_am (aktueller Zeitpunkt, automatisch)"
  ],
  "rueckmeldung-erfassen": [
    "Legt an: alternative_terminvorschlaege, rueckmeldungen",
    "Ändert: teilnehmer",
    "Automatisch: antwortzeitpunkt (aktueller Zeitpunkt, automatisch), letzte_aenderung (aktueller Zeitpunkt, automatisch), einladungsstatus (fester Wert „geantwortet“), geantwortet_am (aktueller Zeitpunkt, automatisch), status (fester Wert „neu“)"
  ],
  "termin-festlegen": [
    "Ändert: terminabstimmungen, terminvorschlaege",
    "Automatisch: status (fester Wert „festgelegt“), festgelegt_am (aktueller Zeitpunkt, automatisch)"
  ],
  "abstimmung-absagen": [
    "Ändert: terminabstimmungen",
    "Automatisch: status (fester Wert „abgesagt“), abgesagt_am (aktueller Zeitpunkt, automatisch)"
  ]
};

export const PLAN_SUMMARY = "Du bekommst eine Anwendung zur Terminabstimmung: Der Organisator legt eine Abstimmung mit Titel, Agenda, Dauer, Ort oder Meeting-Link, Zeitzone, Antwortfrist und Entscheidungsregel an, hinterlegt mehrere Terminoptionen und fügt Teilnehmer mit Rolle hinzu. Rückmeldungen mit Ja, Wenn nötig oder Nein samt Kommentar je Option werden erfasst, Teilnehmer können alternative Termine vorschlagen. Das Dashboard zeigt Entwürfe, offene, abgelaufene, festgelegte und archivierte Abstimmungen mit Antwortstand. Die Auswertung zählt Stimmen je Option und bewertet die Eignung, der Organisator legt einen Termin verbindlich fest oder sagt ab. Persönliche Links, Mailversand an Teilnehmer, .ics-Dateien und Google-/Outlook-Anbindung gehen hier nicht und werden als Grenzen mit Ersatz benannt.";

/** slug → the lists a flow writes (the plan's Schreibliste). The nav leaves a
 *  flow out for a user who may not write one of them (lib/permissions.ts). */
export const FLOW_ENTITIES: Record<string, string[]> = {
  "abstimmung-versenden": [
    "teilnehmer",
    "terminabstimmungen"
  ],
  "rueckmeldung-erfassen": [
    "alternative_terminvorschlaege",
    "rueckmeldungen",
    "teilnehmer"
  ],
  "termin-festlegen": [
    "terminabstimmungen",
    "terminvorschlaege"
  ],
  "abstimmung-absagen": [
    "terminabstimmungen"
  ]
};

/** A field an UPDATE flow writes, and the value it fixes (if it does). */
export interface FlowOwner { slug: string; value?: string }

/** entity → field → the update flows that change it. Such a change is the
 *  flow's job — it records who and when (a review, a decision) — so the
 *  dashboard never writes these fields itself; it opens the flow
 *  (check-dashboard gate 25). */
export const FLOW_OWNED: Record<string, Record<string, FlowOwner[]>> = {
  "terminabstimmungen": {
    "status": [
      {
        "slug": "abstimmung-versenden",
        "value": "versendet"
      },
      {
        "slug": "termin-festlegen",
        "value": "festgelegt"
      },
      {
        "slug": "abstimmung-absagen",
        "value": "abgesagt"
      }
    ],
    "festgelegt_am": [
      {
        "slug": "termin-festlegen"
      }
    ],
    "entscheidungskommentar": [
      {
        "slug": "termin-festlegen"
      },
      {
        "slug": "abstimmung-absagen"
      }
    ],
    "abgesagt_am": [
      {
        "slug": "abstimmung-absagen"
      }
    ]
  },
  "teilnehmer": {
    "einladungsstatus": [
      {
        "slug": "abstimmung-versenden",
        "value": "versendet"
      },
      {
        "slug": "rueckmeldung-erfassen",
        "value": "geantwortet"
      }
    ],
    "einladung_versendet_am": [
      {
        "slug": "abstimmung-versenden"
      }
    ],
    "allgemeiner_kommentar": [
      {
        "slug": "rueckmeldung-erfassen"
      }
    ],
    "geantwortet_am": [
      {
        "slug": "rueckmeldung-erfassen"
      }
    ]
  }
};

/** The link that opens the flow owning `entity.field` with `recordId` already
 *  picked — `toValue` chooses between flows that fix different values (the
 *  approve flow vs the execute flow). null when no LIVE flow owns it (not
 *  built yet, or removed): the caller then offers no shortcut. */
export function flowLinkFor(entity: string, field: string, recordId: string, toValue?: string): string | null {
  const owners = (FLOW_OWNED[entity]?.[field] ?? []).filter(o => INTENTS.some(i => i.path === `/intents/${o.slug}`));
  const owner = (toValue !== undefined ? owners.find(o => o.value === toValue) : undefined)
    ?? owners.find(o => o.value === undefined)
    ?? owners[0];
  return owner ? `#/intents/${owner.slug}?record=${encodeURIComponent(recordId)}` : null;
}

/** flowLinkFor as a click handler — `action: go ? { label, onClick: go } : undefined`. */
export function flowActionFor(entity: string, field: string, recordId: string, toValue?: string): (() => void) | null {
  const href = flowLinkFor(entity, field, recordId, toValue);
  return href ? () => { window.location.hash = href.slice(1); } : null;
}
