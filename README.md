# SISREG Executante

Chrome MV3 extension for SISREG executante workflow improvements.

## Runtime Files

The extension itself only needs:

- `manifest.json`
- `src/content.js`

## Main Features

- `Ja Internado` checkbox column on the `internar` list, persisted in `localStorage`
- `TRANSFERENCIAS ++` utility inside the SISREG session
- `ALTAS ++` utility with in-modal ficha viewing and AIH capture after alta
- `SAÍDA/PERMANÊNCIA` menu converted into a submenu that keeps the native entry and adds the custom utility

## Load In Chrome

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder: `C:\Users\641841401\Documents\Projetos\extensao-sisreg-executante`

When updating code:

1. Click `Reload` on the extension card
2. Refresh the SISREG page

