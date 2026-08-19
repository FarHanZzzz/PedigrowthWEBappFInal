-- ============================================================
-- Hackathon clip storage so results can play the video on any device
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('hackathon_videos', 'hackathon_videos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public read hackathon videos" ON storage.objects;
CREATE POLICY "Public read hackathon videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'hackathon_videos');

DROP POLICY IF EXISTS "Public upload hackathon videos" ON storage.objects;
CREATE POLICY "Public upload hackathon videos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'hackathon_videos');

DROP POLICY IF EXISTS "Public update hackathon videos" ON storage.objects;
CREATE POLICY "Public update hackathon videos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'hackathon_videos')
  WITH CHECK (bucket_id = 'hackathon_videos');
