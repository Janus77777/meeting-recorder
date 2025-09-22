declare module 'ffmpeg-static' {
  const path: string;
  export default path;
}

declare module 'ffprobe-static' {
  interface FFProbeStatic {
    path: string;
  }

  const ffprobe: FFProbeStatic;
  export default ffprobe;
}
