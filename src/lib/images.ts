/* Writer's Codex — in-app photo layer (project-scoped).
 *
 * Every photo is kept at two sizes, because the two jobs are different:
 *
 *   thumbnail  640 px on the long edge, webp, held as a data URI (~60–80 KB)
 *              This is what fills the slots you flip past. It syncs eagerly to every device, so
 *              browsing characters stays instant and costs almost no mobile data. 640 rather than
 *              320 because phone and laptop screens pack 2–3 physical dots into every CSS pixel —
 *              a 320 px image is being enlarged before you ever see it, which is why it looked soft.
 *
 *   full       2000 px on the long edge, webp, held as a Blob (~300–600 KB)
 *              Only fetched when you click a photo to look at it properly, then cached on that
 *              device. 2000 is past what any screen here can resolve, so going bigger would cost
 *              sync time and show you nothing extra. Blob rather than a data URI: base64 inflates
 *              bytes by a third and is slow to parse at this size.
 *
 * If the original is already 640 px or smaller there is no second copy — clicking just shows what
 * there is. The engine emits slots as `<div data-imgslot="type:id">`; the Codex shell calls
 * hydrateImages() after each render and delegates clicks to handleImageClick().
 */

import { deleteImage, getImage, putImage, putImageFull } from './db';
import { fetchFullImageBytes } from './sync.svelte';

const THUMB_MAX = 640;
const FULL_MAX = 2000;

let activeProjectId = '';
export function setImageProject(id: string) {
  activeProjectId = id;
}

interface Rendered {
  thumb: string;
  full: Blob | null;
}

function canvasToBlob(cv: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((res) => {
    try {
      cv.toBlob((b) => res(b), type, quality);
    } catch {
      res(null);
    }
  });
}

/** Render a picked File at both sizes in one decode. Any failure degrades to "thumbnail only". */
function renderSizes(file: File): Promise<Rendered | null> {
  return new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      const raw = fr.result as string;

      const draw = (max: number): HTMLCanvasElement | null => {
        const w = im.width || 1;
        const h = im.height || 1;
        const sc = Math.min(1, max / Math.max(w, h));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w * sc));
        cv.height = Math.max(1, Math.round(h * sc));
        const ctx = cv.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(im, 0, 0, cv.width, cv.height);
        return cv;
      };

      im.onload = async () => {
        try {
          const tc = draw(THUMB_MAX);
          if (!tc) {
            res({ thumb: raw, full: null });
            return;
          }
          const thumb = tc.toDataURL('image/webp', 0.85);
          // No point keeping a "full size" that is the same size. Saves space and a pointless upload.
          if (Math.max(im.width || 1, im.height || 1) <= THUMB_MAX) {
            res({ thumb, full: null });
            return;
          }
          const fc = draw(FULL_MAX);
          res({ thumb, full: fc ? await canvasToBlob(fc, 'image/webp', 0.9) : null });
        } catch {
          res({ thumb: raw, full: null });
        }
      };
      im.onerror = () => res({ thumb: raw, full: null });
      im.src = raw;
    };
    fr.onerror = () => res(null);
    fr.readAsDataURL(file);
  });
}

function showSlot(el: HTMLElement, src: string, removable: boolean) {
  el.classList.add('has');
  el.innerHTML =
    '<img src="' + src + '" alt="">' +
    (removable ? '<button class="imgrm" title="Remove photo">×</button>' : '') +
    '<span class="imgchg">change</span>';
  const im = el.querySelector('img');
  if (im) {
    const ap = () => {
      if (im.naturalWidth && im.naturalHeight) {
        el.style.aspectRatio = im.naturalWidth + ' / ' + im.naturalHeight;
        el.style.height = 'auto';
      }
    };
    if (im.complete && im.naturalWidth) ap();
    else im.onload = ap;
  }
}
function clearSlot(el: HTMLElement) {
  el.classList.remove('has');
  el.style.aspectRatio = '';
  el.style.height = '';
  el.innerHTML = '<span class="imgph">+ photo</span>';
}

/** Fill any image slots / read-only images / graph nodes under `root` from the store. */
export async function hydrateImages(root: ParentNode = document): Promise<void> {
  if (!activeProjectId) return;
  const slots = root.querySelectorAll<HTMLElement>('[data-imgslot]');
  for (const el of Array.from(slots)) {
    if ((el as any).__hy) continue;
    (el as any).__hy = 1;
    const k = el.getAttribute('data-imgslot')!;
    const fb = el.getAttribute('data-imgfb') || '';
    const rec = await getImage(activeProjectId, k);
    if (rec) showSlot(el, rec.url, true);
    else if (fb) showSlot(el, fb, false);
  }
  const ros = root.querySelectorAll<HTMLElement>('[data-imgro]');
  for (const el of Array.from(ros)) {
    if ((el as any).__hyr) continue;
    (el as any).__hyr = 1;
    const k = el.getAttribute('data-imgro')!;
    const fb = el.getAttribute('data-imgfb') || '';
    const rec = await getImage(activeProjectId, k);
    const src = rec?.url || fb;
    if (src) el.style.backgroundImage = 'url("' + src + '")';
  }
  const nodes = root.querySelectorAll<HTMLElement>('[data-imgnode]');
  for (const el of Array.from(nodes)) {
    if ((el as any).__hyn) continue;
    (el as any).__hyn = 1;
    const k = el.getAttribute('data-imgnode')!;
    const fb = el.getAttribute('data-imgfb') || '';
    const rec = await getImage(activeProjectId, k);
    const src = rec?.url || fb;
    if (src) {
      try {
        el.setAttributeNS('http://www.w3.org/1999/xlink', 'href', src);
      } catch {
        /* older SVG */
      }
      el.setAttribute('href', src);
      el.closest('.gnode')?.classList.add('hasimg');
    }
  }
}

/* ---------------- full-size viewer ---------------- */

let overlay: HTMLElement | null = null;
let overlayUrl: string | null = null;

function closeViewer() {
  if (overlayUrl) {
    URL.revokeObjectURL(overlayUrl);
    overlayUrl = null;
  }
  overlay?.remove();
  overlay = null;
  document.removeEventListener('keydown', onViewerKey);
}

function onViewerKey(e: KeyboardEvent) {
  if (e.key === 'Escape') closeViewer();
}

/** Open a photo at full size. Shows the thumbnail immediately so there is never a blank frame, then
 *  swaps in the full copy — from this device if it is already here, otherwise downloading it once
 *  and keeping it. If photo sync is off or the full copy never made it up, the thumbnail stands. */
export async function showFullImage(entityId: string): Promise<void> {
  const rec = await getImage(activeProjectId, entityId);
  if (!rec) return;
  closeViewer();

  overlay = document.createElement('div');
  overlay.className = 'imgview';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Photo');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(0,0,0,.86);padding:2rem;cursor:zoom-out;';

  const img = document.createElement('img');
  img.alt = rec.caption || '';
  img.src = rec.url;
  img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;box-shadow:0 8px 40px rgba(0,0,0,.6);';
  overlay.appendChild(img);

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.title = 'Close (Esc)';
  close.style.cssText =
    'position:absolute;top:1rem;right:1.25rem;font-size:2rem;line-height:1;background:none;' +
    'border:none;color:#fff;cursor:pointer;opacity:.8;';
  close.addEventListener('click', closeViewer);
  overlay.appendChild(close);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target === img) closeViewer();
  });
  document.addEventListener('keydown', onViewerKey);
  document.body.appendChild(overlay);

  const opened = overlay;
  let blob = rec.full ?? null;
  if (!blob) {
    blob = await fetchFullImageBytes(activeProjectId, entityId);
    if (blob) await putImageFull(activeProjectId, entityId, blob);
  }
  // The viewer may have been closed (or reopened on another photo) while that was in flight.
  if (blob && overlay === opened) {
    overlayUrl = URL.createObjectURL(blob);
    img.src = overlayUrl;
  }
}

/* ---------------- picking ---------------- */

let fileInput: HTMLInputElement | null = null;
let targetSlot: HTMLElement | null = null;

function ensureInput() {
  if (fileInput) return fileInput;
  fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  fileInput.addEventListener('change', async () => {
    const f = fileInput!.files?.[0];
    if (f && targetSlot) await applyFile(f, targetSlot);
    fileInput!.value = '';
  });
  return fileInput;
}

async function applyFile(file: File, el: HTMLElement) {
  const rendered = await renderSizes(file);
  if (!rendered) return;
  const k = el.getAttribute('data-imgslot')!;
  await putImage({
    projectId: activeProjectId,
    entityId: k,
    url: rendered.thumb,
    full: rendered.full ?? undefined,
  });
  (el as any).__hy = 1;
  showSlot(el, rendered.thumb, true);
}

/** Handle a click that landed on (or inside) an image slot. Returns true if handled.
 *  Remove → "×". Replace → the "change" label. Anything else on a filled slot → view it full size.
 *  An empty slot opens the picker, so adding a first photo is still one click. */
export async function handleImageClick(e: MouseEvent): Promise<boolean> {
  const target = e.target as HTMLElement;

  const rm = target.closest('.imgrm');
  if (rm) {
    e.stopPropagation();
    e.preventDefault();
    const el = rm.closest<HTMLElement>('[data-imgslot]')!;
    await deleteImage(activeProjectId, el.getAttribute('data-imgslot')!);
    (el as any).__hy = 0;
    const fb = el.getAttribute('data-imgfb');
    if (fb) showSlot(el, fb, false);
    else clearSlot(el);
    return true;
  }

  const slot = target.closest<HTMLElement>('[data-imgslot]');
  if (!slot) return false;
  e.stopPropagation();

  const wantsReplace = !!target.closest('.imgchg');
  if (!wantsReplace && slot.classList.contains('has')) {
    e.preventDefault();
    await showFullImage(slot.getAttribute('data-imgslot')!);
    return true;
  }

  targetSlot = slot;
  ensureInput().click();
  return true;
}
