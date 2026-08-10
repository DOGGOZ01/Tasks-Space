import json

from django.conf import settings

_BRIDGE_SCRIPT = """<script>
window.addEventListener('message', function (e) {
  if (e.source !== window.parent) return;
  if (!e.data || e.data.source !== 'board-overlay-trigger') return;
  window.dispatchEvent(new CustomEvent('board:trigger', { detail: { event: e.data.event, active: e.data.active } }));
});
</script>"""


def _serialize_for_script_tag(data) -> str:
    return json.dumps(data).replace("<", "\\u003c")


def build_html_block_document(html: str, allow_scripts: bool, task_data: dict | None) -> str:
    data_script = ""
    if allow_scripts and task_data:
        data_script = f"<script>window.taskBoardData = {_serialize_for_script_tag(task_data)};</script>"
    return (
        '<!doctype html><html><head><meta charset="utf-8">'
        f"{data_script}"
        "<style>html,body{background:transparent;}body{margin:8px;font-family:sans-serif;overflow-wrap:anywhere;}</style>"
        f"</head><body>{html}</body></html>"
    )


def build_background_document(html: str) -> str:
    return (
        '<!doctype html><html><head><meta charset="utf-8">'
        "<style>body{margin:0;font-family:sans-serif;overflow-wrap:anywhere;}</style>"
        f"</head><body>{html}</body></html>"
    )


def build_overlay_document(html: str, allow_scripts: bool) -> str:
    bridge = _BRIDGE_SCRIPT if allow_scripts else ""
    return (
        '<!doctype html><html><head><meta charset="utf-8">'
        "<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent;}</style>"
        f"{bridge}</head><body>{html}</body></html>"
    )


def build_preview_csp(allow_scripts: bool) -> str:
    script_src = "script-src 'unsafe-inline'; " if allow_scripts else ""
    ancestors = " ".join(dict.fromkeys(["'self'", *settings.CORS_ALLOWED_ORIGINS]))
    return (
        f"default-src 'none'; {script_src}style-src 'unsafe-inline'; "
        f"img-src 'self' data:; frame-ancestors {ancestors};"
    )


def build_document(kind: str, html: str, allow_scripts: bool, task_data: dict | None) -> str:
    if kind == "html_block":
        return build_html_block_document(html, allow_scripts, task_data)
    if kind == "background":
        return build_background_document(html)
    return build_overlay_document(html, allow_scripts)
