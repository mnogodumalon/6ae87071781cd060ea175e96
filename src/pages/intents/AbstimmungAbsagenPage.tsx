/**
 * Abstimmung absagen — 3-Schritt-Wizard.
 * Steps: 1) Terminabstimmung wählen → 2) Begründung eintragen → 3) Absagen bestätigen.
 * Reads: terminabstimmungen. Writes: terminabstimmungen (status, abgesagt_am, entscheidungskommentar) via useAbstimmungAbsagenFlow.
 * Composes: IntentWizardShell, EntitySelectStep, Bound, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldLookup, fieldDate } from '@/lib/journey';
import { useAbstimmungAbsagenFlow } from '@/lib/journey/flows/AbstimmungAbsagen';
import { tx } from '@/i18n';

export default function AbstimmungAbsagenPage() {
  const [step, setStep] = useState(1);
  const flow = useAbstimmungAbsagenFlow({
    steps: { terminabstimmungen: 1, entscheidungskommentar: 2 },
    items: {
      terminabstimmungen: r => {
        const frist = fieldDate(r, 'antwortfrist');
        const status = fieldLookup(r, 'status');
        return {
          id: r.id,
          title: fieldText(r, 'titel'),
          subtitle: frist ? tx`Antwortfrist: ${frist.slice(0, 10)}` : undefined,
          status: status ?? undefined,
        };
      },
    },
  });

  return (
    <IntentWizardShell
      title={tx('Abstimmung absagen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Eine Terminabstimmung absagen und die Begründung festhalten.'),
        needs: [tx('Die Abstimmung, die abgesagt wird'), tx('Eine kurze Begründung')],
      }}
    >
      <WizardStep label={tx('Abstimmung')} description={tx('Welche Terminabstimmung soll abgesagt werden?')}>
        <EntitySelectStep
          {...flow.picks.terminabstimmungen.select}
          {...flow.pick('terminabstimmungen')}
          searchPlaceholder={tx('Titel suchen …')}
        />
      </WizardStep>
      <WizardStep label={tx('Begründung')} description={tx('Schreibe auf, warum die Abstimmung abgesagt wird.')} needs={['terminabstimmungen']}>
        <div className="space-y-4">
          <Bound form={flow.forms.terminabstimmungen} name="entscheidungskommentar" rows={4} />
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => flow.validateStep(2)}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>
      <WizardStep label={tx('Absagen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            items={[{ key: 'status', label: tx('Neuer Status'), value: tx('Abgesagt') }]}
            whatHappensNext={tx('Die Abstimmung wird als abgesagt markiert, der Zeitpunkt wird automatisch gespeichert.')}
          />
        )}
      </WizardStep>
      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          actions={{ copy: false, print: false }}
          next={[
            { label: tx('Weitere Abstimmung absagen') },
            { label: tx('Abstimmung versenden'), href: '#/intents/abstimmung-versenden' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
