def apply_migration_lambdai(project_state: 'ProjectState', schema_editor: 'DatabaseSchemaEditor', operation: 'CreateModel', app_label: str, atomic: bool, atomic_obj):
    """
    Take a project_state representing all migrations prior to this one
    and a schema_editor for a live database and apply the migration operation in a forwards order with app_label

    Return the resulting project state for efficient reuse by following
    Migrations.
    
    If flag atomic and operation is atomic, wrap the operation in a transaction using atomic_obj
    """
    from django.db.migrations.state import ProjectState
    from django.db.backends.sqlite3.schema import DatabaseSchemaEditor
    from django.db.migrations.operations.models import CreateModel
    
    def apply_operation():
        # Apply the operation to the project state first
        new_state = project_state.clone()
        operation.state_forwards(app_label, new_state)
        # Apply the operation to the database using the new state
        operation.database_forwards(app_label, schema_editor, project_state, new_state)
        return new_state

    if atomic and operation.atomic:
        with atomic_obj(schema_editor.connection.alias):
            return apply_operation()
    else:
        return apply_operation()