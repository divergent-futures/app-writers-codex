<script lang="ts">
  /* The read-only demo's one piece of chrome. Says plainly what this is, so nobody starts typing
   * a real world into something that won't keep it — and points at the actual app for anyone who
   * decides they want it. */
  import { REAL_APP_URL } from '../lib/mode';
</script>

<div class="demobar">
  <span class="dot" aria-hidden="true"></span>
  <p>
    <b>Demo — have a look around.</b>
    This is the real app loaded with a public-domain
    <b>Sherlock Holmes</b> example world. Every view works; nothing can be edited or saved here.
  </p>
  <a class="get" href={REAL_APP_URL}>Get the real one →</a>
</div>

<style>
  .demobar {
    position: fixed;
    inset: 0 0 auto 0;
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 16px;
    background: color-mix(in srgb, var(--accent, #7aa2ff) 16%, var(--bg, #0f1115));
    border-bottom: 1px solid color-mix(in srgb, var(--accent, #7aa2ff) 40%, transparent);
    font-size: 13.5px;
    line-height: 1.35;
  }

  .demobar p {
    margin: 0;
    flex: 1 1 auto;
  }

  .dot {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent, #7aa2ff);
  }

  .get {
    flex: 0 0 auto;
    padding: 6px 14px;
    border-radius: 7px;
    border: 1px solid transparent;
    background: var(--accent, #7aa2ff);
    /* the accent is a light blue — pin the label to the dark surface colour so it stays legible
       instead of inheriting the app's near-white link colour on a near-white button */
    color: #0f1115;
    text-decoration: none;
    white-space: nowrap;
    font-weight: 700;
  }

  .get:hover {
    filter: brightness(1.08);
  }

  @media (max-width: 760px) {
    .demobar {
      flex-wrap: wrap;
      font-size: 12.5px;
      padding: 8px 12px;
    }
    .get {
      margin-left: auto;
    }
  }
</style>
