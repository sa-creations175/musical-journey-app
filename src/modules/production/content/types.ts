// Static content types for the Production module. Lessons and
// glossary terms live as typed data literals in content files so
// they're version-controlled with the code. User-specific state
// (mastery, revisit count, "got it" flags) lives in Dexie tables.

export interface ProductionPath {
  id: string;
  /** Display title. */
  title: string;
  /** One-sentence goal for the whole path. */
  subtitle: string;
  /** True when the path has lesson content in Phase 1. Phase-2
   *  paths render as "Coming soon" stubs. */
  status: 'live' | 'planned';
}

export interface LessonContent {
  id: string;
  pathId: string;
  order: number;
  title: string;
  /** One-sentence goal shown prominently at the top. */
  goal: string;
  /** 3–6 minute read. Plain-language, warm, practical. May contain
   *  inline glossary references using `[[term-id]]` syntax. */
  surface: string;
  /** Deep-dive content. Longer, extended examples and nuance. */
  deepDive: string;
  /** Actionable prompt — what to do right now in Logic. */
  tryNow: string;
  /** External tutorial link (YouTube search URL preferred —
   *  lands on current-best results, no link rot). */
  youtubeLink: string;
  /** Glossary term ids introduced in this lesson. Links rendered
   *  inline in the surface text also count, but this list is the
   *  authoritative set for the lesson → term cross-reference. */
  glossaryTerms: string[];
  /** Optional reference track ids whose sonic notes are relevant
   *  for this lesson. */
  referenceTracks?: string[];
}

export interface GlossaryContent {
  id: string;
  name: string;
  /** Plain-language definition — 1-2 sentences. */
  definition: string;
  /** Concrete example the user will recognise. */
  example: string;
  /** One-sentence take on why it matters for gospel, R&B, soul,
   *  jazz, neo-soul, hip-hop specifically. */
  whyItMatters: string;
  /** Lesson ids where this term is introduced (1 = primary). */
  relatedLessons: string[];
}

export interface ReferenceTrackContent {
  id: string;
  title: string;
  artist: string;
  /** Producer credit — free-form so multi-producer credits read as
   *  a single line. Required for starter / pool content, optional on
   *  user-added tracks. */
  producer?: string;
  genre: string;
  /** Guided-listening prose — what to notice while listening. Avoids
   *  fabricated gear/ratio claims; guides the ear to perceivable
   *  things (balance, space, arrangement contrast, vocal placement). */
  whatToListenFor: string;
  tags: string[];
  spotifyLink?: string;
  youtubeLink?: string;
}
