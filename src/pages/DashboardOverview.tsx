import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { IconAlertTriangle, IconPlus, IconUsers, IconMailOpened } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { flowActionFor } from '@/config/plan';
import type { Terminabstimmungen } from '@/types/app';
import { LOOKUP_OPTIONS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import { lookupKey } from '@/lib/formatters';
import { tx, appLabel, dateFnsLocale } from '@/i18n';
import { useClock, gruss, undoToast } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { Button } from '@/components/ui/button';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';

type Focus = 'all' | 'offen' | 'wartend';

interface Row {
  rec: Terminabstimmungen;
  title: string;
  status: string;
  expired: boolean;
  total: number;
  answered: number;
  pending: number;
  firstPendingId?: string;
  finalStart?: string;
}

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const { terminabstimmungen, terminvorschlaege, teilnehmer } = data;
  const clock = useClock();
  const [focus, setFocus] = useState<Focus>('all');

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type !== 'terminabstimmungen') return undefined;
      const st = lookupKey(top.record.fields.status);
      const id = top.record.record_id;
      if (st === 'entwurf') {
        const go = flowActionFor('terminabstimmungen', 'status', id, 'versendet');
        return go ? { label: tx('Einladung versenden'), onClick: go } : undefined;
      }
      if (st === 'versendet' || st === 'in_abstimmung' || st === 'abgelaufen') {
        const go = flowActionFor('terminabstimmungen', 'status', id, 'festgelegt');
        return go ? { label: tx('Termin festlegen'), onClick: go } : undefined;
      }
      return undefined;
    },
  });

  const nowKey = format(clock, "yyyy-MM-dd'T'HH:mm");

  const rows = useMemo<Row[]>(() => {
    return terminabstimmungen.map((rec) => {
      const status = lookupKey(rec.fields.status) ?? 'entwurf';
      const isOpenStatus = status === 'versendet' || status === 'in_abstimmung';
      const expired =
        status === 'abgelaufen' ||
        (isOpenStatus && !!rec.fields.antwortfrist && rec.fields.antwortfrist.slice(0, 16) < nowKey);
      const members = teilnehmer.filter((p) => extractRecordId(p.fields.terminabstimmung) === rec.record_id);
      const done = members.filter((p) => lookupKey(p.fields.einladungsstatus) === 'geantwortet' || !!p.fields.geantwortet_am);
      const open = members.filter((p) => !done.includes(p) && lookupKey(p.fields.einladungsstatus) !== 'abgesagt' && !p.fields.vollstaendig_abgesagt);
      const fin = terminvorschlaege.find(
        (v) => v.fields.final_gewaehlt && extractRecordId(v.fields.terminabstimmung) === rec.record_id,
      );
      return {
        rec,
        title: rec.fields.titel ?? rec.fields.abstimmungsnummer ?? '—',
        status,
        expired,
        total: members.length,
        answered: done.length,
        pending: open.length,
        firstPendingId: open[0]?.record_id,
        finalStart: fin?.fields.start,
      };
    });
  }, [terminabstimmungen, teilnehmer, terminvorschlaege, nowKey]);

  const columns = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['terminabstimmungen']?.['status'] ?? []).map((o) => ({ key: o.key, label: o.label })),
    [],
  );

  const fmt = (s?: string) => (s ? format(new Date(s), 'dd.MM.yy HH:mm', { locale: dateFnsLocale() }) : '—');

  const isActive = (r: Row) => (r.status === 'versendet' || r.status === 'in_abstimmung') && !r.expired;
  const activeRows = rows.filter(isActive);
  const expiredRows = rows.filter((r) => r.expired && r.status !== 'abgelaufen' ? true : r.status === 'abgelaufen');
  const pendingTotal = activeRows.reduce((n, r) => n + r.pending, 0);
  const answeredTotal = activeRows.reduce((n, r) => n + r.answered, 0);
  const readyRows = activeRows.filter((r) => r.total > 0 && r.pending === 0);

  const visible = rows.filter((r) => {
    if (focus === 'offen') return isActive(r);
    if (focus === 'wartend') return isActive(r) && r.pending > 0;
    return true;
  });

  const cards = useMemo<KanbanCard[]>(
    () =>
      visible
        .slice()
        .sort((a, b) => (a.rec.fields.antwortfrist ?? '').localeCompare(b.rec.fields.antwortfrist ?? ''))
        .map((r) => {
          const column = r.expired && (r.status === 'versendet' || r.status === 'in_abstimmung') ? 'abgelaufen' : r.status;
          const tone: KanbanTone =
            column === 'festgelegt' ? 'success' : column === 'abgelaufen' ? 'warning' : column === 'abgesagt' ? 'destructive' : 'default';
          const subtitle =
            r.status === 'festgelegt' && r.finalStart
              ? tx`Termin ${fmt(r.finalStart)}`
              : r.total > 0
                ? tx`Frist ${fmt(r.rec.fields.antwortfrist)} · ${r.answered}/${r.total} Antworten`
                : tx`Frist ${fmt(r.rec.fields.antwortfrist)} · noch keine Teilnehmer`;
          return { id: `abstimmung:${r.rec.record_id}`, column, title: r.title, subtitle, tone };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible],
  );

  const moveCard = (cardId: string, col: string) => {
    const id = cardId.split(':')[1];
    if (!id) return;
    const target = col === 'versendet' || col === 'in_abstimmung' ? 'versendet' : col;
    if (target === 'versendet' || target === 'festgelegt' || target === 'abgesagt') {
      const go = flowActionFor('terminabstimmungen', 'status', id, target);
      if (go) {
        undoToast(tx('Ablauf geöffnet — dort bestätigen'));
        go();
        return tx('Im Ablauf bestätigen');
      }
    }
    return tx('Dieser Statuswechsel läuft über den Ablauf oder „Bearbeiten“ im Datensatz');
  };

  const openRec = (id: string) => {
    const rec = terminabstimmungen.find((x) => x.record_id === id);
    if (rec) crud.terminabstimmungen.openDetail(rec);
  };

  // Hero: expired poll waiting for a decision
  const heroRow = expiredRows[0];
  const heroGo = heroRow ? flowActionFor('terminabstimmungen', 'status', heroRow.rec.record_id, 'festgelegt') : null;

  const context = (() => {
    if (rows.length === 0) return tx`Lege deine erste Terminabstimmung an und lade Teilnehmer ein.`;
    if (heroRow) return tx`Die Frist von „${heroRow.title}“ ist abgelaufen — Zeit, einen Termin festzulegen.`;
    if (readyRows.length > 0) return tx`Alle haben bei „${readyRows[0].title}“ geantwortet — du kannst entscheiden.`;
    if (activeRows.length > 0) {
      const next = activeRows
        .slice()
        .sort((a, b) => (a.rec.fields.antwortfrist ?? '').localeCompare(b.rec.fields.antwortfrist ?? ''))[0];
      return tx`„${next.title}“ wartet noch auf ${next.pending} Antworten, Frist ${fmt(next.rec.fields.antwortfrist)}.`;
    }
    const last = rows[rows.length - 1];
    return tx`Aktuell läuft nichts — zuletzt bearbeitet: „${last.title}“.`;
  })();

  const waitingList = activeRows
    .filter((r) => r.pending > 0)
    .sort((a, b) => (a.rec.fields.antwortfrist ?? '').localeCompare(b.rec.fields.antwortfrist ?? ''));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{appLabel('terminabstimmungen')}</h1>
          <p className="text-sm text-muted-foreground">
            {gruss(clock)} {context}
          </p>
        </div>
        {crud.terminabstimmungen.canWrite && (
          <Button onClick={() => crud.terminabstimmungen.openCreate({ status: 'entwurf' })}>
            <IconPlus size={16} className="shrink-0" />
            {tx('Neue Abstimmung')}
          </Button>
        )}
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          heroRow ? (
            <HeroBanner
              icon={<IconAlertTriangle size={18} />}
              action={{
                label: tx('Termin festlegen'),
                onClick: heroGo ?? (() => openRec(heroRow.rec.record_id)),
              }}
            >
              <b>{heroRow.title}</b>{' '}
              {expiredRows.length > 1
                ? tx`und ${expiredRows.length - 1} weitere: Antwortfrist abgelaufen, Entscheidung offen.`
                : tx`: Antwortfrist abgelaufen, ${heroRow.answered} von ${heroRow.total} haben geantwortet.`}
            </HeroBanner>
          ) : undefined
        }
        kpis={
          rows.length > 0 ? (
            <StatStrip>
              <StatStripItem
                title={tx('Laufende Abstimmungen')}
                value={activeRows.length}
                icon={<IconMailOpened size={16} className="text-muted-foreground" />}
                onClick={() => setFocus((f) => (f === 'offen' ? 'all' : 'offen'))}
                active={focus === 'offen'}
              />
              <StatStripItem
                title={tx('Antworten ausstehend')}
                value={`${pendingTotal} / ${pendingTotal + answeredTotal}`}
                icon={<IconUsers size={16} className="text-muted-foreground" />}
                tone={pendingTotal > 0 ? 'warning' : 'default'}
                onClick={() => setFocus((f) => (f === 'wartend' ? 'all' : 'wartend'))}
                active={focus === 'wartend'}
              />
            </StatStrip>
          ) : undefined
        }
        primary={
          <KanbanWidget
            cards={cards}
            columns={columns}
            defaultCollapsed={['abgesagt', 'archiviert']}
            onCardClick={(c) => openRec(c.id.split(':')[1] ?? '')}
            onCardMove={moveCard}
            onAddCard={crud.terminabstimmungen.canWrite ? (col) => crud.terminabstimmungen.openCreate({ status: col }) : undefined}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Bereit zur Entscheidung')}
              items={readyRows.map((r) => {
                const go = flowActionFor('terminabstimmungen', 'status', r.rec.record_id, 'festgelegt');
                return {
                  id: r.rec.record_id,
                  title: r.title,
                  secondLine: (
                    <span className="text-muted-foreground">
                      {tx`Alle ${r.total} haben geantwortet`}
                    </span>
                  ),
                  action: go ? { label: tx('Festlegen'), onClick: go } : undefined,
                };
              })}
              onItemClick={openRec}
              empty={{ text: tx('Noch keine Abstimmung mit vollständigen Antworten.') }}
            />
            <WorkList
              title={tx('Antworten fehlen')}
              items={waitingList.map((r) => {
                const go = r.firstPendingId
                  ? flowActionFor('teilnehmer', 'einladungsstatus', r.firstPendingId, 'geantwortet')
                  : null;
                return {
                  id: r.rec.record_id,
                  title: r.title,
                  secondLine: (
                    <>
                      <span className="font-medium text-amber-600">{tx`${r.pending} ausstehend`}</span>
                      <span className="text-muted-foreground"> · {tx`Frist ${fmt(r.rec.fields.antwortfrist)}`}</span>
                    </>
                  ),
                  action: go ? { label: tx('Antwort erfassen'), onClick: go } : undefined,
                };
              })}
              onItemClick={openRec}
              empty={{ text: tx('Niemand muss gerade erinnert werden.') }}
            />
          </>
        }
      />
      {crud.surfaces}
    </div>
  );
}
