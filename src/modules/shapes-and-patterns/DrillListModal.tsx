import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DrillSkill, type DrillType } from '../../lib/db';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toaster';
import DrillSessionModal from './DrillSessionModal';
import {
  formatDuration,
  humanAgo,
  uid,
} from './drillModel';

interface Props {
  skill: DrillSkill;
  onClose: () => void;
}

/**
 * Opens when the user taps a heat-grid cell. Shows every drill type
 * for the skill + start button per drill. Supports renaming, adding
 * new drills, and deleting (confirmed) existing ones.
 */
export default function DrillListModal({ skill, onClose }: Props) {
  const drillTypes = useLiveQuery<DrillType[]>(
    () => db.drillTypes
      .where('skillId').equals(skill.id)
      .sortBy('order'),
    [skill.id],
  ) ?? [];

  const { toast } = useToast();
  const [activeDrill, setActiveDrill] = useState<DrillType | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSeconds, setNewSeconds] = useState(120);
  const [confirmDelete, setConfirmDelete] = useState<DrillType | null>(null);
  // Separate state for the skill-label inline editor. Lets the user
  // override the standard-notation default with their preferred
  // spelling ("B♭sus2" vs "Bbsus2", etc.) per-skill.
  const [editingSkillLabel, setEditingSkillLabel] = useState(false);
  const [skillLabelDraft, setSkillLabelDraft] = useState(skill.label ?? '');

  useEffect(() => { setAdding(false); }, [skill.id]);
  useEffect(() => { setSkillLabelDraft(skill.label ?? ''); }, [skill.id, skill.label]);

  const saveSkillLabel = async () => {
    const trimmed = skillLabelDraft.trim();
    if (trimmed === '' || trimmed === (skill.label ?? '')) {
      setEditingSkillLabel(false);
      return;
    }
    await db.drillSkills.update(skill.id, { label: trimmed });
    setEditingSkillLabel(false);
    toast({ message: `Renamed to "${trimmed}".`, variant: 'success' });
  };

  const saveName = async (drill: DrillType) => {
    const trimmed = nameDraft.trim();
    if (trimmed !== '' && trimmed !== drill.name) {
      await db.drillTypes.update(drill.id, { name: trimmed });
    }
    setEditingNameId(null);
  };

  const saveNewDrill = async () => {
    const trimmed = newName.trim();
    if (trimmed === '') return;
    const next: DrillType = {
      id: uid('dtype'),
      skillId: skill.id,
      name: trimmed,
      suggestedSeconds: Math.max(30, Math.round(newSeconds)),
      order: drillTypes.length,
      repCount: 0,
      totalSeconds: 0,
      lastPracticedAt: null,
      userCreated: true,
    };
    await db.drillTypes.add(next);
    setAdding(false);
    setNewName('');
    setNewSeconds(120);
    toast({ message: `Added drill: ${trimmed}`, variant: 'success' });
  };

  const deleteDrill = async (drill: DrillType) => {
    // Cascade its sessions too — and snapshot for undo.
    const sessions = await db.drillSessions
      .where('drillTypeId').equals(drill.id)
      .toArray();
    await db.transaction('rw', [db.drillTypes, db.drillSessions], async () => {
      await db.drillTypes.delete(drill.id);
      if (sessions.length > 0) {
        await db.drillSessions.bulkDelete(sessions.map(s => s.id));
      }
    });
    toast({
      message: `Drill deleted: ${drill.name}`,
      variant: 'warning',
      action: {
        label: 'Undo',
        onClick: async () => {
          await db.transaction('rw', [db.drillTypes, db.drillSessions], async () => {
            await db.drillTypes.add(drill);
            if (sessions.length > 0) await db.drillSessions.bulkAdd(sessions);
          });
        },
      },
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={skill.label ?? 'drill list'}
      description="each rep counts toward accumulated practice on this skill."
      footer={(
        <div className="flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            close
          </button>
        </div>
      )}
    >
      <div className="space-y-3">
        {/* Editable skill label — click the displayed label to switch
            to inline-edit mode. Underlying key/quality metadata stays
            untouched; only the display label changes. */}
        <div className="flex items-center gap-2 pb-2 border-b border-neutral-200 dark:border-neutral-800 text-sm">
          {editingSkillLabel ? (
            <>
              <input
                autoFocus
                value={skillLabelDraft}
                onChange={e => setSkillLabelDraft(e.target.value)}
                onBlur={saveSkillLabel}
                onKeyDown={e => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') {
                    setSkillLabelDraft(skill.label ?? '');
                    setEditingSkillLabel(false);
                  }
                }}
                className="flex-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 font-medium"
              />
            </>
          ) : (
            <>
              <span className="font-medium flex-1">{skill.label ?? 'drill list'}</span>
              <button
                onClick={() => setEditingSkillLabel(true)}
                className="text-[11px] text-neutral-500 hover:text-fluent"
                title="rename this skill — type your preferred notation (B♭sus2, G minor 7, etc.)"
              >
                rename
              </button>
            </>
          )}
        </div>
        {drillTypes.length === 0 ? (
          <p className="text-xs text-neutral-500 italic">no drills yet — add one below.</p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {drillTypes.map(d => (
              <div key={d.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0 space-y-0.5">
                  {editingNameId === d.id ? (
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={e => setNameDraft(e.target.value)}
                      onBlur={() => saveName(d)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') { setEditingNameId(null); }
                      }}
                      className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm w-full"
                    />
                  ) : (
                    <button
                      onClick={() => { setEditingNameId(d.id); setNameDraft(d.name); }}
                      className="font-medium text-sm text-left hover:text-fluent"
                      title="click to rename"
                    >
                      {d.name}
                    </button>
                  )}
                  <div className="text-[11px] text-neutral-500">
                    <span className="font-mono tabular-nums">{d.repCount}</span> rep{d.repCount === 1 ? '' : 's'}
                    <span className="text-neutral-400 mx-1.5">·</span>
                    <span className="font-mono tabular-nums">{formatDuration(d.totalSeconds)}</span>
                    <span className="text-neutral-400 mx-1.5">·</span>
                    {d.lastPracticedAt === null ? 'never practised' : `last ${humanAgo(d.lastPracticedAt)}`}
                    <span className="text-neutral-400 mx-1.5">·</span>
                    suggested {formatDuration(d.suggestedSeconds)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveDrill(d)}
                    className="px-3 py-1 rounded-md bg-fluent text-white text-xs font-medium hover:opacity-90"
                  >
                    start drill
                  </button>
                  {drillTypes.length > 1 && (
                    <button
                      onClick={() => setConfirmDelete(d)}
                      className="text-neutral-400 hover:text-needswork text-[11px]"
                      title="delete drill"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {adding ? (
          <div className="rounded-lg border border-fluent/40 bg-fluent/5 p-3 space-y-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-neutral-500 text-xs uppercase tracking-wide">drill name</span>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Rootless left-hand voicing"
                className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-neutral-500 text-xs uppercase tracking-wide shrink-0">suggested time</span>
              <input
                type="number"
                min={30}
                step={30}
                value={newSeconds}
                onChange={e => setNewSeconds(Number(e.target.value))}
                className="w-24 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
              />
              <span className="text-xs text-neutral-500">seconds · {formatDuration(newSeconds)}</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={saveNewDrill}
                disabled={newName.trim() === ''}
                className={`px-3 py-1 rounded-md text-xs font-medium text-white ${
                  newName.trim() === ''
                    ? 'bg-neutral-300 dark:bg-neutral-700 cursor-not-allowed'
                    : 'bg-fluent hover:opacity-90'
                }`}
              >
                save drill
              </button>
              <button
                onClick={() => { setAdding(false); setNewName(''); }}
                className="px-3 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-xs"
              >
                cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="text-xs text-neutral-500 hover:text-fluent"
          >
            + add drill
          </button>
        )}
      </div>

      {activeDrill && (
        <DrillSessionModal
          skill={skill}
          drillType={activeDrill}
          onClose={() => setActiveDrill(null)}
          onLogged={() => setActiveDrill(null)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Delete drill "${confirmDelete?.name ?? ''}"?`}
        message={
          confirmDelete && (
            <>
              <p>
                Removes the drill and {confirmDelete.repCount} logged rep{confirmDelete.repCount === 1 ? '' : 's'}
                {confirmDelete.totalSeconds > 0 ? ` (${formatDuration(confirmDelete.totalSeconds)} total)` : ''}.
              </p>
              <p className="text-xs text-neutral-500">
                You can still undo from the toast right after, but only for 10 seconds.
              </p>
            </>
          )
        }
        confirmLabel="Delete drill"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          const d = confirmDelete;
          setConfirmDelete(null);
          if (d) await deleteDrill(d);
        }}
      />
    </Modal>
  );
}
