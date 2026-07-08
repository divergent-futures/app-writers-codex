<script lang="ts">
  import * as E from '../../lib/render/engine.js';

  let { rev }: { rev: number } = $props();
  const html = $derived.by(() => {
    rev;
    return E.vWeb();
  });

  // Ported hover-to-enlarge from the prototype: dim the graph, light up the hovered node + its
  // edges + neighbours, and scale the hovered node's visual group on top.
  function webHover(node: HTMLElement) {
    let big: HTMLElement | null = null;
    const unbig = () => {
      if (big) {
        big.querySelector('.gvis')?.removeAttribute('transform');
        big = null;
      }
    };
    const g = () => node.querySelector('#webg') as SVGElement | null;
    const over = (e: Event) => {
      const svg = g();
      if (!svg) return;
      const nd = (e.target as HTMLElement).closest('.gnode') as HTMLElement | null;
      if (!nd) return;
      const id = nd.getAttribute('data-node');
      svg.querySelectorAll('.hot').forEach((x) => x.classList.remove('hot'));
      svg.classList.add('dim');
      const nb: Record<string, number> = {};
      if (id) nb[id] = 1;
      svg.querySelectorAll('.gedge').forEach((ed) => {
        const a = ed.getAttribute('data-a'), b = ed.getAttribute('data-b');
        if (a === id || b === id) {
          ed.classList.add('hot');
          if (a) nb[a] = 1;
          if (b) nb[b] = 1;
        }
      });
      svg.querySelectorAll('.gnode').forEach((nn) => {
        if (nb[nn.getAttribute('data-node') || '']) nn.classList.add('hot');
      });
      if (nd !== big) {
        unbig();
        const cx = nd.getAttribute('data-cx'), cy = nd.getAttribute('data-cy');
        const r = parseFloat(nd.getAttribute('data-r') || '10') || 10;
        const v = nd.querySelector('.gvis');
        if (v && cx) {
          const sc = Math.max(1.6, 32 / r).toFixed(2);
          v.setAttribute('transform', 'translate(' + cx + ' ' + cy + ') scale(' + sc + ') translate(-' + cx + ' -' + cy + ')');
        }
        svg.appendChild(nd);
        big = nd;
      }
    };
    const leave = () => {
      const svg = g();
      if (!svg) return;
      svg.classList.remove('dim');
      svg.querySelectorAll('.hot').forEach((x) => x.classList.remove('hot'));
      unbig();
    };
    node.addEventListener('mouseover', over);
    node.addEventListener('mouseleave', leave);
    return {
      destroy() {
        node.removeEventListener('mouseover', over);
        node.removeEventListener('mouseleave', leave);
      },
    };
  }
</script>

<div class="legend">
  Every character and who they are tied to — bigger dots have more connections. Click a name for
  detail; hover to light up their ties.
</div>
<div use:webHover>
  {@html html}
</div>
