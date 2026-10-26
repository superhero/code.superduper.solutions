// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
/** AO's 16 kHz / 250 ms capture protocol, with ownership and flush acknowledgement. */
export class SpeechCapture {
  private stream: MediaStream | undefined;
  private context: AudioContext | undefined;
  private source: MediaStreamAudioSourceNode | undefined;
  private node: AudioWorkletNode | undefined;
  private closed = false;
  private flushed: (() => void) | undefined;
  async start(workletURL: string, chunk: (pcm: Float32Array) => void, interrupted: () => void): Promise<MediaTrackSettings> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
    if (this.closed) { stream.getTracks().forEach(track => track.stop()); throw new Error('Recording cancelled.'); }
    this.stream = stream;
    for (const track of stream.getAudioTracks()) track.onended = interrupted;
    try {
      const context = this.context = new AudioContext({ sampleRate: 16000 });
      if (context.sampleRate !== 16000) throw new Error('This browser cannot capture at 16 kHz.');
      await context.audioWorklet.addModule(workletURL);
      if (this.closed) throw new Error('Recording cancelled.');
      await context.resume();
      if (this.closed) throw new Error('Recording cancelled.');
      const node = this.node = new AudioWorkletNode(context, 'pcm-capture');
      node.port.onmessage = ({ data }: MessageEvent<{ type: string; pcm?: Float32Array }>) => {
        if (this.closed) return;
        if (data.type === 'pcm' && data.pcm) chunk(data.pcm);
        else if (data.type === 'flushed') this.flushed?.();
      };
      this.source = context.createMediaStreamSource(stream);
      this.source.connect(node); node.connect(context.destination); // worklet output is silence
      return stream.getAudioTracks()[0]?.getSettings() ?? {};
    } catch (error) { this.close(); throw error; }
  }
  async stop(): Promise<void> {
    if (this.closed) return;
    this.source?.disconnect();
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    try {
      if (this.node) await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { this.flushed = undefined; reject(new Error('Microphone flush timed out.')); }, 3000);
        this.flushed = () => { clearTimeout(timer); this.flushed = undefined; resolve(); };
        this.node!.port.postMessage('flush');
      });
    } finally { this.close(); }
  }
  close(): void {
    if (this.closed) return; this.closed = true;
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.source?.disconnect(); this.node?.disconnect();
    if (this.node) { this.node.port.onmessage = null; this.node.port.close(); }
    void this.context?.close().catch(() => {});
  }
}
