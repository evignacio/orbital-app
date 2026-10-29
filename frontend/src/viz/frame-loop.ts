/** Um laço de animação ligado: `stop` o desliga. */
export interface FrameLoop {
  stop: () => void;
}

/**
 * Chama `tick` a cada quadro do navegador até `stop`. Sem relógio próprio: o
 * navegador pausa e retoma o laço com a aba, e quem anima lê o tempo do
 * MotionClock. Um relógio global ajustado por setInterval se desajusta com a
 * aba escondida e pode deixar a animação quase um minuto sem quadro ao voltar.
 */
export function frameLoop(tick: () => void): FrameLoop {
  let id = requestAnimationFrame(function loop() {
    // Agendado antes do tick: um erro num quadro não para a animação, e um stop no meio do quadro cancela este id.
    id = requestAnimationFrame(loop);
    tick();
  });
  return {
    stop: () => {
      cancelAnimationFrame(id);
    },
  };
}
