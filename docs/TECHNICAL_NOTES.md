# Technical notes

## Content Security Policy split

The `Content-Security-Policy` header is set in two places on purpose.

- **nginx** sets the strict, site-wide CSP at the `server {}` level (`nginx/snippets/app-locations.conf`). It uses `script-src 'self'` with no `unsafe-inline`. `style-src` does allow `'unsafe-inline'`, because React's inline `style={{}}` needs it. This is the policy a security scanner sees on the main page.
- **Django** sets its own CSP per response, but only for `/api/render-preview/` (`build_preview_csp()` in `backend/pages/render_preview.py`). It allows `script-src 'unsafe-inline'` only when `ALLOW_CUSTOM_SCRIPTS=True`, and the flag is checked on every request.

That endpoint serves the content of custom HTML blocks, animated backgrounds and animation overlays. It's a real HTTP response with its own headers, not an iframe `srcDoc`. A `srcDoc` document inherits the parent page's CSP, so this content can't run under nginx's blanket policy.

To keep nginx from overriding Django's CSP on that path, `/api/render-preview/` has its own, more specific `location` block. It re-declares every other `add_header` it needs but leaves out `Content-Security-Policy` and `X-Frame-Options`. nginx's `add_header` inheritance is all-or-nothing per location. Once a location declares any `add_header`, it stops inheriting all of them from the parent block. nginx also never strips headers already present on a proxied response, so Django's own CSP passes through untouched.

If you add a new site-wide header, add it to the render-preview location too. CSP and `X-Frame-Options` are the exceptions.

## Security headers

`nginx/snippets/app-locations.conf` sends these headers on every response:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`

`img-src` and `font-src` also allow `data:` and `blob:`, which the board's image and GIF features need.

To check a deployment:

- https://securityheaders.com gives a quick A–F grade on HTTP security headers.
- https://developer.mozilla.org/en-US/observatory runs Mozilla's HTTP Observatory, which scores CSP more strictly.

Both scan only the URL you give them, usually the main page. They don't check sub-paths like `/api/render-preview/`, whose CSP is intentionally different.

## Proxy headers

- nginx forwards `Host $http_host`, not `$host`. `$host` drops the port, so on a non-default port the backend would generate image URLs on the wrong origin and the CSP would block them.
- `X-Forwarded-Proto` passes through whatever the upstream host nginx set. If nothing upstream set it, nginx uses its own scheme. Django trusts this header only when `COOKIE_SECURE=True`. That's domain mode, where the container listens on loopback only.
- Saved-design image URLs are built from `FRONTEND_ORIGIN`, never from the request's `Host`. They get stored, so they must not depend on client input.

## Don't read `request.body` after authentication

`CookieJWTAuthentication.enforce_csrf` (`backend/accounts/authentication.py`) reads `request.POST` during the CSRF check on every unsafe-method request. That consumes the request stream. Any later `request.body` access in the view raises `RawPostDataException`. For request-size guards, use `request.META.get("CONTENT_LENGTH")` instead, as `_content_length_exceeds` in `backend/pages/views.py` does.

## Sanitization runs on read, too

Board layouts, backgrounds, header styles and saved designs are sanitized on write **and** re-sanitized on every read, using the current settings. That's what makes `ALLOW_CUSTOM_SCRIPTS` a real kill switch. Turn it off, and scripts that were saved while it was on stop being served immediately.
