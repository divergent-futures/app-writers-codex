<script lang="ts">
  import { app } from '../lib/stores/app.svelte';
  import { findEntity } from '../lib/edit';
  import { CIRCLE_STEPS, type Character, type Arc, type Relationship, type CharacterLink, type Lesson } from '../lib/schema';

  let { id, onClose, onSaved, onDeleted }: {
    id: string; onClose: () => void; onSaved: () => void; onDeleted: () => void;
  } = $props();

  const data = () => app.active!.data;

  // deep plain-copy the character so edits are local until Save (seeded once)
  const c = $state<Character>({ id: '', name: '', role: '', oneLine: '', source: '', relationships: [], links: [], arcs: [], lessons: [], aliases: [] });
  let aliasText = $state('');
  let busy = $state(false);
  let seeded = false;
  $effect(() => {
    if (seeded) return;
    seeded = true;
    const src = app.active ? (findEntity(app.active.data, 'character', id) as unknown as Character) : undefined;
    if (src) Object.assign(c, JSON.parse(JSON.stringify($state.snapshot(src))) as Character);
    else c.id = id;
    c.arcs ??= [];
    c.relationships ??= [];
    c.links ??= [];
    c.lessons ??= [];
    c.aliases ??= [];
    aliasText = (c.aliases || []).join(', ');
  });

  const books = $derived(data().books.slice().sort((a, b) => (a.order || 0) - (b.order || 0)));
  const characters = $derived(data().characters.filter((x) => x.id !== id));
  const worlds = $derived(data().worlds);
  const threads = $derived(data().threads);

  const bookTitle = (bid?: string) => data().books.find((b) => b.id === bid)?.title || bid || '(no book)';
  const unarcedBooks = $derived(books.filter((b) => !(c.arcs || []).some((a) => a.book === b.id)));

  function addArc() {
    const b = unarcedBooks[0];
    c.arcs = [...(c.arcs || []), { book: b?.id, status: 'open', want: '', need: '', wound: '', scores: { proactivity: null, relatability: null, capability: null }, circle: [], rationale: '' } as Arc];
  }
  function removeArc(i: number) { c.arcs = (c.arcs || []).filter((_, j) => j !== i); }
  function toggleCircle(a: Arc, step: string) {
    const set = new Set(a.circle || []);
    set.has(step as any) ? set.delete(step as any) : set.add(step as any);
    a.circle = CIRCLE_STEPS.filter((s) => set.has(s));
  }
  function setScore(a: Arc, key: 'proactivity' | 'relatability' | 'capability', v: string) {
    a.scores ??= {};
    a.scores[key] = v === '' ? null : Math.max(0, Math.min(10, Number(v)));
  }

  function addRel() { c.relationships = [...c.relationships, { to: characters[0]?.id || '', type: '', note: '' } as Relationship]; }
  function removeRel(i: number) { c.relationships = c.relationships.filter((_, j) => j !== i); }

  function addLink() { c.links = [...c.links, { to: worlds[0]?.id || '', kind: 'world', type: '', note: '' } as CharacterLink]; }
  function removeLink(i: number) { c.links = c.links.filter((_, j) => j !== i); }
  const linkTargets = (kind: string) => (kind === 'thread' ? threads : worlds);

  function addLesson() {
    c.lessons = [...(c.lessons || []), { id: `l-${Math.random().toString(36).slice(2, 7)}`, book: books[0]?.id, order: (c.lessons?.length || 0) + 1, trigger: '', lesson: '', becomes: '', status: 'learned' } as Lesson];
  }
  function removeLesson(i: number) { c.lessons = (c.lessons || []).filter((_, j) => j !== i); }

  async function save() {
    if (busy || !app.active) return;
    busy = true;
    const e = findEntity(app.active.data, 'character', id) as unknown as Character | undefined;
    if (e) {
      c.aliases = aliasText.split(',').map((s) => s.trim()).filter(Boolean);
      const clean = JSON.parse(JSON.stringify($state.snapshot(c))) as Character;
      // write back field by field (keep the same object identity in the store array)
      Object.assign(e, clean);
      await app.save();
    }
    busy = false;
    onSaved();
    onClose();
  }
  async function del() {
    if (!app.active || !confirm('Delete this character? This cannot be undone.')) return;
    busy = true;
    const arr = app.active.data.characters;
    const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) arr.splice(i, 1);
    await app.save();
    busy = false;
    onDeleted();
    onClose();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="editwrap" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="editsheet wide" role="dialog" aria-label="Edit character">
    <div class="row" style="margin-bottom:12px">
      <b>Edit character</b><span class="spacer"></span>
      <button class="link" onclick={onClose}>Cancel</button>
    </div>

    <label class="efield"><span class="elabel">Name</span><input type="text" bind:value={c.name} /></label>
    <label class="efield"><span class="elabel">Role</span><input type="text" bind:value={c.role} /></label>
    <label class="efield"><span class="elabel">One-line</span><textarea bind:value={c.oneLine}></textarea></label>
    <label class="efield"><span class="elabel">Aliases (comma-separated — helps the cockpit detect them)</span><input type="text" bind:value={aliasText} /></label>
    <label class="efield"><span class="elabel">Canon source</span><input type="text" bind:value={c.source} /></label>

    <!-- ARCS -->
    <div class="esec">
      <div class="esechead"><b>Arcs</b> <span class="muted">per book — scores &amp; Story Circle drive the Matrix</span>
        <span class="spacer"></span>
        {#if unarcedBooks.length}<button class="btn small" onclick={addArc}>+ Arc</button>{/if}
      </div>
      {#each c.arcs || [] as a, i (i)}
        <div class="ecard">
          <div class="row">
            <select class="pick" bind:value={a.book}>
              {#each books as b (b.id)}<option value={b.id}>{bookTitle(b.id)}</option>{/each}
            </select>
            <select class="pick" bind:value={a.status}>
              <option value="open">open</option><option value="closed">closed</option>
            </select>
            <span class="spacer"></span>
            <button class="link del" onclick={() => removeArc(i)}>Remove</button>
          </div>
          <div class="scores">
            {#each [['proactivity', 'P'], ['relatability', 'R'], ['capability', 'C']] as [k, lab]}
              <label class="score"><span>{lab}</span>
                <input type="number" min="0" max="10" value={a.scores?.[k as 'proactivity'] ?? ''} oninput={(e) => setScore(a, k as any, (e.target as HTMLInputElement).value)} />
              </label>
            {/each}
          </div>
          <div class="circle">
            {#each CIRCLE_STEPS as step}
              <button type="button" class="cstep" class:on={(a.circle || []).includes(step)} onclick={() => toggleCircle(a, step)}>{step}</button>
            {/each}
          </div>
          <label class="efield"><span class="elabel">Want</span><input type="text" bind:value={a.want} /></label>
          <label class="efield"><span class="elabel">Need</span><input type="text" bind:value={a.need} /></label>
          <label class="efield"><span class="elabel">Wound</span><input type="text" bind:value={a.wound} /></label>
          <label class="efield"><span class="elabel">Rationale</span><input type="text" bind:value={a.rationale} /></label>
        </div>
      {/each}
    </div>

    <!-- RELATIONSHIPS -->
    <div class="esec">
      <div class="esechead"><b>Relationships</b><span class="spacer"></span><button class="btn small" onclick={addRel}>+ Relationship</button></div>
      {#each c.relationships as r, i (i)}
        <div class="ecard row">
          <select class="pick" bind:value={r.to}>
            {#each characters as x (x.id)}<option value={x.id}>{x.name}</option>{/each}
          </select>
          <input type="text" class="grow" placeholder="type (e.g. Daughter)" bind:value={r.type} />
          <input type="text" class="grow" placeholder="note" bind:value={r.note} />
          <button class="link del" onclick={() => removeRel(i)}>×</button>
        </div>
      {/each}
    </div>

    <!-- LINKS -->
    <div class="esec">
      <div class="esechead"><b>Connections</b> <span class="muted">to worlds / threads</span><span class="spacer"></span><button class="btn small" onclick={addLink}>+ Connection</button></div>
      {#each c.links as l, i (i)}
        <div class="ecard row">
          <select class="pick" bind:value={l.kind}>
            <option value="world">world</option><option value="thread">thread</option>
          </select>
          <select class="pick" bind:value={l.to}>
            {#each linkTargets(l.kind) as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
          </select>
          <input type="text" class="grow" placeholder="type" bind:value={l.type} />
          <button class="link del" onclick={() => removeLink(i)}>×</button>
        </div>
      {/each}
    </div>

    <!-- LESSONS -->
    <div class="esec">
      <div class="esechead"><b>Lessons</b><span class="spacer"></span><button class="btn small" onclick={addLesson}>+ Lesson</button></div>
      {#each c.lessons || [] as ls, i (i)}
        <div class="ecard">
          <div class="row">
            <select class="pick" bind:value={ls.book}>
              {#each books as b (b.id)}<option value={b.id}>{bookTitle(b.id)}</option>{/each}
            </select>
            <select class="pick" bind:value={ls.status}>
              <option value="learned">learned</option><option value="partial">partial</option><option value="resisted">resisted</option>
            </select>
            <input type="number" class="ord" placeholder="order" bind:value={ls.order} />
            <span class="spacer"></span><button class="link del" onclick={() => removeLesson(i)}>Remove</button>
          </div>
          <label class="efield"><span class="elabel">Lesson</span><input type="text" bind:value={ls.lesson} /></label>
          <label class="efield"><span class="elabel">Trigger</span><input type="text" bind:value={ls.trigger} /></label>
          <label class="efield"><span class="elabel">Becomes</span><input type="text" bind:value={ls.becomes} /></label>
        </div>
      {/each}
    </div>

    <div class="row" style="margin-top:14px">
      <button class="btn" style="color:var(--bad);border-color:var(--bad)" onclick={del} disabled={busy}>Delete character</button>
      <span class="spacer"></span>
      <button class="btn primary" onclick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
    </div>
  </div>
</div>

<style>
  .editwrap {
    position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.55);
    display: flex; align-items: flex-start; justify-content: center; padding: 24px 16px; overflow: auto;
  }
  .editsheet {
    width: 100%; max-width: 560px; background: var(--panel); border: 1px solid var(--line);
    border-radius: 14px; padding: 18px 20px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  }
  .editsheet.wide { max-width: 640px; }
  .efield { display: block; margin-bottom: 10px; }
  .elabel { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-bottom: 4px; }
  .editsheet input[type='text'], .editsheet input[type='number'], .editsheet textarea {
    width: 100%; background: var(--panel2); color: var(--ink); border: 1px solid var(--line);
    border-radius: 9px; padding: 8px 11px; font: inherit; outline: none;
  }
  .editsheet textarea { min-height: 60px; resize: vertical; }
  .editsheet input:focus, .editsheet textarea:focus { border-color: var(--accent); }
  .esec { margin-top: 16px; border-top: 1px solid var(--line); padding-top: 12px; }
  .esechead { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px; }
  .ecard { background: var(--panel2); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }
  .ecard.row, .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .grow { flex: 1 1 120px; min-width: 90px; }
  .ord { width: 68px; }
  .btn.small { padding: 4px 10px; font-size: 12px; }
  .del { color: var(--bad); }
  .scores { display: flex; gap: 12px; margin: 8px 0; }
  .score { display: flex; align-items: center; gap: 6px; font-weight: 700; }
  .score input { width: 60px; }
  .circle { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
  .cstep {
    font-size: 11px; padding: 3px 9px; border-radius: 20px; cursor: pointer;
    background: var(--panel); border: 1px solid var(--line); color: var(--muted);
  }
  .cstep.on { background: var(--accent); color: #0c0f16; border-color: var(--accent); font-weight: 600; }
</style>
