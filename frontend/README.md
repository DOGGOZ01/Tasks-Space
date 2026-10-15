# Tasks Space frontend

React + TypeScript client built with Vite. The board editor is built on
[craft.js](https://craft.js.org/).

## Setup

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`. The API is expected on `http://localhost:8000`
(see `src/lib/api.ts`). To point it elsewhere:

```
VITE_API_BASE_URL=http://localhost:8000
```

An empty value means "same host as the page", which is what the Docker build uses
behind nginx.

Use `localhost` (not `127.0.0.1`) for both dev servers. The browser treats them as
different hosts, so the auth cookies would not be sent back.

## Scripts

```bash
npm run dev      # dev server
npm run build    # type check and production build into dist/
npm run lint     # oxlint
```

## Structure

- `src/pages/` login, registration and the board page
- `src/context/AuthContext.tsx` auth state. Requests use httpOnly cookies, and
  `src/lib/api.ts` refreshes the token once on a 401.
- `src/board/BoardCanvas.tsx` the editor: top bar, desktop and phone canvases,
  autosave of every board field
- `src/board/BlockShell.tsx` the frame around every block: drag, resize, the
  block menu and its style panels
- `src/board/blocks/` block types: daily, weekly and overdue tasks, note, image,
  custom HTML
- `src/board/ai/` the AI assistant: chat panel, providers, tool definitions and
  the encrypted key store

## Board

The desktop board is 1440×900 and the phone board 390×1600. They are separate
craft.js trees saved to separate fields, so editing one never changes the other.
A phone can only edit the phone board.

Every change is saved automatically with a short delay per field. Undo and redo
come from craft.js history, which is cleared after the board loads.

## Custom HTML and fonts

Custom HTML blocks, animated backgrounds and overlays are not rendered with
`srcDoc`. `useRenderPreviewUrl` posts the HTML to `/api/render-preview/` and shows
the returned URL in a sandboxed iframe, so the document gets its own CSP from the
backend. Scripts only run with `ALLOW_CUSTOM_SCRIPTS=True` on the server.

`useGoogleFonts` looks for `font-family` names in the board styles and loads them
from Google Fonts. Standard families like `Arial` or `monospace` are skipped. A
font used only from a canvas script (`ctx.font`) is not detected unless it also
appears in a CSS `font-family`.

## AI assistant

The assistant edits the board through five tools: `set_background`,
`set_header_style`, `add_block`, `update_block` and `remove_block`. Every tool call
is checked again in `applyToolCalls.tsx` before it touches the board, and the
server sanitizes the result like any other edit.

With a personal key, the key is encrypted with a passphrase (AES-GCM, PBKDF2) and
stored in IndexedDB. Requests go from the browser straight to the provider. With
the server key, requests go through `/api/ai/chat/`.

## Production

The auth cookies are `SameSite=Lax`, so the frontend and the API must be on the same
site, for example both behind one domain with a reverse proxy.
