/* The Craft Registry — write-path privacy resolution (design §3.8, "Two doors").
 *
 * Phase-1 invariant #1 (claude/HANDOFF-craft-registry-build.md Part 3): this lives on the WRITE PATH,
 * not the UI, from the very first CraftRun ever written — even though no generator ships until
 * Phase 6 and no user-authored (public-eligible) instrument exists until Phase 9. If this rule isn't
 * enforced here from day one, every call site added in Phases 2-5 is a place that can bypass it, and
 * Phase 6 becomes an audit of all of them instead of a build. This is a data-integrity rule, not a
 * presentation concern — call `resolveRunPrivacy` / `resolveArtifactPrivacy` wherever a CraftRun is
 * constructed, never trust a caller-supplied `isPublic`.
 */

import type { CraftSystem } from './types';

/**
 * §3.8, rule 1+2+3 — for an ordinary lens/matrix/reference run (NOT a generator artifact):
 *
 *   run.isPublic = system.hardLockedPrivate ? false : (explicitOverride ?? system.publicDefault)
 *
 * `hardLockedPrivate` refuses unconditionally — this is `cosmos-author-substrate.md`'s "one
 * permanent boundary": no explicit override can flip it, by any code path. Everything else honours
 * a per-run override over the per-framework default, because publicity is a property of the content
 * scored, not of the framework (a Le Guin pass on the water species' culture is public; one quoting
 * the ending is not).
 */
export function resolveRunPrivacy(system: Pick<CraftSystem, 'hardLockedPrivate' | 'publicDefault'>, explicitOverride?: boolean): boolean {
  if (system.hardLockedPrivate) return false;
  return explicitOverride ?? system.publicDefault;
}

/**
 * §3.8, generator rule — "an artifact inherits the privacy of its destination, not the privacy of
 * the generator that wrote it." A public-eligible protocol writing into a private entity must
 * produce private material even if the UI is bypassed. The hard lock still wins unconditionally: a
 * generator can never be talked into writing public material via a hard-locked destination, because
 * a hard-locked destination is never public in the first place — but the check is kept explicit here
 * so the rule reads the same way at both call sites rather than relying on that being true elsewhere.
 */
export function resolveArtifactPrivacy(
  system: Pick<CraftSystem, 'hardLockedPrivate'>,
  destinationIsPublic: boolean,
): boolean {
  if (system.hardLockedPrivate) return false;
  return destinationIsPublic;
}

/**
 * §3.8, rule 4 — "a public run publishes its rubric." A score of 48/60 is meaningless without the
 * axes, gates and bands that produced it; it is a number, not process content. An instrument the
 * author has marked private (`publicDefault: false`) therefore cannot have public runs, full stop —
 * there is no per-run override that can make a run public if the instrument itself isn't publishable.
 * This is the same refusal shape as the hard-lock check, for a different reason, and deliberately
 * does not add a third `publishRubric` flag (fewer semantically loaded fields, each explicitly
 * confirmed, beats more).
 *
 * Call this AFTER resolveRunPrivacy, on the resolved `isPublic`, not on the raw override — a caller
 * passing `explicitOverride: true` against a private-by-default instrument is exactly the case this
 * exists to catch.
 */
export function assertPublicRunAllowed(
  system: Pick<CraftSystem, 'id' | 'publicDefault'>,
  isPublic: boolean,
): void {
  if (isPublic && !system.publicDefault) {
    throw new Error(
      `Refused: "${system.id}" is marked private by its author — a public run must publish the ` +
        `instrument that scored it, and this instrument isn't publishable.`,
    );
  }
}
