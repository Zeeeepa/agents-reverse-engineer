# Feature: Task Due Dates

Add due date functionality to this NestJS + React TODO application. Follow the existing project patterns and conventions throughout.

## Backend Requirements

1. **Due Date Field** — Add a `dueDate` column to the existing `TodoEntity`:
   - Type: `datetime`, nullable (not all tasks need a due date)
   - Include `@ApiProperty()` decorator matching existing field patterns
   - Update the entity constructor to handle the new field

2. **DTOs** — Update the existing DTOs:
   - `CreateTodoDto`: add optional `dueDate` field with `@IsOptional()` and `@IsDateString()` validators
   - `UpdateTodoDto`: add optional `dueDate` field with the same validators

3. **Overdue Endpoint** — Add a new endpoint to the existing `TodoController`:
   - `GET /api/v1/tasks/overdue` — returns all tasks where `dueDate` is in the past and `isDone` is 0
   - Implement the query in `TodoService` using a QueryBuilder or `LessThan(new Date())` filter

4. **Register** any new imports in the existing modules (no new modules needed).

## Frontend Requirements

1. **Interface Update** — Add `dueDate?: string` to the existing `ITodo` interface.

2. **Date Input** — Add a date input field to the task creation form so users can optionally set a due date when creating a task.

3. **Due Date Display** — Show the due date on task items in the list. Tasks that are overdue (past due and not done) should have a visual indicator (red text, badge, or similar).

4. **Service Update** — Update `TodoService` to pass `dueDate` in create and update API calls.

## Constraints

- Use TypeScript throughout (both backend and frontend)
- Follow existing project patterns (decorators, module structure, component style)
- Backend must compile: run `npx tsc --noEmit` in the backend directory and fix any type errors
- Do NOT modify the database configuration or add migrations — TypeORM will auto-sync
- Do NOT create new NestJS modules — extend the existing TodoModule
