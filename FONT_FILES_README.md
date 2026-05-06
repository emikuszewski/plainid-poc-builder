# Manrope font files — manual one-time setup

The DOCX export embeds Manrope so it renders correctly on machines without it installed. You need to commit three TTF files to the repo:

## What to download

1. Visit https://fonts.google.com/specimen/Manrope
2. Click "Download all" (top right of the page)
3. Open the downloaded zip, navigate to `static/`, extract these three files:
   - `Manrope-Regular.ttf` (weight 400)
   - `Manrope-SemiBold.ttf` (weight 600)
   - `Manrope-Bold.ttf`     (weight 700)

## Where they go

Place all three in `src/assets/fonts/` of your repo:

```
src/
  assets/
    fonts/
      Manrope-Regular.ttf
      Manrope-SemiBold.ttf
      Manrope-Bold.ttf
```

## Then

```bash
npm install     # picks up the new jszip dep
git add src/assets/fonts/Manrope-*.ttf src/vite-env.d.ts src/lib/font-embed.ts
git commit -m "Embed Manrope in DOCX exports"
git push
```

Vite will bundle the TTFs as static assets; the `?url` import in `font-embed.ts` resolves to the URL where Vite serves them.

## License

Manrope ships under SIL Open Font License 1.1, which permits embedding in documents.
