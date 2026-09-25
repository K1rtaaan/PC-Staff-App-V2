/* PCR Staff App V2 — self-hosted Tailwind build (2.10.0). Same theme as the old CDN inline config.
 * Scans public/index.html (markup + class strings inside the inline JS). Rebuild after adding classes:
 *   cd tools && npm install && npm run build
 */
module.exports = {
  content: ['../public/index.html'],
  safelist: [
    // toggled from JS / status helpers — keep even if a future edit builds them dynamically
    'hidden', 'text-teal-400', 'text-red-400', 'text-emerald-400', 'text-amber-300', 'text-rose-300'
  ],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#060d18', 900: '#0a1628', 800: '#0f2137', 700: '#16304d' },
        teal: { 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e' },
        sand: { 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1' },
        gold: { 400: '#e0c36a', 500: '#c9a227', 600: '#a8841a' }
      },
      fontFamily: { sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'] }
    }
  }
};
