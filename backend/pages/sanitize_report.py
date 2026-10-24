import re

import tinycss2
from django.conf import settings

from .sanitize import sanitize_animation_css, sanitize_custom_block_css, sanitize_custom_html

_TAG_RE = re.compile(r"<\s*([a-zA-Z][a-zA-Z0-9-]*)")
_STYLE_TAG_RE = re.compile(r"<style\b[^>]*>(.*?)</style\s*>", re.IGNORECASE | re.DOTALL)
_STYLE_ATTR_RE = re.compile(r"""\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')""", re.IGNORECASE)


def _declaration_names(content) -> set[str]:
    if content is None:
        return set()
    try:
        declarations = tinycss2.parse_declaration_list(content, skip_whitespace=True, skip_comments=True)
    except Exception:
        return set()
    return {decl.lower_name for decl in declarations if decl.type == "declaration"}


def _stylesheet_parts(css: str) -> tuple[set[str], set[str]]:
    properties: set[str] = set()
    selectors: set[str] = set()
    try:
        rules = tinycss2.parse_stylesheet(css, skip_whitespace=True, skip_comments=True)
    except Exception:
        return properties, selectors
    for rule in rules:
        if rule.type == "qualified-rule":
            selectors.add(tinycss2.serialize(rule.prelude).strip())
            properties |= _declaration_names(rule.content)
        elif rule.type == "at-rule" and rule.lower_at_keyword == "keyframes" and rule.content is not None:
            try:
                steps = tinycss2.parse_rule_list(rule.content, skip_whitespace=True, skip_comments=True)
            except Exception:
                continue
            for step in steps:
                if step.type == "qualified-rule":
                    properties |= _declaration_names(step.content)
    return properties, selectors


def _html_parts(html: str) -> tuple[set[str], set[str]]:
    tags = {name.lower() for name in _TAG_RE.findall(html)}
    properties: set[str] = set()
    for css in _STYLE_TAG_RE.findall(html):
        properties |= _stylesheet_parts(css)[0]
    for double_quoted, single_quoted in _STYLE_ATTR_RE.findall(html):
        properties |= _declaration_names(double_quoted or single_quoted)
    return tags, properties


def sanitize_report(kind: str, value: str) -> dict:
    if kind == "html":
        sanitized = sanitize_custom_html(value)
        before_tags, before_props = _html_parts(value)
        after_tags, after_props = _html_parts(sanitized)
        return {
            "dropped_tags": sorted(before_tags - after_tags),
            "dropped_properties": sorted(before_props - after_props),
            "dropped_selectors": [],
            "truncated": len(value) > settings.MAX_CUSTOM_HTML_LENGTH,
        }
    if kind == "customCss":
        sanitized = sanitize_custom_block_css(value)
        return {
            "dropped_tags": [],
            "dropped_properties": sorted(_declaration_names(value) - _declaration_names(sanitized)),
            "dropped_selectors": [],
            "truncated": len(value) > settings.MAX_CUSTOM_CSS_LENGTH,
        }
    sanitized = sanitize_animation_css(value)
    before_props, before_selectors = _stylesheet_parts(value)
    after_props, after_selectors = _stylesheet_parts(sanitized)
    return {
        "dropped_tags": [],
        "dropped_properties": sorted(before_props - after_props),
        "dropped_selectors": sorted(before_selectors - after_selectors),
        "truncated": len(value) > settings.MAX_CUSTOM_CSS_LENGTH,
    }
