/**
 * useRueckmeldungErfassenFlow — the plumbing of the flow « Rückmeldung erfassen », generated from the plan.
 *
 * Writes `rueckmeldungen`: asks `terminabstimmung`, `terminvorschlag`, `verfuegbarkeit`, `kommentar`; sets `antwortzeitpunkt`, `letzte_aenderung`, `teilnehmer` itself.
Changes `teilnehmer`: the record to change is picked (`flow.pick('teilnehmer')`), the form is prefilled with its values; asks `allgemeiner_kommentar`; sets `einladungsstatus`, `geantwortet_am` itself.
Writes `alternative_terminvorschlaege` (only when the person fills it): asks `terminabstimmung`, `vorgeschlagen_von`, `start`, `ende`, `kommentar`; sets `status` itself.
 * The hook OWNS: the form(s) with exactly these fields and the plan's required
 * ingredients, one record search per picked field (columns and filter from
 * the plan), and the submit plan with its fixed and derived values. A page
 * that only calls `flow.submit.run()` cannot write a field the plan does not
 * know — there is no way to spell it.
 *
 * YOU decide what a person notices, through the options:
 *   steps     which wizard step asks which field (default: one step per pick,
 *             then one for the typed fields, then "Prüfen" = step 7)
 *   items     how a search hit is displayed per pick (title, subtitle, status …)
 *   initial   prefills for typed fields
 *   messages  the sentence for an empty required field, per field
 *
 *   const flow = useRueckmeldungErfassenFlow({
 *     steps: { teilnehmer: 1, terminabstimmung: 4, terminvorschlag: 3, vorgeschlagen_von: 5, verfuegbarkeit: 6, kommentar: 6, allgemeiner_kommentar: 6, start: 6, ende: 6 },
 *     items: { terminabstimmung: r => ({ id: r.id, title: fieldText(r, 'titel') }) },
 *   });
 *   <IntentWizardShell forms={flow.forms} draftKey={flow.draftKey} …>
 *     <EntitySelectStep {...flow.picks.terminabstimmung.select} {...flow.pick('terminabstimmung')} />
 *     <EntitySelectStep {...flow.picks.terminvorschlag.select} {...flow.pick('terminvorschlag')} />
 *     // the record this flow changes: <EntitySelectStep {...flow.picks.teilnehmer.select} {...flow.pick('teilnehmer')} />
 *     <EntitySelectStep {...flow.picks.alternative_terminvorschlaege_terminabstimmung.select} {...flow.pick('terminabstimmung')} />
 *     <EntitySelectStep {...flow.picks.vorgeschlagen_von.select} {...flow.pick('vorgeschlagen_von')} />
 *     <Bound form={flow.forms.rueckmeldungen} name="verfuegbarkeit" />
 *     <Bound form={flow.forms.rueckmeldungen} name="kommentar" />
 *     <Bound form={flow.forms.teilnehmer} name="allgemeiner_kommentar" />
 *     <Bound form={flow.forms.alternative_terminvorschlaege} name="start" />
 *     <Bound form={flow.forms.alternative_terminvorschlaege} name="ende" />
 *     <Bound form={flow.forms.alternative_terminvorschlaege} name="kommentar" />
 *     <StepNav onNext={() => flow.validateStep(n)} />
 *     {!flow.submit.done && <SummaryStep forms={flow.formList} submit={flow.submit} />}
 *     {flow.submit.result && <SuccessStep result={flow.submit.result} forms={flow.formList} submit={flow.submit} />}
 *   </IntentWizardShell>
 */
import { useEffect, useState } from 'react';
import {
  useStepForm, useJourneySubmit, useRecordSearch,
  fieldText, fieldLookup, fieldLookups, fieldNumber, fieldDate, fieldRef,
  todayIso, nowIso, isEmptyValue, policyFixedValue, withPickPolicy, usePolicyVersion,
  type StepForm, type JourneyRecord, type RefContext, type SelectItemLike, type FormValues, type PlanStep, type SummaryItem,} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { pickHint, whereSentence, type PickWhere } from '@/lib/journey/policy';
import { labelOf, optionsOf, type EntityKey } from '@/lib/journey/rules';
import { entityLabel } from '@/lib/journey/rules';
export type RueckmeldungErfassenFieldKey = 'allgemeiner_kommentar' | 'ende' | 'kommentar' | 'start' | 'teilnehmer' | 'terminabstimmung' | 'terminvorschlag' | 'verfuegbarkeit' | 'vorgeschlagen_von';

export interface RueckmeldungErfassenForms {
  rueckmeldungen: StepForm<'rueckmeldungen'>;
  teilnehmer: StepForm<'teilnehmer'>;
  alternative_terminvorschlaege: StepForm<'alternative_terminvorschlaege'>;
}

// Alias so the option generics stay readable.
type Key = RueckmeldungErfassenFieldKey;

export interface RueckmeldungErfassenFlowOptions {
  /** field → wizard step that asks it; drives „Ändern“ links and answer chips. */
  steps?: Partial<Record<Key, number>>;
  initial?: Partial<Record<Key, unknown>>;
  messages?: Partial<Record<Key, string>>;
  /** How a search hit reads — the card's title/subtitle/status per pick. */
  items?: {
    terminabstimmung?: (record: JourneyRecord, ctx: RefContext) => SelectItemLike;
    terminvorschlag?: (record: JourneyRecord, ctx: RefContext) => SelectItemLike;
    teilnehmer?: (record: JourneyRecord, ctx: RefContext) => SelectItemLike;
    alternative_terminvorschlaege_terminabstimmung?: (record: JourneyRecord, ctx: RefContext) => SelectItemLike;
    vorgeschlagen_von?: (record: JourneyRecord, ctx: RefContext) => SelectItemLike;
  };
}

const DEFAULT_STEPS: Record<string, number> = {"allgemeiner_kommentar": 6, "ende": 6, "kommentar": 6, "start": 6, "teilnehmer": 1, "terminabstimmung": 4, "terminvorschlag": 3, "verfuegbarkeit": 6, "vorgeschlagen_von": 5};
export const RUECKMELDUNGERFASSEN_REVIEW_STEP = 7;

function fromPick<T>(pick: { recordOf(id: string): JourneyRecord | undefined }, form: StepForm, field: string, read: (r: JourneyRecord) => T): T | undefined {
  const id = form.get(field);
  const rec = typeof id === 'string' && id ? pick.recordOf(id) : undefined;
  return rec ? read(rec) : undefined;
}
function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Returns T, not Partial<T>: a Record's index signature is already "maybe
// absent", and Partial<Record<string, string>> does not assign to the
// Record<string, string> useStepForm wants (tsc, live 23.09.2026 — eight
// errors, one per hook, caught only in the sandbox build).
function only<T extends Record<string, unknown>>(obj: T | undefined, keys: string[]): T | undefined {
  if (!obj) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out as T;
}

function hasValues(form: StepForm): boolean {
  return form.keys.some(k => !isEmptyValue(form.values[k]));
}

export function useRueckmeldungErfassenFlow(options: RueckmeldungErfassenFlowOptions = {}) {
  const steps = { ...DEFAULT_STEPS, ...(options.steps ?? {}) } as Record<string, number>;
  const [teilnehmerTargetId, setTeilnehmerTargetId] = useState<string | null>(null);
  const rueckmeldungen = useStepForm('rueckmeldungen', {
    fields: ["terminabstimmung", "terminvorschlag", "verfuegbarkeit", "kommentar"],
    steps: only(steps, ["terminabstimmung", "terminvorschlag", "verfuegbarkeit", "kommentar"]) as Record<string, number>,
    initial: only(options.initial as FormValues | undefined, ["terminabstimmung", "terminvorschlag", "verfuegbarkeit", "kommentar"]),
    messages: only(options.messages as Record<string, string> | undefined, ["terminabstimmung", "terminvorschlag", "verfuegbarkeit", "kommentar"]),
  });
  const teilnehmer = useStepForm('teilnehmer', {
    fields: ["allgemeiner_kommentar"],
    steps: only(steps, ["allgemeiner_kommentar"]) as Record<string, number>,
    initial: only(options.initial as FormValues | undefined, ["allgemeiner_kommentar"]),
    messages: only(options.messages as Record<string, string> | undefined, ["allgemeiner_kommentar"]),
  });
  const alternative_terminvorschlaege = useStepForm('alternative_terminvorschlaege', {
    fields: ["terminabstimmung", "vorgeschlagen_von", "start", "ende", "kommentar"],
    steps: only(steps, ["terminabstimmung", "vorgeschlagen_von", "start", "ende", "kommentar"]) as Record<string, number>,
    initial: only(options.initial as FormValues | undefined, ["terminabstimmung", "vorgeschlagen_von", "start", "ende", "kommentar"]),
    messages: only(options.messages as Record<string, string> | undefined, ["terminabstimmung", "vorgeschlagen_von", "start", "ende", "kommentar"]),
  });
  const forms: RueckmeldungErfassenForms = { rueckmeldungen, teilnehmer, alternative_terminvorschlaege };
  const formList: StepForm[] = [rueckmeldungen, teilnehmer, alternative_terminvorschlaege];

  // The owner's rules after the build (intent-policies.json): a fixed value
  // for a field this flow sets itself, a narrower or wider pick — read at
  // render time, so a change works on the running application.
  usePolicyVersion();
  const searches = {
    terminabstimmung: useRecordSearch(servicePort, 'terminabstimmungen', withPickPolicy('terminabstimmung', {
      searchFields: ["titel"] as never,
      filter: "r.v_status in ['versendet', 'in_abstimmung']",
      where: (r: JourneyRecord) => ["versendet", "in_abstimmung"].includes(fieldLookup(r, "status")?.key ?? ''),
      toItem: options.items?.terminabstimmung as never,
    })),
    terminvorschlag: useRecordSearch(servicePort, 'terminvorschlaege', withPickPolicy('terminvorschlag', {
      searchFields: ["ort_abweichend", "meeting_link_abweichend"] as never,
      toItem: options.items?.terminvorschlag as never,
    })),
    teilnehmer: useRecordSearch(servicePort, 'teilnehmer', withPickPolicy('teilnehmer', {
      searchFields: ["vorname", "nachname"] as never,
      toItem: options.items?.teilnehmer as never,
    })),
    alternative_terminvorschlaege_terminabstimmung: useRecordSearch(servicePort, 'terminabstimmungen', withPickPolicy('alternative_terminvorschlaege_terminabstimmung', {
      searchFields: ["titel"] as never,
      filter: "r.v_status in ['versendet', 'in_abstimmung']",
      where: (r: JourneyRecord) => ["versendet", "in_abstimmung"].includes(fieldLookup(r, "status")?.key ?? ''),
      toItem: options.items?.alternative_terminvorschlaege_terminabstimmung as never,
    })),
    vorgeschlagen_von: useRecordSearch(servicePort, 'teilnehmer', withPickPolicy('vorgeschlagen_von', {
      searchFields: ["vorname", "nachname"] as never,
      toItem: options.items?.vorgeschlagen_von as never,
    })),
  };
  // Whether a pick offers „Neu anlegen“ is the plan's call: off for the record
  // this flow changes, for multi picks, for a catalogue entity and for an
  // entity with its own flow. The page spreads `.select` and writes no `create=`.
  // what the person sees under the search field: the rule that narrows the
  // pick (the owner's, else the plan's) — and the link that changes it
  const hintFor = (key: string, entity: EntityKey, planned: PickWhere | null) => pickHint(key, planned,
    w => whereSentence(w, f => labelOf(entity, f), (f, v) => optionsOf(entity, f).find(o => o.key === String(v))?.label ?? String(v)),
    `#/verwaltung/anwendung?line=intent:rueckmeldung-erfassen:read:${entity}`);
  // a fixed value the flow sets itself, as a review row with the link that changes it
  const setting = (entity: EntityKey, field: string, value: unknown): SummaryItem => ({
    key: `setting:${entity}.${field}`, label: labelOf(entity, field),
    value: optionsOf(entity, field).find(o => o.key === String(value))?.label ?? String(value ?? ''),
    href: `#/verwaltung/anwendung?line=intent:rueckmeldung-erfassen:write:${entity}.${field}`,
  });
  const picks = {
    terminabstimmung: { ...searches.terminabstimmung, select: { ...searches.terminabstimmung.select, create: true as boolean, hint: hintFor('terminabstimmung', 'terminabstimmungen', {"conditions": [{"field": "status", "op": "in", "value": ["versendet", "in_abstimmung"]}], "mode": "all"} as PickWhere | null) } },
    terminvorschlag: { ...searches.terminvorschlag, select: { ...searches.terminvorschlag.select, create: true as boolean, hint: hintFor('terminvorschlag', 'terminvorschlaege', null as PickWhere | null) } },
    teilnehmer: { ...searches.teilnehmer, select: { ...searches.teilnehmer.select, create: false as boolean, hint: hintFor('teilnehmer', 'teilnehmer', null as PickWhere | null) } },
    alternative_terminvorschlaege_terminabstimmung: { ...searches.alternative_terminvorschlaege_terminabstimmung, select: { ...searches.alternative_terminvorschlaege_terminabstimmung.select, create: true as boolean, hint: hintFor('alternative_terminvorschlaege_terminabstimmung', 'terminabstimmungen', {"conditions": [{"field": "status", "op": "in", "value": ["versendet", "in_abstimmung"]}], "mode": "all"} as PickWhere | null) } },
    vorgeschlagen_von: { ...searches.vorgeschlagen_von, select: { ...searches.vorgeschlagen_von.select, create: true as boolean, hint: hintFor('vorgeschlagen_von', 'teilnehmer', null as PickWhere | null) } },
  };

  const alternative_terminvorschlaegeFilled = hasValues(alternative_terminvorschlaege);
  const plan: PlanStep[] = [
    {
      key: 'rueckmeldungen', entity: 'rueckmeldungen', form: rueckmeldungen, primary: true,
      values: (): FormValues => ({
        antwortzeitpunkt: policyFixedValue('rueckmeldungen', 'antwortzeitpunkt') ?? nowIso(),
        letzte_aenderung: policyFixedValue('rueckmeldungen', 'letzte_aenderung') ?? nowIso(),
        teilnehmer: policyFixedValue('rueckmeldungen', 'teilnehmer') ?? (teilnehmerTargetId ?? undefined),
      }),
    },
    {
      key: 'teilnehmer', entity: 'teilnehmer', form: teilnehmer,
      updates: () => teilnehmerTargetId ?? undefined,
      // the review names the record this step changes; "Ändern" leads back to its pick
      target: () => teilnehmerTargetId
        ? { key: 'target:teilnehmer', label: entityLabel('teilnehmer'), value: picks.teilnehmer.labelOf(teilnehmerTargetId) ?? teilnehmerTargetId, step: steps.teilnehmer }
        : undefined,
      values: (): FormValues => ({
        einladungsstatus: policyFixedValue('teilnehmer', 'einladungsstatus') ?? "geantwortet",
        geantwortet_am: policyFixedValue('teilnehmer', 'geantwortet_am') ?? nowIso(),
      }),

      // the review shows what this step sets itself — changeable on „Deine Anwendung“, not here
      settings: () => [setting('teilnehmer', 'einladungsstatus', policyFixedValue('teilnehmer', 'einladungsstatus') ?? "geantwortet")],
    },
    ...(alternative_terminvorschlaegeFilled ? [{
      key: 'alternative_terminvorschlaege', entity: 'alternative_terminvorschlaege', form: alternative_terminvorschlaege,
      values: (): FormValues => ({
        status: policyFixedValue('alternative_terminvorschlaege', 'status') ?? "neu",
      }),

      // the review shows what this step sets itself — changeable on „Deine Anwendung“, not here
      settings: () => [setting('alternative_terminvorschlaege', 'status', policyFixedValue('alternative_terminvorschlaege', 'status') ?? "neu")],
    } as PlanStep] : []),
  ];

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'rueckmeldung-erfassen' });

  /** The record(s) this flow CHANGES: picked through {...flow.picks.<entity>.select} {...flow.pick('<entity>')};
   *  picking prefills the form with the record's current values, and the plan step updates that record. */
  const targets = {
    teilnehmer: {
      selectedId: teilnehmerTargetId,
      onSelect: (id: string) => {
        setTeilnehmerTargetId(id);
        const rec = picks.teilnehmer.recordOf(id);
        if (rec) teilnehmer.reset({ allgemeiner_kommentar: fieldText(rec, "allgemeiner_kommentar"), });
      },
      get record(): JourneyRecord | undefined { return teilnehmerTargetId ? picks.teilnehmer.recordOf(teilnehmerTargetId) : undefined; },
    },
  };
  // Opened for one record — `#/intents/rueckmeldung-erfassen?record=<id>`, the dashboard's
  // flowActionFor(): that record is the one to change. Loaded, taken into the
  // pick and selected — when this flow may change it at all (the pick's rule).
  const [linkedId] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('record'));
  useEffect(() => {
    if (!linkedId) return;
    let on = true;
    void servicePort.get('teilnehmer', linkedId).then(rec => {
      if (!on || !rec) return;
      picks.teilnehmer.adopt(rec);
      targets.teilnehmer.onSelect(rec.id);
    }).catch(() => undefined);
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per link
  }, [linkedId]);
  /** Props for a single-record pick step: {...flow.picks.x.select} {...flow.pick('x')} */
  const pick = (field: RueckmeldungErfassenFieldKey) => {
    if (field in targets) {
      const t = targets[field as keyof typeof targets];
      return { selectedId: t.selectedId, onSelect: t.onSelect };
    }
    const owner = formList.find(f => f.keys.includes(field)) ?? formList[0];
    const search = (picks as Record<string, { labelOf(id: string): string | undefined }>)[field];
    return {
      selectedId: (typeof owner.get(field) === 'string' ? (owner.get(field) as string) : null) || null,
      // `field as never` collapsed the conditional SetArgs<E, never> to never and
      // no argument was assignable any more (tsc, live 23.09.2026); widen `set`
      // itself instead — the label stays a required third argument.
      onSelect: (id: string) => (owner.set as (k: string, v: unknown, l?: string) => void)(field, id, search?.labelOf(id)),
    };
  };
  /** Props for a multi-record pick step: {...flow.picks.x.select} {...flow.pickMany('x')} */
  const pickMany = (field: RueckmeldungErfassenFieldKey) => {
    const owner = formList.find(f => f.keys.includes(field)) ?? formList[0];
    const search = (picks as Record<string, { labelOf(id: string): string | undefined }>)[field];
    return owner.records(field, id => search?.labelOf(id));
  };
  /** Validate every field the wizard asks in step `n` — for StepNav.onNext. */
  const validateStep = (n: number): boolean =>
    formList.every(f => f.validate(f.keys.filter(k => steps[k] === n)))    && Object.entries(targets).every(([k, t]) => steps[k] !== n || !!t.selectedId);
  const reset = () => { submit.reset(); formList.forEach(f => f.reset()); setTeilnehmerTargetId(null); };

  return {
    slug: 'rueckmeldung-erfassen' as const,
    draftKey: 'rueckmeldung-erfassen' as const,
    entity: 'rueckmeldungen' as const,
    form: rueckmeldungen,
    forms, formList, picks, submit, steps, targets,    reviewStep: RUECKMELDUNGERFASSEN_REVIEW_STEP,
    pick, pickMany, validateStep, reset,
    // the door the hook reads through — for what it does not own: availability
    // (useOccupancy(flow.port, …)), a count (useRecordCount(flow.port, …)). A page
    // importing servicePort next to the hook fails gate 3 (fewo 05.10.2026: the
    // gate taught useOccupancy(servicePort, …) and forbade servicePort at once)
    port: servicePort,
  };
}

export type RueckmeldungErfassenFlow = ReturnType<typeof useRueckmeldungErfassenFlow>;
