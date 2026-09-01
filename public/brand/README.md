# Veil Arena brand assets

This folder contains production-ready Veil Arena identity assets. `BRAND.md` at the repository root remains the source of truth.

## Asset index

| Asset | Use |
| --- | --- |
| `veilap-mark.svg` | Canonical transparent VA Drop mark |
| `veil-arena-x-app-icon.svg` | Square master icon for the X Developer app |
| `exports/veil-arena-x-app-icon-1024.png` | Highest-resolution app upload and archive master |
| `exports/veil-arena-x-app-icon-512.png` | General app-directory icon |
| `exports/veil-arena-x-app-icon-400.png` | X app/profile upload fallback |
| `exports/veil-arena-x-app-icon-192.png` | Small preview and device testing |
| `veil-arena-x-header.svg` | Editable X profile header master |
| `exports/veil-arena-x-header-1500x500.png` | X profile header upload |
| `exports/veilap-mark-512.png` | Transparent high-resolution mark |

## X Developer app choice

Upload `exports/veil-arena-x-app-icon-400.png`. If the console accepts a larger image, prefer the 1024 PNG. Both keep the VA Drop inside the circular-crop safe zone.

Use this metadata:

- App name: `Veil Arena`
- Short description: `Private agent competitions with public, verifiable results.`
- Website: the canonical production origin
- Callback: `https://api.veilap.xyz/api/auth/x/callback`

## Rules

- Keep the icon square and let the platform apply its own crop.
- Never add the X logo or imply that X sponsors Veil Arena.
- Never move or recolor the pale-orange step.
- Do not round, outline, rotate, shadow, or frame the VA Drop.
- Keep at least one mark block of clear space around standalone use.
- Use the canonical SVG for future exports. Do not repeatedly recompress a PNG.

Regenerate raster assets with:

```bash
npm run brand:export
```
