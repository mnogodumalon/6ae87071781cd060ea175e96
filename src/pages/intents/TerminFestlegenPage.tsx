/**
 * Termin festlegen — 5-Schritt-Wizard.
 * Steps: 1) Terminabstimmung wählen → 2) Auswertung je Option ansehen → 3) Teilnehmer mit Nein / ohne Rückmeldung ansehen
 *        → 4) Terminvorschlag wählen + Entscheidungskommentar → 5) Prüfen & verbindlich festlegen.
 * Reads: terminabstimmungen, terminvorschlaege, rueckmeldungen, teilnehmer. Writes: terminabstimmungen (status, festgelegt_am, Kommentar), terminvorschlaege (über den Flow-Hook).
 * Composes: IntentWizardShell, EntitySelectStep, Bound, StepNav, StatusBadge, SummaryStep, SuccessStep.
 */
import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { IconCheck, IconUserOff, IconUsers } from '@tabler/icons-react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import type { StatusTone } from '@/components/blocks/StatusBadge';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldNumber, fieldDate, fieldLookup, fieldRef, refFilter } from '@/lib/journey';
import type { JourneyRecord } from '@/lib/journey';
import { useTerminFestlegenFlow } from '@/lib/journey/flows/TerminFestlegen';
import { tx } from '@/i18n';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd.MM.yyyy HH:mm');
  } catch {
    return iso;
  }
}

function range(r: JourneyRecord): string {
  return `${fmt(fieldDate(r, 'start'))} – ${fmt(fieldDate(r, 'ende'))}`;
}

function eignungTone(key: string | undefined): StatusTone {
  if (key === 'sehr_gut' || key === 'gut') return 'positive';
  if (key === 'eingeschraenkt') return 'warning';
  if (key === 'ungeeignet') return 'danger';
  return 'neutral';
}

export default function TerminFestlegenPage() {
  const [step, setStep] = useState(1);
  const flow = useTerminFestlegenFlow({
    steps: { terminabstimmungen: 1, terminvorschlaege: 4, entscheidungskommentar: 4 },
    items: {
      terminabstimmungen: r => ({ id: r.id, title: fieldText(r, 'titel') || tx('Ohne Titel'), subtitle: fieldText(r, 'abstimmungsnummer') }),
      terminvorschlaege: r => ({
        id: r.id,
        title: range(r),
        subtitle: tx`${fieldNumber(r, 'anzahl_ja') ?? 0} Ja · ${fieldNumber(r, 'anzahl_wenn_noetig') ?? 0} Wenn nötig · ${fieldNumber(r, 'anzahl_nein') ?? 0} Nein`,
      }),
    },
  });

  const abstId = (flow.pick('terminabstimmungen').selectedId ?? null) as string | null;
  const vorschlagPick = flow.picks.terminvorschlaege;
  const abstRecord = abstId ? flow.picks.terminabstimmungen.recordOf(abstId) : undefined;

  const [rueck, setRueck] = useState<JourneyRecord[]>([]);
  const [teilnehmer, setTeilnehmer] = useState<JourneyRecord[]>([]);
  const [loadingExtra, setLoadingExtra] = useState(false);

  const port = flow.port;
  useEffect(() => {
    if (!abstId) {
      setRueck([]);
      setTeilnehmer([]);
      return;
    }
    let cancelled = false;
    setLoadingExtra(true);
    Promise.all([
      port.list('rueckmeldungen', { filter: refFilter('terminabstimmung', abstId), limit: 500 }),
      port.list('teilnehmer', { filter: refFilter('terminabstimmung', abstId), limit: 500 }),
    ])
      .then(([r, t]) => {
        if (cancelled) return;
        setRueck(r.filter(x => fieldRef(x, 'terminabstimmung') === abstId));
        setTeilnehmer(t.filter(x => fieldRef(x, 'terminabstimmung') === abstId));
      })
      .catch(() => {
        if (cancelled) return;
        setRueck([]);
        setTeilnehmer([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingExtra(false);
      });
    return () => {
      cancelled = true;
    };
  }, [abstId, port]);

  const vorschlaege = useMemo(
    () =>
      vorschlagPick.records
        .filter(r => abstId && fieldRef(r, 'terminabstimmung') === abstId)
        .sort((a, b) => (fieldDate(a, 'start') ?? '').localeCompare(fieldDate(b, 'start') ?? '')),
    [vorschlagPick.records, abstId],
  );
  const vorschlagIds = useMemo(() => new Set(vorschlaege.map(v => v.id)), [vorschlaege]);
  const vorschlagLabel = (id: string | null) => {
    const v = vorschlaege.find(x => x.id === id);
    return v ? range(v) : tx('Unbekannter Termin');
  };

  const problems = useMemo(
    () =>
      teilnehmer
        .map(t => {
          const answers = rueck.filter(r => fieldRef(r, 'teilnehmer') === t.id);
          const nein = answers.filter(a => fieldLookup(a, 'verfuegbarkeit')?.key === 'nein');
          return { t, answers, nein };
        })
        .filter(p => p.answers.length === 0 || p.nein.length > 0),
    [teilnehmer, rueck],
  );

  const pickedId = (flow.pick('terminvorschlaege').selectedId ?? null) as string | null;

  const checkUnique = (): boolean | string => {
    const other = vorschlaege.find(v => v.id !== pickedId && v.fields.final_gewaehlt === true);
    if (other) return tx('Es kann nur einen finalen Termin pro Abstimmung geben.');
    return true;
  };

  const missingAbst = <StepNav onBack={() => setStep(1)} nextDisabled>{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</StepNav>;

  return (
    <IntentWizardShell
      title={tx('Termin festlegen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Wähle anhand der Auswertung den finalen Termin deiner Abstimmung.'),
        needs: [tx('Die Terminabstimmung'), tx('Den Terminvorschlag, der gelten soll')],
      }}
    >
      <WizardStep label={tx('Abstimmung')} description={tx('Für welche Terminabstimmung willst du den Termin festlegen?')}>
        <EntitySelectStep
          {...flow.picks.terminabstimmungen.select}
          {...flow.pick('terminabstimmungen')}
          searchPlaceholder={tx('Titel oder Nummer …')}
        />
      </WizardStep>

      <WizardStep label={tx('Auswertung')} description={tx('So haben die Teilnehmer je Option abgestimmt.')}>
        {!abstId ? missingAbst : (
          <div className="space-y-3">
            {abstRecord && (
              <div className="rounded-2xl border bg-secondary/50 p-4 overflow-hidden">
                <p className="font-medium truncate">{fieldText(abstRecord, 'titel')}</p>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {[fieldText(abstRecord, 'abstimmungsnummer'), fieldText(abstRecord, 'ort'), fieldText(abstRecord, 'beschreibung')].filter(Boolean).join(' · ')}
                </p>
              </div>
            )}
            {vorschlaege.length === 0 && (
              <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground overflow-hidden">
                {tx('Für diese Abstimmung gibt es noch keine Terminvorschläge.')}
              </div>
            )}
            {vorschlaege.map(v => {
              const e = fieldLookup(v, 'eignung');
              return (
                <div key={v.id} className="rounded-2xl border bg-card p-4 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium min-w-0 truncate">{range(v)}</p>
                    {e && <StatusBadge statusKey={e.key} label={e.label} tone={eignungTone(e.key)} />}
                  </div>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-sm">
                    <div className="rounded-xl bg-emerald-50 p-2"><div className="text-lg font-semibold">{fieldNumber(v, 'anzahl_ja') ?? 0}</div><div className="text-xs text-muted-foreground">{tx('Ja')}</div></div>
                    <div className="rounded-xl bg-amber-50 p-2"><div className="text-lg font-semibold">{fieldNumber(v, 'anzahl_wenn_noetig') ?? 0}</div><div className="text-xs text-muted-foreground">{tx('Wenn nötig')}</div></div>
                    <div className="rounded-xl bg-red-50 p-2"><div className="text-lg font-semibold">{fieldNumber(v, 'anzahl_nein') ?? 0}</div><div className="text-xs text-muted-foreground">{tx('Nein')}</div></div>
                    <div className="rounded-xl bg-secondary p-2"><div className="text-lg font-semibold">{fieldNumber(v, 'anzahl_ohne_antwort') ?? 0}</div><div className="text-xs text-muted-foreground">{tx('Ohne Antwort')}</div></div>
                    <div className="rounded-xl bg-secondary p-2"><div className="text-lg font-semibold">{fieldNumber(v, 'anzahl_pflicht_ja') ?? 0}</div><div className="text-xs text-muted-foreground">{tx('Pflicht: Ja')}</div></div>
                  </div>
                </div>
              );
            })}
            <StepNav onBack={() => setStep(1)} onNext={() => vorschlaege.length > 0 || tx('Es gibt keine Terminvorschläge zum Festlegen.')} nextStepLabel={tx('Teilnehmer')} />
          </div>
        )}
      </WizardStep>

      <WizardStep label={tx('Teilnehmer')} description={tx('Diese Teilnehmer haben Nein gesagt oder noch nicht geantwortet.')}>
        {!abstId ? missingAbst : (
          <div className="space-y-3">
            {loadingExtra && <p className="text-sm text-muted-foreground">{tx('Lädt …')}</p>}
            {!loadingExtra && problems.length === 0 && (
              <div className="flex items-center gap-2 rounded-2xl border bg-card p-4 text-sm">
                <IconCheck size={18} className="shrink-0 text-emerald-600" />
                {tx('Alle Teilnehmer haben geantwortet und niemand hat überall abgesagt.')}
              </div>
            )}
            {problems.map(({ t, answers, nein }) => (
              <div key={t.id} className="rounded-2xl border bg-card p-4 overflow-hidden">
                <div className="flex flex-wrap items-center gap-2">
                  {answers.length === 0 ? <IconUserOff size={18} className="shrink-0 text-amber-600" /> : <IconUsers size={18} className="shrink-0 text-muted-foreground" />}
                  <p className="font-medium min-w-0 truncate">{`${fieldText(t, 'vorname')} ${fieldText(t, 'nachname')}`.trim()}</p>
                  <span className="text-xs text-muted-foreground">{fieldLookup(t, 'rolle')?.label}</span>
                </div>
                {answers.length === 0 ? (
                  <p className="mt-2 text-sm text-amber-700">{tx('Keine Rückmeldung')}</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {nein.map(n => {
                      const vid = fieldRef(n, 'terminvorschlag');
                      return (
                        <li key={n.id} className="text-red-700 min-w-0">
                          {tx`Nein: ${vorschlagLabel(vid)}`}
                          {fieldText(n, 'kommentar') && <span className="text-muted-foreground">{` — ${fieldText(n, 'kommentar')}`}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
            <StepNav onBack={() => setStep(2)} nextStepLabel={tx('Termin wählen')} />
          </div>
        )}
      </WizardStep>

      <WizardStep label={tx('Entscheidung')} description={tx('Wähle den finalen Termin und halte kurz fest, warum.')}>
        {!abstId ? missingAbst : (
          <div className="space-y-4">
            <EntitySelectStep
              {...vorschlagPick.select}
              items={vorschlagPick.select.items.filter(i => vorschlagIds.has(i.id))}
              {...flow.pick('terminvorschlaege')}
              avatar="none"
              create={false}
              emptyText={tx('Für diese Abstimmung gibt es keine Terminvorschläge.')}
            />
            <Bound form={flow.forms.terminabstimmungen} name="entscheidungskommentar" rows={3} />
            <StepNav
              onBack={() => setStep(3)}
              onNext={() => flow.validateStep(4) && checkUnique()}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        )}
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            items={[
              { key: 'neuer_status', label: tx('Neuer Status'), value: tx('Festgelegt') },
              { key: 'festlegung_zeit', label: tx('Festgelegt am'), value: tx('Jetzt') },
            ]}
            whatHappensNext={tx('Die Abstimmung gilt als festgelegt und der gewählte Termin ist verbindlich.')}
          />
        )}
      </WizardStep>

      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          whatHappensNext={tx('Der Termin ist jetzt verbindlich festgelegt.')}
          next={[
            { label: tx('Weiteren Termin festlegen'), onClick: () => { flow.reset(); setStep(1); } },
            { label: tx('Abstimmung absagen'), href: '#/intents/abstimmung-absagen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
