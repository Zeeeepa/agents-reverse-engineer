# Feature: Tags/Labels System

Implement a Tags/Labels system for this NestJS + React TODO application. Follow the existing project patterns and conventions throughout.

## Backend Requirements

1. **Tag Entity** — Create a `Tag` entity with fields:
   - `id` (auto-generated primary key)
   - `name` (string, unique, max 50 chars)
   - `color` (string, hex color code, default `#3b82f6`)

2. **Many-to-Many Relation** — Add a many-to-many relationship between `Tag` and the existing `Task` entity using a `@JoinTable()`.

3. **Tag Module** — Create a `TagModule` with:
   - `TagController` with CRUD endpoints:
     - `GET /tags` — list all tags
     - `POST /tags` — create tag (body: `{ name, color? }`)
     - `GET /tags/:id` — get tag by id
     - `PATCH /tags/:id` — update tag
     - `DELETE /tags/:id` — delete tag
     - `POST /tags/:id/tasks/:taskId` — assign tag to task
     - `DELETE /tags/:id/tasks/:taskId` — remove tag from task
   - `TagService` with corresponding business logic

4. **DTOs** — Create validation DTOs (`CreateTagDto`, `UpdateTagDto`) with `class-validator` decorators matching existing DTO patterns.

5. **Register** the `TagModule` in `AppModule`.

## Frontend Requirements

1. **TagBadge Component** — A small pill/badge component that displays a tag's name with its color as background.

2. **TagManager Component** — A component for creating and managing tags (list, create, delete).

3. **Tag Display on Task Cards** — Show assigned tags on existing task card components using `TagBadge`.

4. **Tag Assignment UI** — Allow assigning/removing tags from tasks (dropdown, multi-select, or similar).

## Constraints

- Use TypeScript throughout (both backend and frontend)
- Follow existing project patterns (decorators, module structure, component style)
- Backend must compile: run `npx tsc --noEmit` in the backend directory and fix any type errors
- Do NOT modify the database configuration or add migrations — TypeORM will auto-sync
