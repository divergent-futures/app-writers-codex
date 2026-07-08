<script lang="ts">
  import { app } from '../lib/stores/app.svelte';
  import { EDIT_CONFIG, findEntity, deleteEntity, refOptions } from '../lib/edit';
  import type { CollectionKey } from '../lib/schema';

  let {
    type,
    id,
    onClose,
    onSaved,
    onDeleted,
  }: {
    type: string;
    id: string;
    onClose: () => void;
    onSaved: () => void;
    onDeleted: () => void;
  } = $props();

  const cfg = $derived(EDIT_CONFIG[type]);

  // seed a local form model (scalars + nested arrays) once when opened
  let values = $state<Record<string, any>>({});
  let arrays = $state<Record<string, string[]>>({});
  let busy = $state(false);
  let seeded = false;
  $effect(() => {
    if (seeded) return;
    seeded = true;
    const ent = app.active ? (findEntity(app.active.data, type, id) as Record<string, any> | undefined) : undefined;
    const v: Record<string, any> = {};
    for (const fld of cfg.fields) {
      v[fld.key] = ent?.[fld.key] ?? (fld.type === 'bool' ? false : fld.type === 'number' ? 0 : '');
    }
    values = v;
    const a: Record<string, string[]> = {};
    for (const af of cfg.arrays || []) a[af.key] = [...((ent?.[af.key] as string[]) || [])];
    arrays = a;
  });

  const refOpts = (coll: CollectionKey) => (app.active ? refOptions(app.active.data, coll) : []);
  function toggleRef(key: string, rid: string) {
    const cur = arrays[key] || [];
    arrays[key] = cur.includes(rid) ? cur.filter((x) => x !== rid) : [...cur, rid];
  }
  function addStr(key: string) { arrays[key] = [...(arrays[key] || []), '']; }
  function removeStr(key: string, i: number) { arrays[key] = (arrays[key] || []).filter((_, j) => j !== i); }

  async function save() {
    if (busy || !app.active) return;
    busy = true;
    const e = findEntity(app.active.data, type, id) as Record<string, any> | undefined;
    if (e) {
      for (const fld of cfg.fields) {
        let val = values[fld.key];
        if (fld.type === 'number') val = Number(val) || 0;
        e[fld.key] = val;
      }
      for (const af of cfg.arrays || []) {
        e[af.key] = af.kind === 'strings' ? (arrays[af.key] || []).map((s) => s.trim()).filter(Boolean) : [...(arrays[af.key] || [])];
      }
      await app.save();
    }
    busy = false;
    onSaved();
    onClose();
  }

  async function del() {
    if (!app.active || !confirm(`Delete this ${cfg.title}? This cannot be undone.`)) return;
    busy = true;
    deleteEntity(app.active.data, type, id);
    await app.save();
    busy = false;
    onDeleted();
    onClose();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="editwrap" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="editsheet" role="dialog" aria-label={`Edit ${cfg.title}`}>
    <div class="row" style="margin-bottom:12px">
      <b>Edit {cfg.title}</b>
      <span class="spacer"></span>
      <button class="link" onclick={onClose}>Cancel</button>
    </div>
    {#each cfg.fields as fld (fld.key)}
      <label class="efield">
        <span class="elabel">{fld.label}</span>
        {#if fld.type === 'textarea'}
          <textarea bind:value={values[fld.key]}></textarea>
        {:else if fld.type === 'number'}
          <input type="number" bind:value={values[fld.key]} />
        {:else if fld.type === 'color'}
          <input type="color" bind:value={values[fld.key]} />
        {:else if fld.type === 'bool'}
          <label class="inline"><input type="checkbox" bind:checked={values[fld.key]} /> yes</label>
        {:else}
          <input type="text" bind:value={values[fld.key]} />
        {/if}
      </label>
    {/each}

    {#each cfg.arrays || [] as af (af.key)}
      <div class="esec">
        <div class="esechead">
          <b>{af.label}</b>
          {#if af.kind === 'strings'}<span class="spacer"></span><button class="btn small" onclick={() => addStr(af.key)}>+ Add</button>{/if}
        </div>
        {#if af.kind === 'strings'}
          {#each arrays[af.key] || [] as _, i (i)}
            <div class="row" style="margin-bottom:6px">
              <input type="text" class="grow" bind:value={arrays[af.key][i]} />
              <button class="link del" onclick={() => removeStr(af.key, i)}>×</button>
            </div>
          {/each}
          {#if !(arrays[af.key] || []).length}<div class="muted" style="font-size:12.5px">None yet.</div>{/if}
        {:else}
          <div class="refgrid">
            {#each refOpts(af.refColl as CollectionKey) as opt (opt.id)}
              <label class="refchk"><input type="checkbox" checked={(arrays[af.key] || []).includes(opt.id)} onchange={() => toggleRef(af.key, opt.id)} /> {opt.label}</label>
            {/each}
          </div>
        {/if}
      </div>
    {/each}

    <div class="row" style="margin-top:14px">
      <button class="btn" style="color:var(--bad);border-color:var(--bad)" onclick={del} disabled={busy}>Delete</button>
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
  .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .grow { flex: 1 1 120px; }
  .efield { display: block; margin-bottom: 10px; }
  .inline { display: inline-flex; align-items: center; gap: 6px; }
  .elabel { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-bottom: 4px; }
  .editsheet input[type='text'], .editsheet input[type='number'], .editsheet textarea {
    width: 100%; background: var(--panel2); color: var(--ink); border: 1px solid var(--line);
    border-radius: 9px; padding: 8px 11px; font: inherit; outline: none;
  }
  .editsheet textarea { min-height: 84px; resize: vertical; }
  .editsheet input:focus, .editsheet textarea:focus { border-color: var(--accent); }
  .esec { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 10px; }
  .esechead { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .btn.small { padding: 4px 10px; font-size: 12px; }
  .del { color: var(--bad); }
  .refgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 4px 12px; max-height: 220px; overflow: auto; }
  .refchk { display: flex; align-items: center; gap: 6px; font-size: 13px; }
</style>
