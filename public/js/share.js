// Photo helpers: downsize camera photos for the AI, and add the "Made with Fridge Fit" tag for sharing.
async function loadBitmap(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall back */ }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function fit(w, h, max) {
  const s = Math.min(1, max / Math.max(w, h));
  return [Math.round(w * s), Math.round(h * s)];
}

/** Resize to a JPEG data URL (long edge <= max). */
export async function resizeToDataUrl(file, max = 1280, quality = 0.8) {
  const bmp = await loadBitmap(file);
  const [w, h] = fit(bmp.width, bmp.height, max);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  return c.toDataURL('image/jpeg', quality);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Tiny fridge logo, drawn with canvas so the tag needs no image file. */
function drawLogo(ctx, x, y, s) {
  ctx.fillStyle = '#ff6b4a'; roundRect(ctx, x, y, s, s, s * 0.28); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.08; ctx.lineJoin = 'round';
  roundRect(ctx, x + s * 0.27, y + s * 0.16, s * 0.46, s * 0.68, s * 0.08); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + s * 0.27, y + s * 0.42); ctx.lineTo(x + s * 0.73, y + s * 0.42); ctx.stroke();
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + s * 0.62, y + s * 0.26); ctx.lineTo(x + s * 0.62, y + s * 0.34); ctx.moveTo(x + s * 0.62, y + s * 0.52); ctx.lineTo(x + s * 0.62, y + s * 0.64); ctx.stroke();
}

/** Returns { blob, dataUrl } of the photo with a small "Made with Fridge Fit" tag in the bottom-right corner. */
export async function composeShareImage(file, max = 1440) {
  const bmp = await loadBitmap(file);
  const [w, h] = fit(bmp.width, bmp.height, max);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(bmp, 0, 0, w, h);

  const u = Math.max(14, Math.round(Math.min(w, h) * 0.034)); // tag scale
  const label = 'Made with Fridge Fit';
  ctx.font = `800 ${u}px "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif`;
  const tw = ctx.measureText(label).width;
  const pad = u * 0.55, logo = u * 1.9;
  const bw = pad + logo + u * 0.5 + tw + pad * 1.2, bh = logo + pad * 0.9;
  const margin = u * 0.9, bx = w - bw - margin, by = h - bh - margin;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = u * 0.6; ctx.shadowOffsetY = u * 0.15;
  ctx.fillStyle = 'rgba(255,255,255,.92)'; roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.fill();
  ctx.restore();
  drawLogo(ctx, bx + pad * 0.6, by + (bh - logo) / 2, logo);
  ctx.fillStyle = '#3a2a20'; ctx.textBaseline = 'middle';
  ctx.fillText(label, bx + pad * 0.6 + logo + u * 0.5, by + bh / 2 + u * 0.04);

  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
  return { blob, dataUrl: c.toDataURL('image/jpeg', 0.88), width: w, height: h };
}

/** Downscale a data URL for storing in localStorage. */
export function thumbnail(dataUrl, max = 360, quality = 0.7) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const [w, h] = fit(img.width, img.height, max);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/** Share via the native sheet when possible, otherwise download. Returns 'shared' | 'saved' | 'cancelled'. */
export async function shareImage(blob, title) {
  const file = new File([blob], 'made-with-fridge-fit.jpg', { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Made with Fridge Fit', text: `I just made ${title}! 🍽️ Made with Fridge Fit` });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'made-with-fridge-fit.jpg';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'saved';
}
