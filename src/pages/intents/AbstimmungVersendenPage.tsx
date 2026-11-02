/**
 * Abstimmung versenden — 3-Schritt-Wizard.
 * Steps: 1) Entwurf wählen → 2) Terminvorschläge und Teilnehmer prüfen → 3) Prüfen & versenden.
 * Reads: terminabstimmungen, terminvorschlaege, teilnehmer. Writes: terminabstimmungen (status), teilnehmer (einladungsstatus, einladung_versendet_am).
 * Composes: IntentWizardShell, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldDate, fieldLookup, refFilter, nowIso, type JourneyRecord } from '@/lib/journey';
import { useAbstimmungVersendenFlow } from '@/lib/journey/flows/AbstimmungVersenden';
import { tx } from '@/i18n';

function showDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd.MM.yyyy HH:mm');
  } catch {
    return iso;
  }
}

export default function AbstimmungVersendenPage() {
  const [step, setStep] = useState(1);
  const flow = useAbstimmungVersendenFlow({
    steps: { terminabstimmungen: 1, teilnehmer: 2 },
    items: {
      terminabstimmungen: r => ({
        id: r.id,
        title: fieldText(r, 'titel'),
        subtitle: tx`Antwortfrist: ${showDateTime(fieldDate(r, 'antwortfrist'))}`,
        status: fieldLookup(r, 'status') ?? undefined,
      }),
      teilnehmer: r => ({
        id: r.id,
        title: `${fieldText(r, 'vorname')} ${fieldText(r, 'nachname')}`.trim(),
        subtitle: fieldText(r, 'email'),
        status: fieldLookup(r, 'einladungsstatus') ?? undefined,
      }),
    },
  });

  const draftId = flow.targets.terminabstimmungen.selectedId;
  const draft = flow.targets.terminabstimmungen.record;
  const [vorschlaege, setVorschlaege] = useState<JourneyRecord[] | null>(null);
  const [teilnehmerListe, setTeilnehmerListe] = useState<JourneyRecord[] | null>(null);

  useEffect(() => {
    if (!draftId) {
      setVorschlaege(null);
      setTeilnehmerListe(null);
      return;
    }
    let on = true;
    setVorschlaege(null);
    setTeilnehmerListe(null);
    const filter = refFilter('terminabstimmung', draftId);
    void flow.port.list('terminvorschlaege', { filter, limit: 200 }).then(r => { if (on) setVorschlaege(r); }).catch(() => { if (on) setVorschlaege([]); });
    void flow.port.list('teilnehmer', { filter, limit: 200 }).then(r => { if (on) setTeilnehmerListe(r); }).catch(() => { if (on) setTeilnehmerListe([]); });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the picked draft changes
  }, [draftId]);

  const loaded = vorschlaege !== null && teilnehmerListe !== null;

  const checkStep2 = (): boolean | string => {
    if (!loaded) return tx('Die Daten werden noch geladen.');
    if (vorschlaege.length === 0) return tx('Für diesen Entwurf gibt es noch keine Terminvorschläge.');
    if (teilnehmerListe.length === 0) return tx('Für diesen Entwurf gibt es noch keine Teilnehmer.');
    const frist = draft ? fieldDate(draft, 'antwortfrist') : null;
    if (frist && frist < nowIso()) return tx('Die Antwortfrist darf nicht vor dem Versand liegen.');
    return flow.validateStep(2);
  };

  return (
    <IntentWizardShell
      title={tx('Abstimmung versenden')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Gib einen Entwurf frei und lade die Teilnehmer ein.'),
        needs: [tx('Einen Entwurf mit Terminvorschlägen'), tx('Mindestens einen Teilnehmer')],
      }}
    >
      <WizardStep label={tx('Entwurf wählen')} description={tx('Welche Abstimmung soll versendet werden?')}>
        <EntitySelectStep
          {...flow.picks.terminabstimmungen.select}
          {...flow.pick('terminabstimmungen')}
          searchPlaceholder={tx('Titel suchen …')}
          emptyText={tx('Es gibt keinen Entwurf, der versendet werden könnte.')}
        />
      </WizardStep>

      <WizardStep
        label={tx('Prüfen')}
        heading={tx('Terminvorschläge und Teilnehmer prüfen')}
        description={tx('Ohne Terminvorschläge und Teilnehmer kann nichts versendet werden.')}
        needs={['terminabstimmungen']}
      >
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <section className="rounded-2xl border bg-card p-4 overflow-hidden min-w-0">
              <h3 className="text-sm font-semibold">
                {tx('Terminvorschläge')}{vorschlaege ? ` (${vorschlaege.length})` : ''}
              </h3>
              {vorschlaege === null ? (
                <p className="mt-2 text-sm text-muted-foreground">{tx('Wird geladen …')}</p>
              ) : vorschlaege.length === 0 ? (
                <p className="mt-2 text-sm text-destructive">{tx('Noch keine Terminvorschläge vorhanden.')}</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {vorschlaege.map(v => (
                    <li key={v.id} className="truncate">
                      {showDateTime(fieldDate(v, 'start'))} – {showDateTime(fieldDate(v, 'ende'))}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-2xl border bg-card p-4 overflow-hidden min-w-0">
              <h3 className="text-sm font-semibold">
                {tx('Teilnehmer')}{teilnehmerListe ? ` (${teilnehmerListe.length})` : ''}
              </h3>
              {teilnehmerListe === null ? (
                <p className="mt-2 text-sm text-muted-foreground">{tx('Wird geladen …')}</p>
              ) : teilnehmerListe.length === 0 ? (
                <p className="mt-2 text-sm text-destructive">{tx('Noch keine Teilnehmer vorhanden.')}</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {teilnehmerListe.map(t => (
                    <li key={t.id} className="truncate">
                      {`${fieldText(t, 'vorname')} ${fieldText(t, 'nachname')}`.trim()}
                      <span className="text-muted-foreground"> · {fieldText(t, 'email')} · {fieldLookup(t, 'rolle')?.label ?? ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">{tx('Teilnehmer für die Einladung wählen')}</p>
            <EntitySelectStep
              {...flow.picks.teilnehmer.select}
              {...flow.pick('teilnehmer')}
              avatar="initials"
              searchPlaceholder={tx('Name oder E-Mail …')}
            />
          </div>

          <StepNav
            onBack={() => setStep(1)}
            onNext={checkStep2}
            nextStepLabel={tx('Prüfen & versenden')}
          />
        </div>
      </WizardStep>

      <WizardStep label={tx('Versenden')} description={tx('Alles richtig? Dann wird die Abstimmung versendet.')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            confirmLabel={tx('Jetzt versenden')}
            whatHappensNext={tx('Der Status wechselt auf „Versendet“ und der Einladungsstatus der Teilnehmer wird aktualisiert.')}
          />
        )}
      </WizardStep>

      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          title={tx('Abstimmung versendet')}
          facts={[
            { label: tx('Status'), value: tx('Versendet') },
            { label: tx('Antwortfrist'), value: showDateTime(draft ? fieldDate(draft, 'antwortfrist') : null) },
          ]}
          whatHappensNext={tx('Sobald Rückmeldungen eintreffen, kannst du sie erfassen.')}
          actions={{ copy: false, print: false }}
          next={[
            { label: tx('Rückmeldung erfassen'), href: '#/intents/rueckmeldung-erfassen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
