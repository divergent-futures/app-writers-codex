/* Writer's Codex — in-app photo layer (project-scoped).
 *
 * Ports the prototype's browser-local image slots to the app's `images` store, keyed per project.
 * The engine emits slots as `<div data-imgslot="type:id">`; after each render the Codex shell calls
 * hydrateImages() to fill them, and delegates clicks to pickImage() to add/replace a photo
 * (downscaled to a small webp data URI, stored locally — nothing leaves the device).
 */

import { deleteImage, getImage, putImage } from './db';

let activeProjectId = '';
export function setImageProject(id: string) {
  activeProjectId = id;
}

/** Downscale a File to a webp data URI (max edge `max` px). Falls back to the raw data URL. */
function downscale(file: File, max = 320): Promise<string | null> {
  return new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const w = im.width, h = im.height;
        const sc = Math.min(1, max / Math.max(w || 1, h || 1));
        const cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
        const cv = document.createElement('canvas');
        cv.width = cw;
        cv.height = ch;
        try {
          cv.getContext('2d')!.drawImage(im, 0, 0, cw, ch);
          res(cv.toDataURL('image/webp', 0.85));
        } catch {
          res(fr.result as string);
        }
      };
      im.onerror = () => res(fr.result as string);
      im.src = fr.result as string;
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
  const url = await downscale(file, 320);
  if (!url) return;
  const k = el.getAttribute('data-imgslot')!;
  await putImage({ projectId: activeProjectId, entityId: k, url });
  (el as any).__hy = 1;
  showSlot(el, url, true);
}

/** Handle a click that landed on (or inside) an image slot. Returns true if handled. */
export async function handleImageClick(e: MouseEvent): Promise<boolean> {
  const rm = (e.target as HTMLElement).closest('.imgrm');
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
  const slot = (e.target as HTMLElement).closest<HTMLElement>('[data-imgslot]');
  if (slot) {
    e.stopPropagation();
    targetSlot = slot;
    ensureInput().click();
    return true;
  }
  return false;
}
