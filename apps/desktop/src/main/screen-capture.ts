import { desktopCapturer } from 'electron';

export class ScreenCaptureService {
  private stream: MediaStream | null = null;
  private activeMonitorId = 0;

  async start(): Promise<MediaStream> {
    if (this.stream) return this.stream;

    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    const source = sources[this.activeMonitorId] ?? sources[0];
    if (!source) throw new Error('No screen source available');

    const stream = await (navigator.mediaDevices as any).getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 30,
        },
      },
    }) as MediaStream;

    this.stream = stream;
    return stream;
  }

  stop(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
  }

  setActiveMonitor(monitorId: number): void {
    this.activeMonitorId = monitorId;
    if (this.stream) {
      this.stop();
      this.start();
    }
  }

  getStream(): MediaStream | null {
    return this.stream;
  }
}
