-- Google Calendar event id, so a Meet conference can be created once per
-- booking and later cancelled or moved on a reschedule.
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "googleEventId" TEXT;
