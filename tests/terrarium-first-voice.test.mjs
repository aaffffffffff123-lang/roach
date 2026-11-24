import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const tank = read('bamung.html');
const page = read('index.html');

function section(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'Missing game code: ' + start);
  return source.slice(a, b);
}

// 실제 입장·표어·대사 핸들러를 쓰되 GPU와 스피커 없이 입력 잠금과 재개 순서를 재현한다.
function tankSession() {
  let inGesture = false;
  let engine;
  const voices = [];
  class Audio extends EventTarget {
    constructor() { super(); engine = this; this.state = 'suspended'; this.sampleRate = 8000; }
    createGain() { return { gain: {}, connect() {} }; }
    createBuffer(n, length) { return { getChannelData: () => new Float32Array(length) }; }
    async suspend() { this.state = 'suspended'; }
    async resume() {
      if (inGesture && this.state !== 'running') {
        this.state = 'running';
        this.dispatchEvent(new Event('statechange'));
      }
    }
  }
  const plaque = Object.assign(new EventTarget(), {
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; queueMicrotask(() => this.dispatchEvent(new Event('close'))); }
  });
  const noop = () => {};
  const scope = {
    window: { AudioContext: Audio, addEventListener: noop }, document: { hidden: false },
    EV: {}, frame: noop, requestAnimationFrame: () => 1, cancelAnimationFrame: noop,
    refreshResidents: noop, wakeUi: noop, resize: noop, camAway: () => true, checkAges: noop, refreshHud: noop,
    stopFollow: noop, holdScreen: noop, arrive: () => ({id:'p',rec:{no:1},name:'첫째'}),
    mailOpen: false, petPlaque: plaque, playPetDrums: noop, performance, near: () => 1,
    speak(ctx, out, text, voice, opts) {
      assert.equal(ctx.state, 'running');
      voices.push({ text, elapsed: opts.elapsed ?? 0 });
      return { stop: noop };
    }
  };
  const code = [
    'let awake=false, paused=false, raf=0, last=0, toldGone=null, onEntryDrawn=null, lastLetterAt=0; const api={};',
    section(tank, 'const SFX=', '/** 카메라'),
    section(tank, 'function wake(){', 'function sleep(){'),
    section(tank, 'function pause(){', 'function reset(){'),
    section(tank, 'function bubbleVoice(', 'EV.talkDone='),
    section(page, 'function showPetPlaque(', '// 상식은'),
    '({enter,pause,resume,showPetPlaque})'
  ].join('\n');
  const api = runInNewContext(code, scope);
  const line = { i: 0, lines: ['첫마디'], lineT: 0 };
  return {
    api, voices, line, engine: () => engine,
    say: () => scope.EV.talkLine(line, { voice: {}, pos: null }),
    stop: () => scope.EV.talkStop(),
    dismiss(event) {
      inGesture = true;
      try { plaque.dispatchEvent(new Event(event, { cancelable: true })); }
      finally { inGesture = false; }
    }
  };
}

for (const [route, arrival, event] of [['둘러보기', null, 'click'], ['컵으로 데려오기', {name:'첫째'}, 'cancel']]) {
  test(route + ' 직후 어항을 더 누르지 않아도 첫 음절부터 재생', async () => {
    const s = tankSession();
    s.api.enter({arrive: arrival});
    assert.equal(s.engine().state, 'suspended');
    let closes = 0;
    s.api.showPetPlaque(() => { closes++; s.api.resume(); });
    s.api.pause();
    s.dismiss(event);
    await Promise.resolve();
    assert.equal(closes, 1);
    s.say();
    assert.deepEqual(s.voices, [{text:'첫마디',elapsed:0}]);
  });
}

test('오디오가 늦게 열리면 현재 줄의 박자만 따라가고 취소된 줄은 재생하지 않는다', () => {
  const s = tankSession();
  s.api.enter();
  s.say(); s.stop(); s.say();
  s.line.lineT = 0.21;
  assert.equal(s.voices.length, 0);
  s.engine().state = 'running';
  s.engine().dispatchEvent(new Event('statechange'));
  s.engine().dispatchEvent(new Event('statechange'));
  assert.deepEqual(s.voices, [{text:'첫마디',elapsed:0.21}]);
});
