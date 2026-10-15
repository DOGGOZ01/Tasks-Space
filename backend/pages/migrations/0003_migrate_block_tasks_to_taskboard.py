from django.db import migrations


def _merge_tasks_by_date(target, incoming):
    for date_key, tasks in incoming.items():
        if not isinstance(date_key, str) or not isinstance(tasks, list):
            continue
        if date_key in target:
            target[date_key] = target[date_key] + tasks
        else:
            target[date_key] = tasks


def migrate_task_data(apps, schema_editor):
    Page = apps.get_model("pages", "Page")
    TaskBoard = apps.get_model("pages", "TaskBoard")

    for page in Page.objects.all():
        layout = page.layout or {}
        daily, weekly = {}, {}

        for node in layout.values():
            if not isinstance(node, dict):
                continue
            props = node.get("props")
            if not isinstance(props, dict):
                continue
            tasks_by_date = props.get("tasksByDate")
            if not isinstance(tasks_by_date, dict):
                continue

            display_name = node.get("displayName")
            if display_name == "DailyTaskListBlock":
                _merge_tasks_by_date(daily, tasks_by_date)
            elif display_name == "WeeklyTaskListBlock":
                _merge_tasks_by_date(weekly, tasks_by_date)

        if not daily and not weekly:
            continue

        board, _ = TaskBoard.objects.get_or_create(owner_id=page.owner_id)
        if daily:
            merged = dict(board.daily_tasks or {})
            _merge_tasks_by_date(merged, daily)
            board.daily_tasks = merged
        if weekly:
            merged = dict(board.weekly_tasks or {})
            _merge_tasks_by_date(merged, weekly)
            board.weekly_tasks = merged
        board.save()


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("pages", "0002_taskboard"),
    ]

    operations = [
        migrations.RunPython(migrate_task_data, noop_reverse),
    ]
