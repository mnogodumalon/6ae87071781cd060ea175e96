/**
 * Rückmeldung erfassen — 7-Schritt-Wizard.
 * Steps: 1) Terminabstimmung wählen → 2) Teilnehmer wählen → 3) Terminvorschlag wählen →
 *        4) Verfügbarkeit + Kommentar → 5) Allgemeiner Kommentar → 6) Alternativer Termin (optional) → 7) Prüfen & speichern.
 * Reads: terminabstimmungen, terminvorschlaege, teilnehmer.
 * Writes: rueckmeldungen (create), teilnehmer (update), alternative_terminvorschlaege (create, optional) — all via useRueckmeldungErfassenFlow.
 * Composes: IntentWizardShell, EntitySelectStep, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldLookup, formatFieldValue, optionsOf } from '@/lib/journey';
import { useRueckmeldungErfassenFlow } from '@/lib/journey/flows/RueckmeldungErfassen';
import { tx } from '@/i18n';

export default function RueckmeldungErfassenPage() {
  const [step, setStep] = useState(1);
  const flow = useRueckmeldungErfassenFlow({
    steps: {
      terminabstimmung: 1,
      teilnehmer: 2,
      terminvorschlag: 3,
      verfuegbarkeit: 4,
      kommentar: 4,
      allgemeiner_kommentar: 5,
      vorgeschlagen_von: 6,
      start: 6,
      ende: 6,
    },
    items: {
      terminabstimmung: r => ({
        id: r.id,
        title: fieldText(r, 'titel'),
        subtitle: tx`Antwort bis ${formatFieldValue('terminabstimmungen', 'antwortfrist', r.fields.antwortfrist)}`,
        status: fieldLookup(r, 'status') ?? undefined,
      }),
      terminvorschlag: r => ({
        id: r.id,
        title: tx`${formatFieldValue('terminvorschlaege', 'start', r.fields.start)} – ${formatFieldValue('terminvorschlaege', 'ende', r.fields.ende)}`,
        subtitle: fieldText(r, 'ort_abweichend') || fieldText(r, 'meeting_link_abweichend') || undefined,
      }),
      teilnehmer: r => ({
        id: r.id,
        title: `${fieldText(r, 'vorname')} ${fieldText(r, 'nachname')}`.trim(),
        subtitle: fieldLookup(r, 'rolle')?.label,
      }),
      alternative_terminvorschlaege_terminabstimmung: r => ({ id: r.id, title: fieldText(r, 'titel') }),
      vorgeschlagen_von: r => ({
        id: r.id,
        title: `${fieldText(r, 'vorname')} ${fieldText(r, 'nachname')}`.trim(),
        subtitle: fieldLookup(r, 'rolle')?.label,
      }),
    },
  });

  const alt = flow.forms.alternative_terminvorschlaege;
  const altTouched = Boolean(alt.get('start') || alt.get('ende') || alt.get('vorgeschlagen_von'));
  // the pick step fills the Rückmeldung's form only — the alternative needs the same Abstimmung
  const syncAltAbstimmung = () => {
    const id = flow.forms.rueckmeldungen.get('terminabstimmung');
    if (typeof id === 'string' && id) alt.set('terminabstimmung', id, flow.picks.terminabstimmung.labelOf(id));
  };
  const verfuegbarkeitKey = flow.forms.rueckmeldungen.get('verfuegbarkeit') as string | null | undefined;
  const verfuegbarkeitLabel =
    optionsOf('rueckmeldungen', 'verfuegbarkeit').find(o => o.key === verfuegbarkeitKey)?.label ?? '—';
  const geantwortetLabel =
    optionsOf('teilnehmer', 'einladungsstatus').find(o => o.key === 'geantwortet')?.label ?? '—';

  return (
    <IntentWizardShell
      title={tx('Rückmeldung erfassen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Verfügbarkeit eines Teilnehmers für einen Terminvorschlag festhalten.'),
        needs: [tx('Die Terminabstimmung'), tx('Den Teilnehmer'), tx('Seine Antwort zum Terminvorschlag')],
      }}
    >
      <WizardStep label={tx('Abstimmung')} description={tx('Zu welcher Terminabstimmung kommt die Rückmeldung?')}>
        <EntitySelectStep
          {...flow.picks.terminabstimmung.select}
          {...flow.pick('terminabstimmung')}
          searchPlaceholder={tx('Titel suchen …')}
        />
      </WizardStep>

      <WizardStep label={tx('Teilnehmer')} description={tx('Wer gibt die Rückmeldung ab?')}>
        <EntitySelectStep
          {...flow.picks.teilnehmer.select}
          {...flow.pick('teilnehmer')}
          avatar="initials"
          searchPlaceholder={tx('Name suchen …')}
        />
      </WizardStep>

      <WizardStep
        label={tx('Terminvorschlag')}
        description={tx('Für welchen Terminvorschlag erfasst du eine Antwort? Pro Durchlauf einen.')}
       
      >
        <EntitySelectStep {...flow.picks.terminvorschlag.select} {...flow.pick('terminvorschlag')} />
      </WizardStep>

      <WizardStep
        label={tx('Antwort')}
        description={tx('Passt der Termin? Ja, wenn nötig oder nein — gern mit Kommentar.')}
       
      >
        <div className="space-y-4">
          <Bound form={flow.forms.rueckmeldungen} name="verfuegbarkeit" />
          <Bound form={flow.forms.rueckmeldungen} name="kommentar" rows={3} />
          <StepNav
            onBack={() => setStep(3)}
            onNext={() => flow.validateStep(4)}
            nextStepLabel={tx('Allgemeiner Kommentar')}
          />
        </div>
      </WizardStep>

      <WizardStep label={tx('Kommentar')} description={tx('Gibt es etwas, das für alle Terminvorschläge gilt?')}>
        <div className="space-y-4">
          <Bound form={flow.forms.teilnehmer} name="allgemeiner_kommentar" rows={4} />
          <StepNav
            onBack={() => setStep(4)}
            onNext={() => flow.validateStep(5)}
            nextStepLabel={tx('Alternativer Termin')}
          />
        </div>
      </WizardStep>

      <WizardStep
        label={tx('Alternative')}
        description={tx('Optional: ein anderer Termin, der besser passen würde. Leer lassen, wenn nicht nötig.')}
      >
        <div className="space-y-4">
          <EntitySelectStep
            {...flow.picks.vorgeschlagen_von.select}
            {...flow.pick('vorgeschlagen_von')}
            onSelect={id => { flow.pick('vorgeschlagen_von').onSelect(id); syncAltAbstimmung(); }}
            avatar="initials"
            create={false}
            emptyText={tx('Noch kein Teilnehmer vorhanden.')}
          />
          <Bound form={alt} name="start" />
          <Bound form={alt} name="ende" />
          <Bound form={alt} name="kommentar" rows={3} />
          <StepNav
            onBack={() => setStep(5)}
            onNext={() => {
              if (!altTouched) return true;
              syncAltAbstimmung();
              return flow.validateStep(6);
            }}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            items={[{ key: 'einladungsstatus', label: tx('Einladungsstatus'), value: geantwortetLabel }]}
            whatHappensNext={tx('Die Rückmeldung wird gespeichert und der Teilnehmer gilt als „geantwortet“.')}
          />
        )}
      </WizardStep>

      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          submit={flow.submit}
          title={tx('Rückmeldung erfasst')}
          facts={[
            { label: tx('Verfügbarkeit'), value: verfuegbarkeitLabel },
            { label: tx('Einladungsstatus'), value: geantwortetLabel },
          ]}
          restartLabel={tx('Weitere Rückmeldung erfassen')}
          whatHappensNext={tx('Für weitere Terminvorschläge starte den Ablauf einfach noch einmal.')}
          next={[
            { label: tx('Weitere Rückmeldung erfassen'), onClick: () => { flow.reset(); setStep(1); } },
            { label: tx('Termin verbindlich festlegen'), href: '#/intents/termin-festlegen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
