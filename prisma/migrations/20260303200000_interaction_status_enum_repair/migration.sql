-- Repair migration: ensure InteractionStatus enum exists and status column uses it without data loss.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'InteractionStatus'
  ) THEN
    CREATE TYPE "public"."InteractionStatus" AS ENUM ('WATCHED', 'ALREADY_SEEN', 'SKIPPED', 'WANT_TO_WATCH');
  END IF;
END $$;

DO $$
DECLARE
  status_udt TEXT;
BEGIN
  SELECT udt_name
    INTO status_udt
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'UserMovieInteraction'
    AND column_name = 'status';

  IF status_udt IS NOT NULL AND status_udt <> 'InteractionStatus' THEN
    EXECUTE '
      ALTER TABLE "UserMovieInteraction"
      ALTER COLUMN "status" TYPE "public"."InteractionStatus"
      USING (
        CASE UPPER("status")
          WHEN ''WATCHED'' THEN ''WATCHED''::"public"."InteractionStatus"
          WHEN ''ALREADY_SEEN'' THEN ''ALREADY_SEEN''::"public"."InteractionStatus"
          WHEN ''SKIPPED'' THEN ''SKIPPED''::"public"."InteractionStatus"
          WHEN ''WANT_TO_WATCH'' THEN ''WANT_TO_WATCH''::"public"."InteractionStatus"
          ELSE ''SKIPPED''::"public"."InteractionStatus"
        END
      )
    ';
  END IF;
END $$;
