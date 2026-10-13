import json
import re
from urllib.parse import quote_plus

from django.conf import settings

_BRIDGE_SCRIPT = """<script>
window.addEventListener('message', function (e) {
  if (e.source !== window.parent) return;
  if (!e.data || e.data.source !== 'board-overlay-trigger') return;
  window.dispatchEvent(new CustomEvent('board:trigger', { detail: { event: e.data.event, active: e.data.active } }));
});
</script>"""

_FONT_FAMILY_RE = re.compile(r"font-family\s*:\s*([^;}{<>]+)", re.IGNORECASE)
_FONT_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$")
_MAX_FONTS = 20
_FONT_VARIANTS = "300,400,500,600,700,800,900,300italic,400italic,500italic,700italic"
_SKIPPED_FONT_FAMILIES = {
    "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif",
    "ui-monospace", "ui-rounded", "math", "emoji", "fangsong", "inherit", "initial", "unset", "revert",
    "revert-layer", "arial", "helvetica", "helvetica neue", "times", "times new roman", "courier",
    "courier new", "georgia", "verdana", "tahoma", "trebuchet ms", "impact", "segoe ui", "consolas",
    "menlo", "monaco", "apple color emoji", "segoe ui emoji", "blinkmacsystemfont", "-apple-system",
}


def _extract_font_families(html: str) -> list[str]:
    found: dict[str, str] = {}
    for match in _FONT_FAMILY_RE.finditer(html):
        for part in match.group(1).split(","):
            name = re.sub(r"!important", "", part, flags=re.IGNORECASE)
            name = name.replace("&quot;", "").replace("\\", "").replace('"', "").replace("'", "").strip()
            key = name.lower()
            if not _FONT_NAME_RE.match(name) or key in _SKIPPED_FONT_FAMILIES or key in found:
                continue
            found[key] = name
            if len(found) >= _MAX_FONTS:
                return list(found.values())
    return list(found.values())


def _google_font_links(html: str) -> str:
    return "".join(
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css'
        f'?family={quote_plus(name)}:{_FONT_VARIANTS}&amp;display=swap">'
        for name in _extract_font_families(html)
    )


def _serialize_for_script_tag(data) -> str:
    return json.dumps(data).replace("<", "\\u003c")


def build_html_block_document(html: str, allow_scripts: bool, task_data: dict | None) -> str:
    data_script = ""
    if allow_scripts and task_data:
        data_script = f"<script>window.taskBoardData = {_serialize_for_script_tag(task_data)};</script>"
    return (
        '<!doctype html><html><head><meta charset="utf-8">'
        f"{data_script}{_google_font_links(html)}"
        "<style>html,body{background:transparent;}body{margin:8px;font-family:sans-serif;overflow-wrap:anywhere;}</style>"
        f"</head><body>{html}</body></html>"
    )


def build_background_document(html: str) -> str:
    return (
        '<!doctype html><html><head><meta charset="utf-8">'
        f"{_google_font_links(html)}"
        "<style>body{margin:0;font-family:sans-serif;overflow-wrap:anywhere;}</style>"
        f"</head><body>{html}</body></html>"
    )


def build_overlay_document(html: str, allow_scripts: bool) -> str:
    bridge = _BRIDGE_SCRIPT if allow_scripts else ""
    return (
        '<!doctype html><html><head><meta charset="utf-8">'
        f"{_google_font_links(html)}"
        "<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent;}</style>"
        f"{bridge}</head><body>{html}</body></html>"
    )


def build_preview_csp(allow_scripts: bool) -> str:
    script_src = "script-src 'unsafe-inline'; " if allow_scripts else ""
    ancestors = " ".join(dict.fromkeys(["'self'", *settings.CORS_ALLOWED_ORIGINS]))
    return (
        f"default-src 'none'; {script_src}style-src 'unsafe-inline' https://fonts.googleapis.com; "
        f"font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors {ancestors};"
    )


def build_document(kind: str, html: str, allow_scripts: bool, task_data: dict | None) -> str:
    if kind == "html_block":
        return build_html_block_document(html, allow_scripts, task_data)
    if kind == "background":
        return build_background_document(html)
    return build_overlay_document(html, allow_scripts)
