import re
import secrets

import bleach
import tinycss2
from bleach.css_sanitizer import CSSSanitizer
from django.conf import settings

CUSTOM_HTML_BLOCK_NAMES = {"CustomHtmlBlock"}

ALLOWED_TAGS = [
    "div", "span", "p", "br", "hr", "b", "i", "u", "s", "strong", "em", "small",
    "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "a", "img",
    "blockquote", "code", "pre", "table", "thead", "tbody", "tr", "td", "th",
    "style",
]

# Only appended to ALLOWED_TAGS when settings.ALLOW_CUSTOM_SCRIPTS is on --
# see that setting for why this is off by default.
SCRIPT_TAG = ["script"]

ALLOWED_ATTRIBUTES = {
    "*": ["class", "style", "id", "title", "align"],
    "a": ["href", "target", "rel"],
    "img": ["src", "alt", "width", "height"],
}

ALLOWED_PROTOCOLS = ["http", "https", "data"]

ALLOWED_CSS_PROPERTIES = [
    "color", "background", "background-color", "background-image", "background-position",
    "background-size", "background-repeat", "border", "border-radius", "border-color",
    "border-style", "border-width", "margin", "padding", "font", "font-family", "font-size",
    "font-weight", "font-style", "text-align", "text-decoration", "text-shadow", "line-height",
    "width", "height", "max-width", "max-height", "min-width", "min-height", "display",
    "opacity", "filter", "box-shadow", "letter-spacing", "white-space", "overflow",
    "position", "top", "left", "right", "bottom", "z-index", "transform", "cursor",
    "vertical-align", "list-style", "list-style-type", "gap", "flex", "flex-direction",
    "align-items", "justify-content", "grid-template-columns", "grid-gap",
]

_css_sanitizer = CSSSanitizer(allowed_css_properties=ALLOWED_CSS_PROPERTIES)
_ALLOWED_CSS_PROPERTIES_SET = set(ALLOWED_CSS_PROPERTIES)

BLOCK_STYLE_CSS_PROPERTIES = [
    "color", "background", "background-color", "background-image", "background-position",
    "background-size", "background-repeat", "border", "border-radius", "border-color",
    "border-style", "border-width", "font", "font-family", "font-size", "font-weight",
    "font-style", "text-align", "text-decoration", "text-shadow", "line-height",
    "opacity", "filter", "box-shadow", "letter-spacing", "text-transform", "padding",
]

_block_style_css_sanitizer = CSSSanitizer(allowed_css_properties=BLOCK_STYLE_CSS_PROPERTIES)

BACKGROUND_CSS_PROPERTIES = [
    "background", "background-color", "background-image", "background-position",
    "background-size", "background-repeat", "background-attachment", "filter", "opacity",
]

_background_css_sanitizer = CSSSanitizer(allowed_css_properties=BACKGROUND_CSS_PROPERTIES)

HEX_COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
SAFE_URL_RE = re.compile(r"^(https?://|/)", re.IGNORECASE)

_STYLE_TAG_RE = re.compile(r"(<style\b[^>]*>)(.*?)(</style>)", re.IGNORECASE | re.DOTALL)
_UNSAFE_CSS_VALUE_RE = re.compile(r"expression\(|-moz-binding|behavior\s*:|javascript:", re.IGNORECASE)
_CSS_URL_RE = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.IGNORECASE)


def _is_safe_css_url_value(value: str) -> bool:
    for match in _CSS_URL_RE.finditer(value):
        target = match.group(2).strip().lower()
        if not (target.startswith("data:image/") or target.startswith("/") or target.startswith("https://")):
            return False
    return True


def _is_safe_css_value(value: str) -> bool:
    if _UNSAFE_CSS_VALUE_RE.search(value):
        return False
    if "url(" in value.lower() and not _is_safe_css_url_value(value):
        return False
    return True


def sanitize_style_tag_css(raw_css: str) -> str:
    if not raw_css:
        return ""

    rules = tinycss2.parse_stylesheet(raw_css, skip_whitespace=True, skip_comments=True)
    kept_rules = []
    for rule in rules:
        if rule.type != "qualified-rule":
            continue
        selector = tinycss2.serialize(rule.prelude).strip()
        if not selector:
            continue
        try:
            declarations = tinycss2.parse_declaration_list(
                rule.content, skip_whitespace=True, skip_comments=True
            )
        except Exception:
            continue

        kept_declarations = []
        for decl in declarations:
            if decl.type != "declaration":
                continue
            prop = decl.lower_name
            if prop not in _ALLOWED_CSS_PROPERTIES_SET:
                continue
            value = tinycss2.serialize(decl.value).strip()
            if not value or not _is_safe_css_value(value):
                continue
            important = " !important" if decl.important else ""
            kept_declarations.append(f"{prop}: {value}{important}")

        if kept_declarations:
            kept_rules.append(f"{selector} {{ {'; '.join(kept_declarations)}; }}")

    return "\n".join(kept_rules)


def _sanitize_style_tags(html: str) -> str:
    def _replace(match: re.Match) -> str:
        open_tag, content, close_tag = match.group(1), match.group(2), match.group(3)
        return f"{open_tag}{sanitize_style_tag_css(content)}{close_tag}"

    return _STYLE_TAG_RE.sub(_replace, html)


_SCRIPT_BLOCK_RE = re.compile(r"<script\b[^>]*>(.*?)</script\s*>", re.IGNORECASE | re.DOTALL)
_SCRIPT_CLOSE_RE = re.compile(r"</script", re.IGNORECASE)


def sanitize_custom_html(raw_html: str) -> str:
    if not raw_html:
        return ""
    raw_html = raw_html[: settings.MAX_CUSTOM_HTML_LENGTH]
    tags = ALLOWED_TAGS + SCRIPT_TAG if settings.ALLOW_CUSTOM_SCRIPTS else ALLOWED_TAGS

    extracted_scripts: list[str] = []
    token = secrets.token_hex(8) if settings.ALLOW_CUSTOM_SCRIPTS else None
    if token:
        def _extract(match: re.Match) -> str:
            index = len(extracted_scripts)
            body = _SCRIPT_CLOSE_RE.sub("", match.group(1))
            extracted_scripts.append(body)
            return f"<script>scriptplaceholder{token}_{index}</script>"

        raw_html = _SCRIPT_BLOCK_RE.sub(_extract, raw_html)

    cleaned = bleach.clean(
        raw_html,
        tags=tags,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        css_sanitizer=_css_sanitizer,
        strip=True,
        strip_comments=True,
    )
    cleaned = _sanitize_style_tags(cleaned)

    if extracted_scripts:
        placeholder_re = re.compile(rf"scriptplaceholder{token}_(\d+)")
        cleaned = placeholder_re.sub(lambda m: extracted_scripts[int(m.group(1))], cleaned)

    return cleaned


def _is_custom_html_node(node: dict) -> bool:
    node_type = node.get("type")
    if isinstance(node_type, dict) and node_type.get("resolvedName") in CUSTOM_HTML_BLOCK_NAMES:
        return True
    return node.get("displayName") in CUSTOM_HTML_BLOCK_NAMES


def sanitize_custom_block_css(raw_css: str) -> str:
    if not raw_css:
        return ""
    raw_css = raw_css[: settings.MAX_CUSTOM_CSS_LENGTH]
    return _block_style_css_sanitizer.sanitize_css(raw_css)


def _clean_hex_color(value) -> str:
    if isinstance(value, str) and HEX_COLOR_RE.match(value):
        return value
    return ""


def _clean_number(value, minimum, maximum):
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return max(minimum, min(maximum, number))


def sanitize_block_style(style) -> dict:
    if not isinstance(style, dict):
        return {}

    cleaned = {}

    background = _clean_hex_color(style.get("background"))
    if background:
        cleaned["background"] = background
    text_color = _clean_hex_color(style.get("textColor"))
    if text_color:
        cleaned["textColor"] = text_color
    border_color = _clean_hex_color(style.get("borderColor"))
    if border_color:
        cleaned["borderColor"] = border_color

    border_radius = _clean_number(style.get("borderRadius"), 0, 60)
    if border_radius is not None:
        cleaned["borderRadius"] = border_radius
    border_width = _clean_number(style.get("borderWidth"), 0, 12)
    if border_width is not None:
        cleaned["borderWidth"] = border_width
    opacity = _clean_number(style.get("opacity"), 0.1, 1)
    if opacity is not None:
        cleaned["opacity"] = opacity

    custom_css = style.get("customCss")
    if isinstance(custom_css, str) and custom_css:
        sanitized_css = sanitize_custom_block_css(custom_css)
        if sanitized_css:
            cleaned["customCss"] = sanitized_css

    return cleaned


def sanitize_background_css(raw_css: str) -> str:
    if not raw_css:
        return ""
    raw_css = raw_css[: settings.MAX_CUSTOM_CSS_LENGTH]
    return _background_css_sanitizer.sanitize_css(raw_css)


BOARD_BACKGROUND_TYPES = {"color", "image", "custom", "html"}
BOARD_BACKGROUND_IMAGE_FITS = {"cover", "contain", "repeat"}


def sanitize_board_background(value) -> dict:
    if not isinstance(value, dict):
        return {}

    bg_type = value.get("type")
    if bg_type not in BOARD_BACKGROUND_TYPES:
        return {}

    cleaned = {"type": bg_type}

    if bg_type == "color":
        color = _clean_hex_color(value.get("color"))
        if color:
            cleaned["color"] = color

    elif bg_type == "image":
        image_url = value.get("imageUrl")
        if isinstance(image_url, str) and len(image_url) <= 2000 and SAFE_URL_RE.match(image_url):
            cleaned["imageUrl"] = image_url
        image_fit = value.get("imageFit")
        if image_fit in BOARD_BACKGROUND_IMAGE_FITS:
            cleaned["imageFit"] = image_fit

    elif bg_type == "html":
        html = value.get("html")
        if isinstance(html, str) and html:
            sanitized_html = sanitize_custom_html(html)
            if sanitized_html:
                cleaned["html"] = sanitized_html

    custom_css = value.get("customCss")
    if isinstance(custom_css, str) and custom_css:
        sanitized_css = sanitize_background_css(custom_css)
        if sanitized_css:
            cleaned["customCss"] = sanitized_css

    return cleaned


HEADER_STYLE_TARGETS = {"edit", "logout", "username"}


def sanitize_header_style(value) -> dict:
    if not isinstance(value, dict):
        return {}

    cleaned = {}
    for target in HEADER_STYLE_TARGETS:
        if target not in value:
            continue
        sub_style = sanitize_block_style(value.get(target))
        if sub_style:
            cleaned[target] = sub_style
    return cleaned


def sanitize_layout(layout: dict) -> dict:
    if not isinstance(layout, dict):
        return layout

    for node in layout.values():
        if not isinstance(node, dict):
            continue
        if _is_custom_html_node(node):
            html_props = node.get("props")
            if isinstance(html_props, dict) and isinstance(html_props.get("html"), str):
                html_props["html"] = sanitize_custom_html(html_props["html"])

        props = node.get("props")
        if isinstance(props, dict) and "style" in props:
            props["style"] = sanitize_block_style(props["style"])

    return layout
