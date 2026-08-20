from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pages', '0010_renderpreview'),
    ]

    operations = [
        migrations.AddField(
            model_name='page',
            name='date_format',
            field=models.CharField(
                choices=[('MDY', 'Month/Day/Year'), ('DMY', 'Day/Month/Year')],
                default='MDY',
                max_length=3,
            ),
        ),
    ]
