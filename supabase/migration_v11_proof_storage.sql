-- ============================================================
-- V11: Proof Files Storage Bucket
-- Enables photo, video, PDF, and audio uploads as proof of work
-- ============================================================

-- Create storage bucket for proof files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'proof-files',
  'proof-files',
  true,
  10485760, -- 10MB limit per file
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
    'application/pdf',
    'video/mp4', 'video/quicktime',
    'audio/mpeg', 'audio/mp4'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload to their own folder (user_id/filename)
CREATE POLICY "Users can upload proof files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'proof-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: anyone authenticated can view proof files
CREATE POLICY "Anyone can view proof files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'proof-files');

-- RLS: users can delete their own files
CREATE POLICY "Users can delete own proof files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'proof-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
