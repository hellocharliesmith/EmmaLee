export function divisionSeconds(div: string, bpm: number): number {
  const beat = 60 / bpm;
  switch (div) {
    case '1/16': return beat / 4;
    case '1/8':  return beat / 2;
    case 'd1/8': return beat * 0.75;
    case '1/4':  return beat;
    default:     return beat / 2;
  }
}
