<script lang="ts">
  import * as E from '../../lib/render/engine.js';

  let { rev }: { rev: number } = $props();
  let filter = $state('');
  const html = $derived.by(() => {
    rev; // re-render when the active project's data changes
    return E.vCharacters(filter);
  });
</script>

<div class="legend">
  Scores: P proactivity · R relatability · C capability · dots = Story Circle.
  <span class="sw" style="background:var(--good)"></span>8–10
  <span class="sw" style="background:var(--warn)"></span>5.5–8
  <span class="sw" style="background:var(--bad)"></span>under 5.5
</div>
<input class="cfilter" bind:value={filter} placeholder="Filter characters by name, role, or one-line…" autocomplete="off" />
{@html html}
