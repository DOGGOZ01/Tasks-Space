import json

import requests

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"

REQUEST_TIMEOUT_SECONDS = 60


class ProviderRequestError(Exception):
    pass


def _read_error_message(response):
    try:
        body = response.json()
    except ValueError:
        return f"HTTP {response.status_code}"
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict) and error.get("message"):
            return error["message"]
        if body.get("message"):
            return body["message"]
    return f"HTTP {response.status_code}"


def _to_anthropic_messages(conversation):
    messages = []
    for entry in conversation:
        kind = entry.get("kind")
        if kind == "user":
            messages.append({"role": "user", "content": entry.get("content") or ""})
        elif kind == "assistant":
            blocks = []
            content = entry.get("content") or ""
            if content:
                blocks.append({"type": "text", "text": content})
            for call in entry.get("toolCalls") or []:
                blocks.append(
                    {
                        "type": "tool_use",
                        "id": call.get("id"),
                        "name": call.get("name"),
                        "input": call.get("arguments") or {},
                    }
                )
            messages.append({"role": "assistant", "content": blocks})
        elif kind == "tool_results":
            messages.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": r.get("callId"),
                            "content": r.get("output") or "",
                            "is_error": bool(r.get("isError")),
                        }
                        for r in entry.get("results") or []
                    ],
                }
            )
    return messages


def _send_anthropic(api_key, model, system_prompt, conversation, tools):
    try:
        response = requests.post(
            ANTHROPIC_URL,
            headers={
                "content-type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": model,
                "max_tokens": 4096,
                "system": system_prompt,
                "messages": _to_anthropic_messages(conversation),
                "tools": [
                    {"name": t["name"], "description": t["description"], "input_schema": t["parameters"]}
                    for t in tools
                ],
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise ProviderRequestError(f"Couldn't reach Anthropic's API: {exc}") from exc

    if not response.ok:
        raise ProviderRequestError(_read_error_message(response))

    data = response.json()
    content = data.get("content") or []
    assistant_text = "\n".join(block.get("text", "") for block in content if block.get("type") == "text")
    tool_calls = [
        {"id": block.get("id"), "name": block.get("name"), "arguments": block.get("input") or {}}
        for block in content
        if block.get("type") == "tool_use"
    ]
    return assistant_text, tool_calls


def _to_openai_messages(conversation):
    messages = []
    for entry in conversation:
        kind = entry.get("kind")
        if kind == "user":
            messages.append({"role": "user", "content": entry.get("content") or ""})
        elif kind == "assistant":
            tool_calls = entry.get("toolCalls") or []
            message = {"role": "assistant", "content": entry.get("content") or None}
            if tool_calls:
                message["tool_calls"] = [
                    {
                        "id": call.get("id"),
                        "type": "function",
                        "function": {
                            "name": call.get("name"),
                            "arguments": json.dumps(call.get("arguments") or {}),
                        },
                    }
                    for call in tool_calls
                ]
            messages.append(message)
        elif kind == "tool_results":
            for r in entry.get("results") or []:
                messages.append({"role": "tool", "tool_call_id": r.get("callId"), "content": r.get("output") or ""})
    return messages


def _send_openai_compatible(url, api_key, model, system_prompt, conversation, tools):
    try:
        response = requests.post(
            url,
            headers={"content-type": "application/json", "authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    *_to_openai_messages(conversation),
                ],
                "tools": [
                    {
                        "type": "function",
                        "function": {
                            "name": t["name"],
                            "description": t["description"],
                            "parameters": t["parameters"],
                        },
                    }
                    for t in tools
                ],
                "tool_choice": "auto",
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise ProviderRequestError(f"Couldn't reach the provider's API: {exc}") from exc

    if not response.ok:
        raise ProviderRequestError(_read_error_message(response))

    data = response.json()
    choices = data.get("choices") or [{}]
    message = choices[0].get("message") or {}
    tool_calls = []
    for call in message.get("tool_calls") or []:
        fn = call.get("function") or {}
        try:
            arguments = json.loads(fn.get("arguments") or "{}")
        except (TypeError, ValueError):
            arguments = {}
        tool_calls.append({"id": call.get("id"), "name": fn.get("name"), "arguments": arguments})
    return message.get("content") or "", tool_calls


def send_chat(provider, api_key, model, system_prompt, conversation, tools):
    if provider == "anthropic":
        return _send_anthropic(api_key, model, system_prompt, conversation, tools)
    if provider == "openai":
        return _send_openai_compatible(OPENAI_URL, api_key, model, system_prompt, conversation, tools)
    if provider == "deepseek":
        return _send_openai_compatible(DEEPSEEK_URL, api_key, model, system_prompt, conversation, tools)
    raise ProviderRequestError(f'Unknown provider "{provider}".')
