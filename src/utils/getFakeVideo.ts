import { supabase } from './supabase';

interface VideoResponse {
  nextVideoUrl: string | null;
  lastPlayedUrl: string | null;
}

export async function getFakeVideo(
  country: string,
  gender: string,
  lastPlayedUrl: string | null = null,
  watchedVideos: string[] = []
): Promise<VideoResponse> {
  // Fake video sistemi askıya alındı
  return { nextVideoUrl: null, lastPlayedUrl: null };

  // Aşağıdaki kod askıya alındı
  console.log('Fetching video for:', { country, gender });
  console.log('Last played URL:', lastPlayedUrl);
  console.log('Total watched videos:', watchedVideos.length);

  const { data, error } = await supabase
    .from('fake_videos')
    .select('*')
    .eq('country', country)
    .eq('gender', gender);

  if (error || !data || data.length === 0) {
    console.error('No fake video found:', error);
    console.log('Available videos:', data);
    return { nextVideoUrl: null, lastPlayedUrl: null };
  }

  console.log('Total available videos:', data.length);

  // If all videos have been watched, reset the watched list
  if (watchedVideos.length >= data.length) {
    console.log('All videos have been watched, resetting watch history');
    watchedVideos = [];
  }

  // Filter out watched videos
  const availableVideos = data.filter(v => !watchedVideos.includes(v.video_url));
  console.log('Videos available after filtering:', availableVideos.length);

  // Select a random video from the available ones
  const randomIndex = Math.floor(Math.random() * availableVideos.length);
  const videoPath = availableVideos[randomIndex].video_url;

  console.log('Selected video path:', videoPath);

  // Construct the full URL
  const nextVideoUrl = `https://jinaxmlrcuycakepxdth.supabase.co/storage/v1/object/public/fakevideos/${videoPath}`;
  console.log('Full video URL:', nextVideoUrl);

  return { nextVideoUrl, lastPlayedUrl: videoPath };
}