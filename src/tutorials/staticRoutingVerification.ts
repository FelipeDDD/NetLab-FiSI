import { useStore } from '../store';

export interface StaticVerificationPresentation {
  begin(): () => void;
  ready(): boolean;
}

/** Uses the existing visual player; never advances protocol time. */
export const staticVerificationPresentation: StaticVerificationPresentation = {
  begin() {
    const previous = useStore.getState().packetAnimationSpeed;
    useStore.getState().setPacketAnimationSpeed(2);
    if (useStore.getState().guidedPacket.playback.status === 'paused') useStore.getState().toggleGuidedPlayback();
    if (useStore.getState().pauseReason === 'activation') useStore.getState().setPaused(false);
    return () => useStore.getState().setPacketAnimationSpeed(previous);
  },
  ready() {
    const state = useStore.getState(), { observation, playback } = state.guidedPacket;
    return !state.paused && (!observation.session || observation.sourceFinished &&
      (playback.status === 'finished' || !playback.hops.length));
  },
};
