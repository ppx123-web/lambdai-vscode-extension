def append_operation_description_lambdai(operation: 'CreateModel', schema_editor: 'DatabaseSchemaEditor', reduces_to_sql_string: str):
    """
    Append the string of operation's describe to the collected_sql of schema_editor in the following format:

    --
    -- operation's description
    --
    -- reduces_to_sql_string if operation.reduces_to_sql is False

    Each line is appended separately.
    """
    from django.db.migrations.operations.models import CreateModel
    from django.db.backends.sqlite3.schema import DatabaseSchemaEditor
    
    description = operation.describe()
    lines = [
        "--",
        f"-- {description}",
        "--"
    ]
    if not operation.reduces_to_sql:
        lines.append(f"-- {reduces_to_sql_string}")
    
    for line in lines:
        schema_editor.collected_sql.append(line)