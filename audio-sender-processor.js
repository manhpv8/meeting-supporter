class AudioSenderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input.length > 0 && input[0].length > 0) {
      this.port.postMessage({ audioData: input[0].slice() });
    }
    return true; // Keep the processor alive
  }
}

registerProcessor('audio-sender-processor', AudioSenderProcessor);