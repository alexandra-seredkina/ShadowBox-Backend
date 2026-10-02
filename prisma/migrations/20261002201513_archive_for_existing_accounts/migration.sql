-- A new enum value can only be used once the migration that added it has committed.
INSERT INTO "folders" ("account_id", "kind", "system_role", "updated_at")
SELECT "id", 'system', 'archive', now()
FROM "accounts"
ON CONFLICT ("account_id", "system_role") DO NOTHING;
