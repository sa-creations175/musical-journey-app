import ModuleCalendarPage from '../../components/ModuleCalendarPage';
import { EAR_TRAINING_SUB_MODULES } from './homeCards';

/**
 * The four sub-modules' days, added up.
 *
 * Ear training's home sits above four drills that each keep their own
 * summaries, so a day it was practised is a day any of them was — the
 * same rule its streak row uses.
 */
export default function EarTrainingCalendar() {
  return (
    <ModuleCalendarPage
      moduleId="ear-training"
      alsoModuleIds={EAR_TRAINING_SUB_MODULES.map(m => m.id)}
    />
  );
}
