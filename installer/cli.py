import typer
import questionary

from installer.core import apply, envfile, schema, validate

app = typer.Typer(add_completion=False)


@app.callback(invoke_without_command=True)
def main(ctx: typer.Context):
    if ctx.invoked_subcommand is None:
        install()


def _required(message):
    return lambda text: True if text.strip() else message


def _prompt_domain():
    mode = questionary.select(
        "How will this be hosted?",
        choices=["Local / IP only", "A real domain (needs your own nginx, see README)"],
        default="Local / IP only",
    ).ask()
    if mode is None or mode.startswith("Local"):
        return ""
    return questionary.text(
        "Domain name (e.g. example.com)", validate=_required("Domain is required")
    ).ask()


def _prompt_admin():
    username = questionary.text(
        "Admin username", validate=_required("Username is required")
    ).ask()
    password = questionary.password(
        "Admin password", validate=lambda text: True if text else "Password is required"
    ).ask()
    email = questionary.text("Admin email (optional)", default="").ask()
    return username, password, email


def _domain_port_error(text):
    if not text.strip().isdigit():
        return "Must be an integer"
    try:
        validate.validate_domain_port("domain", text)
    except validate.ValidationError as exc:
        return str(exc)
    return True


def _prompt_ports(domain):
    values = {}
    if domain:
        values["HTTP_PORT"] = questionary.text(
            "HTTP_PORT (free local port for your host nginx, not 80/443)",
            default="8080",
            validate=_domain_port_error,
        ).ask()
    else:
        values["HTTP_PORT"] = _prompt_value(
            schema.FIELDS_BY_NAME["HTTP_PORT"], schema.FIELDS_BY_NAME["HTTP_PORT"].default
        )
    values["INSTALLER_WEB_PORT"] = schema.FIELDS_BY_NAME["INSTALLER_WEB_PORT"].default
    return values


def _prompt_security_and_daylock():
    values = {}

    values["ALLOW_CUSTOM_SCRIPTS"] = str(
        questionary.confirm(
            "Let <script> tags run in Custom HTML blocks? "
            "Only for a trusted single-user instance.",
            default=False,
        ).ask()
    )
    values["ALLOW_PUBLIC_REGISTRATION"] = str(
        questionary.confirm("Allow public self-registration?", default=False).ask()
    )
    values["DAY_LOCK_MODE"] = questionary.select(
        "Day lock mode", choices=["local", "global"], default="local"
    ).ask()
    values["DAY_LOCK_TIMEZONE"] = questionary.text(
        "Day lock timezone (IANA name, e.g. Europe/Paris, America/New_York)",
        default=schema.FIELDS_BY_NAME["DAY_LOCK_TIMEZONE"].default,
    ).ask()

    return values


def _prompt_ai_assistant():
    values = {}

    ai_enabled = questionary.confirm("Enable the global AI design assistant?", default=False).ask()
    values["AI_ASSISTANT_ENABLED"] = str(ai_enabled)
    if ai_enabled:
        values["AI_ASSISTANT_PROVIDER"] = questionary.select(
            "AI provider",
            choices=list(schema.FIELDS_BY_NAME["AI_ASSISTANT_PROVIDER"].options),
            default="anthropic",
        ).ask()
        values["AI_ASSISTANT_MODEL"] = questionary.text(
            "AI model", default=schema.FIELDS_BY_NAME["AI_ASSISTANT_MODEL"].default
        ).ask()
        values["AI_ASSISTANT_API_KEY"] = questionary.password("AI provider API key").ask()
        values["AI_ASSISTANT_MAX_TOKENS"] = _prompt_value(
            schema.FIELDS_BY_NAME["AI_ASSISTANT_MAX_TOKENS"],
            schema.FIELDS_BY_NAME["AI_ASSISTANT_MAX_TOKENS"].default,
        )
        values["AI_ASSISTANT_TIMEOUT_SECONDS"] = _prompt_value(
            schema.FIELDS_BY_NAME["AI_ASSISTANT_TIMEOUT_SECONDS"],
            schema.FIELDS_BY_NAME["AI_ASSISTANT_TIMEOUT_SECONDS"].default,
        )
        values["AI_CHAT_THROTTLE_RATE"] = _prompt_value(
            schema.FIELDS_BY_NAME["AI_CHAT_THROTTLE_RATE"],
            schema.FIELDS_BY_NAME["AI_CHAT_THROTTLE_RATE"].default,
        )
        values["MAX_AI_REQUEST_BYTES"] = _prompt_value(
            schema.FIELDS_BY_NAME["MAX_AI_REQUEST_BYTES"],
            schema.FIELDS_BY_NAME["MAX_AI_REQUEST_BYTES"].default,
        )

    return values


GENERIC_INSTALL_SECTIONS = ("Auth throttling", "Render preview", "Image / GIF uploads", "Board content limits")


def _prompt_generic_sections():
    values = {}
    for section in GENERIC_INSTALL_SECTIONS:
        typer.echo(f"\n{section}")
        for field in schema.fields_in_section(section):
            values[field.name] = _prompt_value(field, field.default)
    return values


def _print_recap(field_values, admin_username):
    typer.echo("\nReview:")
    typer.echo(f"  Domain: {field_values.get('DOMAIN') or '(none, local/IP only)'}")
    typer.echo(f"  HTTP port: {field_values.get('HTTP_PORT')}")
    typer.echo(f"  Installer web port: {field_values.get('INSTALLER_WEB_PORT')}")
    typer.echo(f"  Admin username: {admin_username}")
    for section in ("Security", "Day lock", "AI assistant") + GENERIC_INSTALL_SECTIONS:
        typer.echo(f"  {section}:")
        for field in schema.fields_in_section(section):
            if field.name not in field_values:
                continue
            typer.echo(f"    {field.name} = {_display_value(field, field_values[field.name])}")


@app.command()
def install():
    field_values = {}

    field_values["DOMAIN"] = (_prompt_domain() or "").strip()

    field_values.update(_prompt_ports(field_values["DOMAIN"]))

    username, password, email = _prompt_admin()
    field_values.update(_prompt_security_and_daylock())
    field_values.update(_prompt_ai_assistant())
    field_values.update(_prompt_generic_sections())

    _print_recap(field_values, username)
    if not questionary.confirm("Install with these settings?", default=True).ask():
        typer.echo("Aborted. Nothing was written.")
        raise typer.Exit(code=1)

    try:
        values = apply.run_setup(
            field_values,
            {"username": username, "password": password, "email": email},
        )
    except (validate.ValidationError, envfile.EnvFileIsDirectory) as exc:
        typer.echo(f"Error: {exc}")
        raise typer.Exit(code=1)

    typer.echo("")
    typer.echo("Setup complete. backend/.env has been written.")
    typer.echo("Run: docker compose up -d")


def _display_value(field, value):
    if field.kind in ("secret", "secret_input"):
        return "********" if value else "(not set)"
    text = value if value != "" else "(empty)"
    if field.name in schema.DERIVED_FIELDS:
        text = f"{text} (auto-derived, not directly editable)"
    return text


def _prompt_value(field, current_value):
    if field.kind == "bool":
        result = questionary.confirm(field.name, default=current_value == "True").ask()
        return str(result)
    if field.kind == "choice":
        return questionary.select(
            field.name, choices=list(field.options), default=current_value
        ).ask()
    if field.kind == "int":
        return questionary.text(
            field.name,
            default=current_value,
            validate=lambda text: True if text.strip().lstrip("-").isdigit() else "Must be an integer",
        ).ask()
    return questionary.text(field.name, default=current_value).ask()


@app.command()
def edit():
    try:
        current = apply.current_values()
    except envfile.EnvFileIsDirectory as exc:
        typer.echo(f"Error: {exc}")
        raise typer.Exit(code=1)

    for section in schema.SECTIONS:
        typer.echo(f"\n{section}")
        for field in schema.fields_in_section(section):
            value = current.get(field.name, field.default)
            typer.echo(f"  {field.name} = {_display_value(field, value)}")

    field_name = questionary.text("Field to edit (name, blank to cancel)").ask()
    if not field_name:
        return

    field_name = field_name.strip().upper()
    field = schema.FIELDS_BY_NAME.get(field_name)
    if field is None:
        typer.echo(f"Unknown field: {field_name}")
        raise typer.Exit(code=1)

    if field.name in schema.DERIVED_FIELDS:
        typer.echo(
            f"{field.name} is auto-derived from DOMAIN/HTTP_PORT and can't be "
            "edited directly. Change one of those fields instead."
        )
        return

    if field.kind == "secret":
        confirmed = questionary.confirm(f"Regenerate {field.name}?", default=True).ask()
        if not confirmed:
            return
        apply.regenerate_secret(field.name)
        typer.echo(f"{field.name} regenerated. Backend restart attempted.")
        return

    if field.kind == "secret_input":
        new_value = questionary.password(f"{field.name} (blank to keep current)").ask()
        if not new_value:
            typer.echo("No change.")
            return
    else:
        new_value = _prompt_value(field, current.get(field.name, field.default))
        if new_value is None:
            return

    try:
        _updated, services, recreate_services, changed_keys = apply.write_settings_update(
            {field.name: new_value}
        )
    except validate.ValidationError as exc:
        typer.echo(f"Error: {exc}")
        raise typer.Exit(code=1)
    if not changed_keys:
        typer.echo("No change.")
        return

    typer.echo(f"{field.name} updated.")
    if recreate_services:
        typer.echo("Re-run `./install.sh` (or `install.ps1`) to apply this.")
    if services:
        restart_now = questionary.confirm(
            f"Restart affected service(s) ({', '.join(services)}) now?", default=True
        ).ask()
        if restart_now:
            restarted = apply.restart_services(services)
            typer.echo(
                f"Restarted: {', '.join(restarted) if restarted else 'none (no matching container found)'}"
            )


if __name__ == "__main__":
    app()
